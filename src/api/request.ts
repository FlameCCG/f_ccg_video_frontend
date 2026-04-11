import axios, {
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
  baseURL: '/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Flag to prevent multiple refresh token requests
let isRefreshing = false
let refreshSubscribers: Array<(token: string | null) => void> = []

const subscribeTokenRefresh = (callback: (token: string | null) => void): void => {
  refreshSubscribers.push(callback)
}

const onTokenRefreshed = (token: string | null): void => {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
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

// Refresh token function
const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return null
  }

  try {
    const response = await axios.post<ApiResponse<{ accessToken: string; refreshToken: string }>>(
      '/v1/common/user/login/refresh',
      { refreshToken }
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
          // Refresh failed - clear tokens and redirect to login
          isRefreshing = false
          onTokenRefreshed(null) // Reject pending requests
          clearTokens()
          window.dispatchEvent(new CustomEvent('auth:login-required'))
          return Promise.reject(new Error(normalizedMsg || '登录已过期，请重新登录'))
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

    // Business error - show toast unless caller opted into silent mode
    if (!response.config?.silent) {
      toast.error(normalizedMsg || '请求失败')
    }
    return Promise.reject(new Error(normalizedMsg || '请求失败'))
  },
  (error) => {
    // Skip toast for silent requests
    if (error.config?.silent) {
      return Promise.reject(error)
    }
    // Network error
    if (error.code === 'ECONNABORTED') {
      toast.error('请求超时，请检查网络连接')
    } else if (!error.response) {
      toast.error('网络错误，请检查连接')
    } else {
      toast.error('服务器错误，请稍后重试')
    }
    return Promise.reject(error)
  }
)

export default request
