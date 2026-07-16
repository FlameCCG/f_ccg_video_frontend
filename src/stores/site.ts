import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSiteConfig, normalizeStorageConfig, type SiteConfig } from '@/api/site'

export const useSiteStore = defineStore('site', () => {
  // State
  const config = ref<SiteConfig | null>(null)
  const isLoading = ref(false)
  const isLoaded = ref(false)

  // Getters - Login
  // 配置未加载时一律 false，避免未拉到站点配置前误显 Google 等默认项
  const isQQLoginEnabled = computed(() => config.value?.login.qqLogin ?? false)
  const isGoogleLoginEnabled = computed(() => config.value?.login.googleLogin ?? false)
  const isGithubLoginEnabled = computed(
    () => config.value?.login.githubLogin ?? config.value?.login.gitHubLogin ?? false
  )
  const isLinuxDoLoginEnabled = computed(() => config.value?.login.linuxdoLogin ?? false)
  const isXLoginEnabled = computed(() => config.value?.login.xLogin ?? false)
  const isPasswordLoginEnabled = computed(() => config.value?.login.usernamePwdLogin ?? true)
  const isLoginGraphicsCaptchaEnabled = computed(
    () => config.value?.login.textGraphicCaptcha ?? false
  )
  const isLoginClickCaptchaEnabled = computed(() => config.value?.login.textClickCaptcha ?? false)

  // Getters - Register
  const isRegisterEmailCaptchaEnabled = computed(() => config.value?.register.emailCaptcha ?? false)
  const isRegisterGraphicsCaptchaEnabled = computed(
    () => config.value?.register.textGraphicCaptcha ?? false
  )
  const isRegisterSlideCaptchaEnabled = computed(() => config.value?.register.slideCaptcha ?? false)

  // Getters - Storage
  const normalizedStorage = computed(() => normalizeStorageConfig(config.value?.storage))
  const maxChunkSize = computed(() => normalizedStorage.value.maxChunkSize)
  const chunkSize = computed(() => normalizedStorage.value.chunkSize)
  const maxFileSize = computed(() => normalizedStorage.value.maxFileSize)
  const maxUploadNum = computed(() => normalizedStorage.value.maxUploadNum)

  // Getters - Content Review
  const isContentReviewEnabled = computed(() => config.value?.contentReview.enable ?? false)

  // Actions
  const fetchConfig = async (): Promise<boolean> => {
    if (isLoaded.value) return true

    isLoading.value = true
    try {
      const result = await getSiteConfig()
      config.value = result.site
      isLoaded.value = true
      return true
    } catch {
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 强制重新拉取站点配置。
   * 保留旧 config / isLoaded，避免 UI（如 OAuth 按钮区）在刷新瞬间被拆掉导致闪烁。
   */
  const refreshConfig = async (): Promise<boolean> => {
    isLoading.value = true
    try {
      const result = await getSiteConfig()
      config.value = result.site
      isLoaded.value = true
      return true
    } catch {
      // 失败时保留旧配置，不把 isLoaded 打回 false
      return isLoaded.value
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State
    config,
    isLoading,
    isLoaded,

    // Getters - Login
    isQQLoginEnabled,
    isGoogleLoginEnabled,
    isGithubLoginEnabled,
    isLinuxDoLoginEnabled,
    isXLoginEnabled,
    isPasswordLoginEnabled,
    isLoginGraphicsCaptchaEnabled,
    isLoginClickCaptchaEnabled,

    // Getters - Register
    isRegisterEmailCaptchaEnabled,
    isRegisterGraphicsCaptchaEnabled,
    isRegisterSlideCaptchaEnabled,

    // Getters - Storage
    maxChunkSize,
    chunkSize,
    maxFileSize,
    maxUploadNum,

    // Getters - Content Review
    isContentReviewEnabled,

    // Actions
    fetchConfig,
    refreshConfig,
  }
})
