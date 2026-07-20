import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toast } from 'vue-sonner'

// API response structure
// 文档约定：所有接口都可能返回 HTTP 200，业务是否成功必须以 code 判断。
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'accessToken'
const REFRESH_TOKEN_KEY = 'refreshToken'

// 开发态可通过 VITE_API_BASE 直连后端，绕过 Vite 代理（例：http://127.0.0.1:8080/v1）
const API_BASE = (import.meta.env.VITE_API_BASE || '/v1').replace(/\/$/, '')

// 瞬时失败最多再试 1 次（仅幂等 GET/HEAD）
const MAX_TRANSIENT_RETRIES = 1
const TRANSIENT_RETRY_DELAY_MS = 120

// Token management
export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY)
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY)
export const setTokens = (accessToken: string, refreshToken: string): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}
export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

// Create axios instance
const request: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Flag to prevent multiple refresh token requests
let isRefreshing = false
let refreshSubscribers: Array<(token: string | null) => void> = []
/** 防止并发请求同时触发多次「会话失效」清理与弹窗 */
let isHandlingSessionExpired = false

const subscribeTokenRefresh = (callback: (token: string | null) => void): void => {
  refreshSubscribers.push(callback)
}

const onTokenRefreshed = (token: string | null): void => {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

/**
 * 会话彻底失效（refresh 失败或无 refresh token）：
 * 清 localStorage token，并通知 UI 同步清 Pinia 登录态（头像等）。
 * 注意：此处不能直接 import auth store，避免与 request 循环依赖。
 */
const handleSessionExpired = (message?: string): void => {
  clearTokens()

  if (isHandlingSessionExpired) {
    return
  }
  isHandlingSessionExpired = true

  // 单一事件：UI 负责 clearAuth + 提示 + 打开登录框（勿再派 login-required，避免双 toast）
  window.dispatchEvent(
    new CustomEvent('auth:session-expired', {
      detail: { message: message || '登录已过期，请重新登录' },
    })
  )

  window.setTimeout(() => {
    isHandlingSessionExpired = false
  }, 1500)
}

const normalizeApiMessage = (msg: unknown): string => {
  return typeof msg === 'string' ? msg : ''
}

const isCaptchaBusinessError = (msg: string): boolean => {
  const lowerMsg = msg.toLowerCase()
  return lowerMsg.includes('验证码') || lowerMsg.includes('captcha')
}

const isTokenBusinessError = (msg: string): boolean => {
  if (!msg) return false

  const tokenKeywords = [
    'token',
    'Token',
    'access token',
    'refresh token',
    'unauthorized',
    'invalid token',
    'expired token',
    '登录已过期',
  ]

  if (tokenKeywords.some((keyword) => msg.includes(keyword))) {
    return true
  }

  return /(登录|认证).*(过期|失效)/.test(msg)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const isIdempotentMethod = (method?: string): boolean => {
  const m = (method || 'get').toLowerCase()
  return m === 'get' || m === 'head' || m === 'options'
}

/**
 * 判断是否为开发代理/瞬时连通性故障（空 body 500/502、ECONNRESET 等）。
 * 业务层约定始终 HTTP 200 + code，因此这类非 JSON 5xx 不应当成“业务服务器错误”。
 */
const isTransientTransportError = (error: AxiosError): boolean => {
  if (!error.response) {
    // 无响应：断连、CORS 失败、浏览器取消以外的网络错误
    return error.code !== 'ERR_CANCELED'
  }

  const status = error.response.status
  if (status !== 500 && status !== 502 && status !== 503 && status !== 504) {
    return false
  }

  // Vite proxy 自定义头，或空/非 JSON body
  const headers = error.response.headers || {}
  if (headers['x-vite-proxy-error'] === '1') {
    return true
  }

  const data = error.response.data
  if (data == null || data === '' || data === '1') {
    return true
  }

  if (typeof data === 'string') {
    const trimmed = data.trim()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return true
    }
    // 我们的代理错误 JSON
    if (trimmed.includes('开发代理无法连接后端') || trimmed.includes('http proxy error')) {
      return true
    }
  }

  if (typeof data === 'object' && data !== null && 'msg' in data) {
    const msg = normalizeApiMessage((data as { msg?: unknown }).msg)
    if (msg.includes('开发代理无法连接后端') || msg.includes('http proxy error')) {
      return true
    }
  }

  return false
}

const getTransportErrorMessage = (error: AxiosError): string => {
  if (error.code === 'ECONNABORTED') {
    return '请求超时，请检查网络连接'
  }

  if (!error.response) {
    return '网络错误，请检查连接或确认后端已启动'
  }

  const data = error.response.data
  if (typeof data === 'object' && data !== null && 'msg' in data) {
    const msg = normalizeApiMessage((data as { msg?: unknown }).msg)
    if (msg) return msg
  }

  if (typeof data === 'string' && data.includes('开发代理')) {
    return data
  }

  if (error.response.status === 502 || isTransientTransportError(error)) {
    return '暂时无法连接后端，请确认后端已启动后重试'
  }

  return '服务器错误，请稍后重试'
}

// Refresh token function
const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return null
  }

  try {
    const response = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      `${API_BASE}/common/user/login/refresh`,
      { refreshToken },
      { timeout: 15000 }
    )

    if (response.data.code === 0) {
      const { accessToken, refreshToken: newRefreshToken } = response.data.data
      setTokens(accessToken, newRefreshToken)
      return accessToken
    }
    return null
  } catch {
    return null
  }
}

