import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { toast } from 'vue-sonner'

// API response structure
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
const fixLocalhostUrls = (obj: any): any => {
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
    const newObj: any = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = fixLocalhostUrls(obj[key])
      }
    }
    return newObj
  }
  return obj
}

// Response interceptor - handle business code
request.interceptors.response.use(
  async (response: AxiosResponse<ApiResponse>) => {
    const { code, msg, data } = response.data

    // Success
    if (code === 0) {
      return fixLocalhostUrls(data) as AxiosResponse
    }

    // Token expired - check if msg contains token-related keywords
    const tokenKeywords = ['token', 'Token', '登录', '认证', '过期', 'expired', 'unauthorized']
    const isTokenError = tokenKeywords.some((keyword) => msg.includes(keyword))

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
          return Promise.reject(new Error(msg))
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

    // Business error - show toast
    toast.error(msg || '请求失败')
    return Promise.reject(new Error(msg))
  },
  (error) => {
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
