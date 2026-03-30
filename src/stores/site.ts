import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getSiteConfig, type SiteConfig } from '@/api/site'

export const useSiteStore = defineStore('site', () => {
  // State
  const config = ref<SiteConfig | null>(null)
  const isLoading = ref(false)
  const isLoaded = ref(false)

  // Getters - Login
  const isQQLoginEnabled = computed(() => config.value?.login.qqLogin ?? false)
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
  const maxChunkSize = computed(() => config.value?.storage.maxChunkSize ?? 20)
  const chunkSize = computed(() => config.value?.storage.chunkSize ?? 10)
  const maxFileSize = computed(() => config.value?.storage.maxFileSize ?? 100)
  const maxUploadNum = computed(() => config.value?.storage.maxUploadNum ?? 10)

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

  const refreshConfig = async (): Promise<boolean> => {
    isLoaded.value = false
    return fetchConfig()
  }

  return {
    // State
    config,
    isLoading,
    isLoaded,

    // Getters - Login
    isQQLoginEnabled,
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
