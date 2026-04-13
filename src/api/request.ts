import axios, {
  CanceledError,
  type AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toast } from 'vue-sonner'
import {
  API_BASE,
  getAccessToken,
  isAuthenticationError,
  isLoginRequest,
  refreshAccessToken,
  SessionExpiredError,
} from '@/utils/authSession'

export { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/utils/authSession'

// API response structure
// 文档约定：所有接口都可能返回 HTTP 200，业务是否成功必须以 code 判断。
export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  data: T
}

export class ApiBusinessError extends Error {
  readonly data: unknown

  constructor(message: string, data?: unknown) {
    super(message)
    this.data = data
    this.name = 'ApiBusinessError'
  }
}

// 瞬时失败最多再试 1 次（仅幂等 GET/HEAD）
const MAX_TRANSIENT_RETRIES = 1
const TRANSIENT_RETRY_DELAY_MS = 120

// Create axios instance
const request: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

const normalizeApiMessage = (msg: unknown): string => {
  return typeof msg === 'string' ? msg : ''
}

const isCaptchaBusinessError = (msg: string): boolean => {
  const lowerMsg = msg.toLowerCase()
  return lowerMsg.includes('验证码') || lowerMsg.includes('captcha')
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

// 同一请求最多重放一次；迟到的旧 AT 响应会复用已经刷新的 Token。
const retryAuthentication = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  let token: string
  try {
    if (config.signal?.aborted) throw new CanceledError()
    if (config._authRetry || isLoginRequest(config.url)) {
      throw new ApiBusinessError('登录状态验证失败，请重试')
    }
    config._authRetry = true
    const authorization = config.headers.Authorization
    const failedToken =
      typeof authorization === 'string' ? authorization.replace(/^Bearer /, '') : ''
    token = await refreshAccessToken(failedToken)
    if (config.signal?.aborted) throw new CanceledError()
  } catch (error) {
    if (axios.isCancel(error)) throw error
    // 持有凭据失效由 App 的会话事件提示一次；访客仍需收到登录入口与提示。
    if (error instanceof SessionExpiredError) {
      if (!error.notified) {
        window.dispatchEvent(new CustomEvent('auth:login-required'))
        if (!config.silent) toast.error(error.message)
      }
    } else if (!config.silent) {
      const message = axios.isAxiosError(error)
        ? getTransportErrorMessage(error)
        : error instanceof Error
          ? error.message
          : '请求失败'
      toast.error(message)
    }
    throw error
  }
  config.headers.Authorization = `Bearer ${token}`
  // 重放请求的失败由自身拦截器提示，避免被外层再提示一次。
  return request(config)
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
      const captchaErrorMsg = normalizedMsg
      if (!response.config?.silent) {
        toast.error(captchaErrorMsg)
      }
      return Promise.reject(new ApiBusinessError(captchaErrorMsg, data))
    }

    if (
      code === 1 &&
      isAuthenticationError(normalizedMsg) &&
      !isLoginRequest(response.config.url)
    ) {
      return retryAuthentication(response.config)
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
    return Promise.reject(new ApiBusinessError(normalizedMsg || '请求失败', data))
  },
  async (error: AxiosError) => {
    const config = error.config

    if (error.response?.status === 401 && config && !isLoginRequest(config.url)) {
      return retryAuthentication(config)
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
    if (error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }

    const body = error.response?.data as ApiResponse | undefined
    // 代理也可能返回 code: 1；保留传输错误类型，供上传重试和降级使用。
    if (
      !isTransientTransportError(error) &&
      body &&
      typeof body === 'object' &&
      body.code === 1 &&
      typeof body.msg === 'string'
    ) {
      if (!config?.silent) toast.error(body.msg)
      return Promise.reject(new ApiBusinessError(body.msg, body.data))
    }

    error.message = getTransportErrorMessage(error)
    if (!config?.silent) toast.error(error.message)
    return Promise.reject(error)
  }
)

export default request
