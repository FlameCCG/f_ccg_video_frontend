import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import {
  loginByPassword,
  loginByQQ,
  loginByGoogle,
  loginByGithub,
  loginByLinuxDo,
  loginByX,
  refreshToken as refreshTokenApi,
  getCurrentUserInfo,
  type LoginPwdParams,
  type LoginQQParams,
  type LoginGoogleParams,
  type LoginGithubParams,
  type LoginLinuxDoParams,
  type LoginXParams,
  type UserInfo,
  type JwtToken,
} from '@/api/user'
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from '@/api/request'

export const useAuthStore = defineStore(
  'auth',
  () => {
    // State
    const accessToken = ref<string | null>(getAccessToken())
    const refreshTokenValue = ref<string | null>(getRefreshToken())
    const user = ref<UserInfo | null>(null)
    const isLoading = ref(false)

    // Getters
    const isLoggedIn = computed(() => !!accessToken.value)
    const userId = computed(() => user.value?.id ?? null)
    const username = computed(() => user.value?.username ?? '')
    const avatar = computed(() => user.value?.avatar ?? '')
    const level = computed(() => user.value?.level ?? 0)
    const coinCount = computed(() => user.value?.coinCount ?? 0)

    // Actions

    /**
     * 设置 Token
     */
    const setAuthTokens = (tokens: JwtToken) => {
      accessToken.value = tokens.accessToken
      refreshTokenValue.value = tokens.refreshToken
      setTokens(tokens.accessToken, tokens.refreshToken)
    }

    /**
     * 清除认证状态
     */
    const clearAuth = () => {
      accessToken.value = null
      refreshTokenValue.value = null
      user.value = null
      clearTokens()
    }

    /**
     * 通用登录处理：执行登录请求、写入 Token、拉取用户信息并提示
     */
    const handleLogin = async <P>(
      apiCall: (p: P) => Promise<JwtToken>,
      params: P
    ): Promise<boolean> => {
      isLoading.value = true
      try {
        const tokens = await apiCall(params)
        setAuthTokens(tokens)
        await fetchUserInfo()
        toast.success('登录成功')
        return true
      } catch {
        // Error toast is handled by request interceptor
        return false
      } finally {
        isLoading.value = false
      }
    }

    /**
     * 用户名密码登录
     */
    const login = (params: LoginPwdParams): Promise<boolean> => handleLogin(loginByPassword, params)

    /**
     * QQ 登录
     */
    const loginWithQQ = (params: LoginQQParams): Promise<boolean> => handleLogin(loginByQQ, params)

    /**
     * Google 登录
     */
    const loginWithGoogle = (params: LoginGoogleParams): Promise<boolean> =>
      handleLogin(loginByGoogle, params)

    /**
     * GitHub 登录
     */
    const loginWithGithub = (params: LoginGithubParams): Promise<boolean> =>
      handleLogin(loginByGithub, params)

    /**
     * LinuxDo 登录
     */
    const loginWithLinuxDo = (params: LoginLinuxDoParams): Promise<boolean> =>
      handleLogin(loginByLinuxDo, params)

    /**
     * X 登录
     */
    const loginWithX = (params: LoginXParams): Promise<boolean> => handleLogin(loginByX, params)

    /**
     * 退出登录
     */
    const logout = () => {
      clearAuth()
      toast.success('已退出登录')
    }

    /**
     * 刷新 Access Token
     */
    const refreshAccessToken = async (): Promise<boolean> => {
      const currentRefreshToken = refreshTokenValue.value
      if (!currentRefreshToken) {
        clearAuth()
        return false
      }

      try {
        const tokens = await refreshTokenApi({ refreshToken: currentRefreshToken })
        setAuthTokens(tokens)
        return true
      } catch {
        clearAuth()
        return false
      }
    }

    /**
     * 获取当前用户信息
     */
    const fetchUserInfo = async (): Promise<boolean> => {
      if (!accessToken.value) {
        return false
      }

      try {
        const userInfo = await getCurrentUserInfo()
        user.value = userInfo
        return true
      } catch {
        return false
      }
    }

    /**
     * 初始化认证状态 (应用启动时调用)
     */
    const initAuth = async () => {
      if (accessToken.value) {
        await fetchUserInfo()
      }
    }

    /**
     * 更新用户信息 (局部更新)
     */
    const updateUser = (updates: Partial<UserInfo>) => {
      if (user.value) {
        user.value = { ...user.value, ...updates }
      }
    }

    /**
     * 更新硬币数量
     */
    const updateCoinCount = (delta: number) => {
      if (user.value) {
        const nextCoinCount = user.value.coinCount + delta
        user.value.coinCount = Math.max(0, Math.round(nextCoinCount * 10) / 10)
      }
    }

    return {
      // State
      accessToken,
      refreshToken: refreshTokenValue,
      user,
      isLoading,

      // Getters
      isLoggedIn,
      userId,
      username,
      avatar,
      level,
      coinCount,

      // Actions
      login,
      loginWithQQ,
      loginWithGoogle,
      loginWithGithub,
      loginWithLinuxDo,
      loginWithX,
      logout,
      refreshAccessToken,
      fetchUserInfo,
      initAuth,
      updateUser,
      updateCoinCount,
      setAuthTokens,
      clearAuth,
    }
  },
  {
    persist: {
      pick: ['accessToken', 'refreshToken', 'user'],
    },
  }
)
