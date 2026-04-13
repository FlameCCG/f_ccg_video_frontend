import axios from 'axios'
import { readonly, shallowRef, ref } from 'vue'

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

const ACCESS_KEY = 'accessToken'
const REFRESH_KEY = 'refreshToken'
export const API_BASE = (import.meta.env.VITE_API_BASE || '/v1').replace(/\/$/, '')
const REFRESH_LOCK = 'ccg-client-token-refresh'

const readTokens = () => ({
  accessToken: localStorage.getItem(ACCESS_KEY),
  refreshToken: localStorage.getItem(REFRESH_KEY),
})
const state = shallowRef(readTokens())
export const authTokens = readonly(state)
export const isRefreshingTokens = ref(false)

export function syncAuthTokens(): void {
  const next = readTokens()
  if (
    next.accessToken !== state.value.accessToken ||
    next.refreshToken !== state.value.refreshToken
  ) {
    state.value = next
  }
}

export function getAccessToken(): string | null {
  syncAuthTokens()
  return state.value.accessToken
}

export function getRefreshToken(): string | null {
  syncAuthTokens()
  return state.value.refreshToken
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  syncAuthTokens()
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  syncAuthTokens()
}

window.addEventListener('storage', (event) => {
  if (event.key === null || event.key === ACCESS_KEY || event.key === REFRESH_KEY) syncAuthTokens()
})

export class SessionExpiredError extends Error {
  readonly notified: boolean

  constructor(message = '登录已过期，请重新登录', notified = false) {
    super(message)
    this.name = 'SessionExpiredError'
    this.notified = notified
  }
}

let onExpired = (message: string) => {
  window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { message } }))
}

export function setSessionExpiredHandler(handler: (message: string) => void): void {
  onExpired = handler
}

function expireSession(message?: string): SessionExpiredError {
  const hadTokens = !!getAccessToken() || !!getRefreshToken()
  clearTokens()
  const error = new SessionExpiredError(message || (hadTokens ? undefined : '请先登录'), hadTokens)
  if (hadTokens) onExpired(error.message)
  return error
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true
  try {
    const part = token.split('.')[1]
    if (!part) return true
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: unknown
    }
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now() + 5000
  } catch {
    return true
  }
}

// 仅识别身份校验失败；验证码 token、AI token 额度等业务错误不能触发刷新。
export function isAuthenticationError(message: unknown): boolean {
  if (typeof message !== 'string') return false
  return /token invalid or account unavailable|invalid (access )?token|token.*(?:expired|invalid|过期|失效)|unauthorized|请先登录|未登录|(?:登录|认证).*(?:过期|失效)/i.test(
    message
  )
}

export function isLoginRequest(url = ''): boolean {
  return /\/user\/login\/|\/captcha\//.test(url)
}

export function sessionIdentity(token: string | null): string | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      uid?: string
      sid?: string
    }
    return claims.uid && claims.sid ? `${claims.uid}:${claims.sid}` : null
  } catch {
    return null
  }
}

function currentPair(expectedAccess?: string | null): AuthTokens {
  const accessToken = getAccessToken()
  const refreshToken = getRefreshToken()
  if (!accessToken || !refreshToken) throw new Error('登录状态已变化，请重试')
  if (
    expectedAccess &&
    accessToken !== expectedAccess &&
    (!sessionIdentity(expectedAccess) ||
      sessionIdentity(expectedAccess) !== sessionIdentity(accessToken))
  ) {
    throw new Error('登录状态已变化，请重试')
  }
  return { accessToken, refreshToken }
}

// 只有明确拒绝凭据的响应才能清理会话；未知业务失败保留 RT 供稍后重试。
function isTerminalRefreshFailure(message: string): boolean {
  return (
    isAuthenticationError(message) ||
    /refresh\s*token.*(?:无效|失效|过期|invalid|expired|reused)|用户不存在|account is banned|账号.*封禁/i.test(
      message
    )
  )
}

function refreshFailureMessage(message: string): string | undefined {
  return /用户不存在|account is banned|账号.*封禁/i.test(message) ? message : undefined
}

let pending: { refreshToken: string; promise: Promise<AuthTokens> } | null = null

async function rotate(expectedRefresh: string, failedAccess?: string | null): Promise<AuthTokens> {
  const currentRefresh = getRefreshToken()
  // 等待跨标签页锁时，其他请求可能已经刷新、退出或切换了账号。
  if (currentRefresh !== expectedRefresh) return currentPair(failedAccess)
  if (failedAccess && getAccessToken() !== failedAccess) return currentPair(failedAccess)
  if (!currentRefresh) throw expireSession()

  let response
  try {
    response = await axios.post<{ code: number; msg?: string; data?: AuthTokens }>(
      API_BASE + '/common/user/login/refresh',
      { refreshToken: currentRefresh },
      { timeout: 15000 }
    )
  } catch (error) {
    if (getRefreshToken() !== currentRefresh) return currentPair(failedAccess)
    if (
      axios.isAxiosError<{ msg?: unknown }>(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      const message = error.response?.data?.msg
      throw expireSession(typeof message === 'string' ? refreshFailureMessage(message) : undefined)
    }
    // 临时网络故障不删除仍可能有效的 RT。
    throw error
  }
  if (getRefreshToken() !== currentRefresh) return currentPair(failedAccess)
  if (response.data?.code !== 0) {
    const message = typeof response.data?.msg === 'string' ? response.data.msg : ''
    if (isTerminalRefreshFailure(message)) throw expireSession(refreshFailureMessage(message))
    throw new Error(message || '刷新登录状态失败，请稍后重试')
  }
  const pair = response.data.data
  if (
    !pair ||
    typeof pair.accessToken !== 'string' ||
    !pair.accessToken ||
    typeof pair.refreshToken !== 'string' ||
    !pair.refreshToken
  ) {
    throw new Error('刷新登录状态失败，请稍后重试')
  }
  setTokens(pair.accessToken, pair.refreshToken)
  return pair
}

// HTTP、SSE、WebSocket 和手动刷新共用；Web Locks 防止多个标签页重放一次性 RT。
export function refreshTokens(failedAccess?: string | null): Promise<AuthTokens> {
  if (failedAccess && getAccessToken() && getAccessToken() !== failedAccess) {
    try {
      return Promise.resolve(currentPair(failedAccess))
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }
  const refreshToken = getRefreshToken()
  const expectedAccess = failedAccess ?? getAccessToken()
  if (!refreshToken) {
    return Promise.reject(expireSession())
  }
  if (pending?.refreshToken === refreshToken) return pending.promise

  const entry = {
    refreshToken,
    promise: Promise.resolve().then(async () =>
      typeof navigator !== 'undefined' && navigator.locks
        ? await navigator.locks.request(REFRESH_LOCK, () => rotate(refreshToken, expectedAccess))
        : rotate(refreshToken, expectedAccess)
    ),
  }
  pending = entry
  isRefreshingTokens.value = true
  entry.promise = entry.promise.finally(() => {
    if (pending === entry) {
      pending = null
      isRefreshingTokens.value = false
    }
  })
  return entry.promise
}

export async function refreshAccessToken(failedAccess?: string | null): Promise<string> {
  return (await refreshTokens(failedAccess)).accessToken
}

export async function ensureAccessToken(): Promise<string | null> {
  const token = getAccessToken()
  if (token && !isTokenExpired(token)) return token
  if (!token && !getRefreshToken()) return null
  return refreshAccessToken(token)
}
