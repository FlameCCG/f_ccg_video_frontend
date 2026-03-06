import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import {
  loginByPassword,
  loginByQQ,
  refreshToken as refreshTokenApi,
  getCurrentUserInfo,
  type LoginPwdParams,
  type LoginQQParams,
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
     * 用户名密码登录
     */
    const login = async (params: LoginPwdParams): Promise<boolean> => {
      isLoading.value = true
      try {
        const tokens = await loginByPassword(params)
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
     * QQ 登录
     */
    const loginWithQQ = async (params: LoginQQParams): Promise<boolean> => {
      isLoading.value = true
      try {
        const tokens = await loginByQQ(params)
        setAuthTokens(tokens)
        await fetchUserInfo()
        toast.success('登录成功')
        return true
      } catch {
        return false
      } finally {
        isLoading.value = false
      }
    }

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
        user.value.coinCount = Math.max(0, user.value.coinCount + delta)
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