// Request interceptor - inject token
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: Error) => {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }
)

// Helper to recursively fix broken localhost URLs in response data from the backend
const fixLocalhostUrls = (obj: unknown): unknown => {
  if (typeof obj === 'string') {
    if (obj.startsWith('http:/localhost:')) {
      return obj.replace('http:/localhost:', 'http://localhost:')
    }
    if (obj.startsWith('https:/localhost:')) {
      return obj.replace('https:/localhost:', 'https://localhost:')
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(fixLocalhostUrls)
  }
  if (obj !== null && typeof obj === 'object') {
    const newObj: Record<string, unknown> = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = fixLocalhostUrls((obj as Record<string, unknown>)[key])
      }
    }
    return newObj
  }
  return obj
}

// Response interceptor - handle business code
// 统一按文档规则处理：code === 0 为成功，code === 1 为业务失败，错误文案在 msg。
request.interceptors.response.use(
  async (response: AxiosResponse<ApiResponse>) => {
    // 代理错误时可能返回非标准 body；有 code 字段才走业务分支
    if (!response.data || typeof response.data !== 'object' || !('code' in response.data)) {
      return response
    }

    const { code, msg, data } = response.data
    const normalizedMsg = normalizeApiMessage(msg)

    // Success
    if (code === 0) {
      return fixLocalhostUrls(data) as AxiosResponse
    }

    // Captcha business error
    if (code === 1 && isCaptchaBusinessError(normalizedMsg)) {
      const captchaErrorMsg = '验证码错误'
      if (!response.config?.silent) {
        toast.error(captchaErrorMsg)
      }
      return Promise.reject(new Error(captchaErrorMsg))
    }

    // Token expired - check if msg contains token-related keywords
    const isTokenError = isTokenBusinessError(normalizedMsg)

    if (code === 1 && isTokenError) {
      const originalRequest = response.config

      if (!isRefreshing) {
        isRefreshing = true

        const newToken = await refreshAccessToken()

        if (newToken) {
          isRefreshing = false
          onTokenRefreshed(newToken)

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return request(originalRequest)
        } else {
          // Refresh 失败：清 token + 通知 UI 掉登录态（头像等）
          isRefreshing = false
          onTokenRefreshed(null) // Reject pending requests
          const expiredMsg = normalizedMsg || '登录已过期，请重新登录'
          handleSessionExpired(expiredMsg)
          return Promise.reject(new Error(expiredMsg))
        }
      } else {
        // Wait for token refresh
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string | null) => {
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`
              resolve(request(originalRequest))
            } else {
              reject(new Error('登录已过期，请重新登录'))
            }
          })
        })
      }
    }

    // 代理失败被改写成 502 + code:1 时，给用户可操作的提示
    if (
      code === 1 &&
      (normalizedMsg.includes('开发代理无法连接后端') || normalizedMsg.includes('暂时无法连接后端'))
    ) {
      if (!response.config?.silent) {
        toast.error(normalizedMsg)
      }
      return Promise.reject(new Error(normalizedMsg))
    }

    // Business error - show toast unless caller opted into silent mode
    if (!response.config?.silent) {
      toast.error(normalizedMsg || '请求失败')
    }
    return Promise.reject(new Error(normalizedMsg || '请求失败'))
  },
  async (error: AxiosError) => {
    const config = error.config

    // HTTP 401：按会话失效处理（部分网关/中间层可能直接回 401）
    if (error.response?.status === 401) {
      const expiredMsg = '登录已过期，请重新登录'
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await refreshAccessToken()
        if (newToken && config) {
          isRefreshing = false
          onTokenRefreshed(newToken)
          config.headers = config.headers ?? {}
          config.headers.Authorization = `Bearer ${newToken}`
          return request(config)
        }
        isRefreshing = false
        onTokenRefreshed(null)
        handleSessionExpired(expiredMsg)
      } else if (config) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((token: string | null) => {
            if (token) {
              config.headers = config.headers ?? {}
              config.headers.Authorization = `Bearer ${token}`
              resolve(request(config))
            } else {
              reject(new Error(expiredMsg))
            }
          })
        })
      } else {
        handleSessionExpired(expiredMsg)
      }
      return Promise.reject(new Error(expiredMsg))
    }

    // 幂等请求：瞬时代理/连通故障自动重试 1 次
    if (
      config &&
      isIdempotentMethod(config.method) &&
      isTransientTransportError(error) &&
      (config._retryCount ?? 0) < MAX_TRANSIENT_RETRIES
    ) {
      config._retryCount = (config._retryCount ?? 0) + 1
      await sleep(TRANSIENT_RETRY_DELAY_MS)
      return request(config)
    }

    // Skip toast for silent requests / 用户取消
    if (config?.silent || error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }

    toast.error(getTransportErrorMessage(error))
    return Promise.reject(error)
  }
)

export default request
