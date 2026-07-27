<script setup lang="ts">
import { shallowRef, computed, watch, onMounted, onUnmounted } from 'vue'
import { Eye, EyeOff, Loader2, User, Lock, Mail, Send, ArrowLeft } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import {
  getGithubLoginUrl,
  getGoogleLoginUrl,
  getLinuxDoLoginUrl,
  getQQLoginUrl,
  getXLoginUrl,
} from '@/api/site'
import { sendEmailCaptcha } from '@/api/captcha'
import { registerByEmail, resetPassword } from '@/api/user'
import type { ClickCaptchaPoint } from '@/api/user'
import {
  clearOAuthSession,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  saveOAuthSession,
  type OAuthProvider,
} from '@/utils/oauth'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import GraphicsCaptcha from '@/components/captcha/GraphicsCaptcha.vue'
import ClickCaptchaDialog from '@/components/captcha/ClickCaptchaDialog.vue'
import SlideCaptchaDialog from '@/components/captcha/SlideCaptchaDialog.vue'
import AuthLainMark from '@/components/auth/AuthLainMark.vue'

interface SlideCaptchaExposed {
  success: (result?: { token: string; x: number; y: number }) => void
  fail: () => void
  refresh: () => void
  reset: () => void
}

/** 点选验证码与滑块同构：确定只是提交，成功/失败由这里按后端结果驱动 */
interface ClickCaptchaExposed {
  success: () => void
  fail: (message?: string) => void
  refresh: () => void
  reset: () => void
}

interface ClickCaptchaSubmission {
  token: string
  dots: ClickCaptchaPoint[]
}

/** 仅滑块/图形验证码校验失败（不含发送频率等业务错误） */
const isCaptchaBusinessError = (message: string): boolean => {
  const lower = message.toLowerCase()
  return (
    lower.includes('验证码错误') ||
    lower.includes('验证码验证失败') ||
    lower.includes('验证码已过期') ||
    lower.includes('请填写图形验证码') ||
    lower.includes('图形验证码') ||
    lower.includes('captcha verification') ||
    lower.includes('captcha expired') ||
    lower.includes('slide captcha') ||
    lower.includes('invalid slide captcha')
  )
}

type AuthMode = 'login' | 'register' | 'forgot'

const props = withDefaults(
  defineProps<{
    open: boolean
    initialMode?: AuthMode
  }>(),
  {
    initialMode: 'login',
  }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const authStore = useAuthStore()
const siteStore = useSiteStore()

const mode = shallowRef<AuthMode>(props.initialMode)

// Form state — primitives use shallowRef (vue-best-practices reactivity)
const loginUsername = shallowRef('')
const loginPassword = shallowRef('')
const showLoginPassword = shallowRef(false)

const registerUsername = shallowRef('')
const registerPassword = shallowRef('')
const registerConfirmPassword = shallowRef('')
const registerEmail = shallowRef('')
const registerEmailCode = shallowRef('')
const showRegisterPassword = shallowRef(false)
const showRegisterConfirmPassword = shallowRef(false)

const forgotEmail = shallowRef('')
const forgotPassword = shallowRef('')
const forgotConfirmPassword = shallowRef('')
const forgotEmailCode = shallowRef('')
const showForgotPassword = shallowRef(false)
const showForgotConfirmPassword = shallowRef(false)

const emailID = shallowRef('')

const graphicsCaptchaRef = shallowRef<InstanceType<typeof GraphicsCaptcha> | null>(null)
const graphicsCaptchaValue = shallowRef<{ captchaID: string; captchaCode: string }>({
  captchaID: '',
  captchaCode: '',
})
const clickCaptchaOpen = shallowRef(false)
const clickCaptchaDialogRef = shallowRef<ClickCaptchaExposed | null>(null)
const slideCaptchaOpen = shallowRef(false)
const slideCaptchaDialogRef = shallowRef<SlideCaptchaExposed | null>(null)

const isSubmitting = shallowRef(false)
const isSendingEmail = shallowRef(false)
const emailCountdown = shallowRef(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

const isLoginFormValid = computed(
  () => loginUsername.value.trim() !== '' && loginPassword.value.trim() !== ''
)

const isRegisterFormValid = computed(
  () =>
    registerUsername.value.trim() !== '' &&
    registerPassword.value.trim() !== '' &&
    registerConfirmPassword.value.trim() !== '' &&
    registerEmail.value.trim() !== '' &&
    registerEmailCode.value.trim() !== '' &&
    registerPassword.value === registerConfirmPassword.value
)

const isForgotFormValid = computed(
  () =>
    forgotEmail.value.trim() !== '' &&
    forgotPassword.value.trim() !== '' &&
    forgotConfirmPassword.value.trim() !== '' &&
    forgotEmailCode.value.trim() !== '' &&
    forgotPassword.value === forgotConfirmPassword.value
)

const passwordsMatch = computed(() => {
  if (mode.value === 'register') {
    if (!registerConfirmPassword.value) return true
    return registerPassword.value === registerConfirmPassword.value
  }
  if (mode.value === 'forgot') {
    if (!forgotConfirmPassword.value) return true
    return forgotPassword.value === forgotConfirmPassword.value
  }
  return true
})

const canSendEmail = computed(() => {
  if (emailCountdown.value > 0) return false
  const email = mode.value === 'register' ? registerEmail.value : forgotEmail.value
  if (!email.trim()) return false
  if (
    siteStore.isRegisterGraphicsCaptchaEnabled &&
    !graphicsCaptchaValue.value.captchaCode.trim()
  ) {
    return false
  }
  return !isSendingEmail.value
})

/** 仅在站点配置加载完成后展示 OAuth，避免首屏误用默认开关 */
const hasSocialLoginOptions = computed(
  () =>
    siteStore.isLoaded &&
    (siteStore.isQQLoginEnabled ||
      siteStore.isGoogleLoginEnabled ||
      siteStore.isGithubLoginEnabled ||
      siteStore.isLinuxDoLoginEnabled ||
      siteStore.isXLoginEnabled)
)

const modeTitle = computed(() => {
  if (mode.value === 'login') return '欢迎回来'
  if (mode.value === 'register') return '创建账号'
  return '重置密码'
})

const modeSubtitle = computed(() => {
  if (mode.value === 'login') return '登录以继续探索精彩内容'
  if (mode.value === 'register') return '加入我们，开启精彩之旅'
  return '通过邮箱重置您的密码'
})

const switchMode = (newMode: AuthMode) => {
  mode.value = newMode
  resetForms()
}

const resetForms = () => {
  loginUsername.value = ''
  loginPassword.value = ''
  showLoginPassword.value = false
  registerUsername.value = ''
  registerPassword.value = ''
  registerConfirmPassword.value = ''
  registerEmail.value = ''
  registerEmailCode.value = ''
  showRegisterPassword.value = false
  showRegisterConfirmPassword.value = false
  forgotEmail.value = ''
  forgotPassword.value = ''
  forgotConfirmPassword.value = ''
  forgotEmailCode.value = ''
  showForgotPassword.value = false
  showForgotConfirmPassword.value = false
  emailID.value = ''
  graphicsCaptchaValue.value = { captchaID: '', captchaCode: '' }
}

const refreshGraphicsCaptcha = () => {
  if (siteStore.isRegisterGraphicsCaptchaEnabled && graphicsCaptchaRef.value) {
    void graphicsCaptchaRef.value.loadCaptcha()
  }
}

const buildEmailCaptchaPayload = (type: 1 | 2, email: string) => {
  const payload: {
    type: 1 | 2
    email: string
    captchaID?: string
    captchaCode?: string
    slideCaptchaToken?: string
    slideCaptchaX?: number
    slideCaptchaY?: number
  } = {
    type,
    email: email.trim(),
  }

  if (siteStore.isRegisterGraphicsCaptchaEnabled) {
    payload.captchaID = graphicsCaptchaValue.value.captchaID
    payload.captchaCode = graphicsCaptchaValue.value.captchaCode
  }

  return payload
}

const handleLoginClick = async () => {
  if (!isLoginFormValid.value) return
  if (siteStore.isLoginClickCaptchaEnabled) {
    clickCaptchaOpen.value = true
    return
  }
  // 无验证码路径：没有弹窗承载失败态，仍走 request 层的 toast
  if (await doLogin({ token: '', dots: [] })) finishLogin()
}

/**
 * 点选验证码提交：先问后端，再让验证码演结果。
 * 不能反过来 —— 原实现是验证码自己 setTimeout 后宣布成功、关窗，再去登录，
 * 后端说验证码错了的时候用户已经看完成功动画了。
 */
const handleClickCaptchaConfirm = async (value: ClickCaptchaSubmission) => {
  // silent + onError：失败原因显示在验证码弹窗内联提示里，不再叠一个 toast。
  // 失败可能是验证码点错，也可能是密码错 —— 原因必须传进去，否则用户只看到「已换一张」。
  let reason = ''
  const success = await doLogin(value, {
    silent: true,
    onError: (message) => {
      reason = message
    },
  })
  if (success) {
    clickCaptchaDialogRef.value?.success()
  } else {
    clickCaptchaDialogRef.value?.fail(reason)
  }
}

/** 验证码成功动画播完并自行关闭后，才收掉登录弹窗 */
const handleClickCaptchaVerified = () => {
  finishLogin()
}

const finishLogin = () => {
  emit('success')
  emit('update:open', false)
}

const doLogin = async (
  captcha: ClickCaptchaSubmission,
  options?: { silent?: boolean; onError?: (message: string) => void }
): Promise<boolean> => {
  isSubmitting.value = true
  try {
    return await authStore.login(
      {
        username: loginUsername.value.trim(),
        password: loginPassword.value,
        captchaToken: captcha.token,
        captchaDots: captcha.dots,
      },
      options
    )
  } finally {
    isSubmitting.value = false
  }
}

const startEmailCountdown = () => {
  emailCountdown.value = 60
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    emailCountdown.value--
    if (emailCountdown.value <= 0) {
      if (countdownTimer) clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

/**
 * 发送邮箱验证码：
 * - 站点开启 textGraphicCaptcha 时需填写图形验证码
 * - 站点开启 slideCaptcha 时点击「发送验证码」弹滑块
 * - 滑块校验失败只在弹窗内提示，不弹 toast
 */
const handleSendEmailCode = () => {
  if (!canSendEmail.value) return

  if (
    siteStore.isRegisterGraphicsCaptchaEnabled &&
    !graphicsCaptchaValue.value.captchaCode.trim()
  ) {
    toast.warning('请填写图形验证码')
    return
  }

  const needsSlide =
    (mode.value === 'register' || mode.value === 'forgot') &&
    siteStore.isRegisterSlideCaptchaEnabled

  if (needsSlide) {
    slideCaptchaOpen.value = true
    return
  }

  void sendEmailCodeWithoutSlide()
}

const sendEmailCodeWithoutSlide = async () => {
  isSendingEmail.value = true
  try {
    const type = mode.value === 'register' ? 1 : 2
    const email = mode.value === 'register' ? registerEmail.value : forgotEmail.value
    const result = await sendEmailCaptcha(buildEmailCaptchaPayload(type, email))
    emailID.value = result.emailID
    toast.success('验证码已发送到您的邮箱')
    startEmailCountdown()
    refreshGraphicsCaptcha()
  } catch {
    refreshGraphicsCaptcha()
  } finally {
    isSendingEmail.value = false
  }
}

/** 滑块释放后：带 silent 发送邮箱验证码，失败仅滑块内反馈 */
const handleSlideCaptchaConfirm = async (value: { token: string; x: number; y: number }) => {
  if (mode.value !== 'register' && mode.value !== 'forgot') return

  isSendingEmail.value = true
  try {
    const type = mode.value === 'register' ? 1 : 2
    const email = mode.value === 'register' ? registerEmail.value : forgotEmail.value
    const result = await sendEmailCaptcha(
      {
        ...buildEmailCaptchaPayload(type, email),
        slideCaptchaToken: value.token,
        slideCaptchaX: value.x,
        slideCaptchaY: value.y,
      },
      { silent: true }
    )
    emailID.value = result.emailID
    slideCaptchaDialogRef.value?.success(value)
    toast.success('验证码已发送到您的邮箱')
    startEmailCountdown()
    refreshGraphicsCaptcha()
  } catch (error: unknown) {
    slideCaptchaDialogRef.value?.fail()
    refreshGraphicsCaptcha()
    const message = error instanceof Error ? error.message : ''
    if (message && (message.includes('图形验证码') || !isCaptchaBusinessError(message))) {
      toast.error(message)
    }
  } finally {
    isSendingEmail.value = false
  }
}

const handleRegister = async () => {
  if (!isRegisterFormValid.value) return
  if (!passwordsMatch.value) {
    toast.error('两次输入的密码不一致')
    return
  }
  isSubmitting.value = true
  try {
    await registerByEmail({
      username: registerUsername.value.trim(),
      password: registerPassword.value,
      email: registerEmail.value.trim(),
      emailID: emailID.value,
      emailCode: registerEmailCode.value.trim(),
    })
    toast.success('注册成功，请登录')
    switchMode('login')
  } catch {
    // toast 由 request 拦截器处理
  } finally {
    isSubmitting.value = false
  }
}

const handleResetPassword = async () => {
  if (!isForgotFormValid.value) return
  if (!passwordsMatch.value) {
    toast.error('两次输入的密码不一致')
    return
  }
  isSubmitting.value = true
  try {
    await resetPassword({
      email: forgotEmail.value.trim(),
      emailID: emailID.value,
      emailCode: forgotEmailCode.value.trim(),
      newPassword: forgotPassword.value,
    })
    toast.success('密码重置成功，请使用新密码登录')
    switchMode('login')
  } catch {
    // toast 由 request 拦截器处理
  } finally {
    isSubmitting.value = false
  }
}

const socialLoginLabels: Record<'qq' | 'google' | OAuthProvider, string> = {
  qq: 'QQ',
  google: 'Google',
  github: 'GitHub',
  linuxdo: 'LinuxDo',
  x: 'X',
}

const isSocialLoginEnabled = (provider: 'qq' | 'google' | OAuthProvider) => {
  if (provider === 'qq') return siteStore.isQQLoginEnabled
  if (provider === 'google') return siteStore.isGoogleLoginEnabled
  if (provider === 'github') return siteStore.isGithubLoginEnabled
  if (provider === 'linuxdo') return siteStore.isLinuxDoLoginEnabled
  return siteStore.isXLoginEnabled
}

const prepareStateLogin = (provider: OAuthProvider) => {
  const state = createOAuthState()
  saveOAuthSession(provider, {
    createdAt: Date.now(),
    state,
  })
  return { state }
}

const preparePkceLogin = async (provider: OAuthProvider) => {
  const state = createOAuthState()
  const codeVerifier = createCodeVerifier()
  const codeChallenge = await createCodeChallenge(codeVerifier)
  saveOAuthSession(provider, {
    codeVerifier,
    createdAt: Date.now(),
    state,
  })
  return {
    codeChallenge,
    codeChallengeMethod: 'S256' as const,
    state,
  }
}

/**
 * OAuth 跳转中标记。浏览器「返回」可能从 bfcache 恢复页面，
 * 此时 ref 仍为 true，按钮会一直 disabled —— 必须在 open / pageshow 等时机复位。
 */
const socialRedirecting = shallowRef(false)

const resetSocialRedirecting = () => {
  socialRedirecting.value = false
}

const startSocialLogin = async (provider: 'qq' | 'google' | OAuthProvider) => {
  if (socialRedirecting.value) return
  socialRedirecting.value = true

  try {
    // 已有配置时静默刷新（不卸 isLoaded）；未加载则首次拉取
    // 切勿 refresh 时把 isLoaded 置 false，否则 OAuth 区会卸载闪一下
    const configReady = siteStore.isLoaded
      ? await siteStore.refreshConfig()
      : await siteStore.fetchConfig()

    if (configReady && !isSocialLoginEnabled(provider)) {
      toast.error(`${socialLoginLabels[provider]} 登录已关闭`)
      resetSocialRedirecting()
      return
    }

    let targetUrl: string
    if (provider === 'qq') {
      targetUrl = await getQQLoginUrl()
    } else if (provider === 'google') {
      const stateParams = prepareStateLogin(provider)
      targetUrl = await getGoogleLoginUrl(stateParams)
    } else if (provider === 'linuxdo') {
      const stateParams = prepareStateLogin(provider)
      targetUrl = await getLinuxDoLoginUrl(stateParams)
    } else {
      const pkceParams = await preparePkceLogin(provider)
      targetUrl =
        provider === 'github' ? await getGithubLoginUrl(pkceParams) : await getXLoginUrl(pkceParams)
    }

    // 即将离开页面；若用户从授权页点「返回」被 bfcache 还原，靠 pageshow 复位
    window.location.assign(targetUrl)
  } catch {
    if (provider === 'github' || provider === 'linuxdo' || provider === 'x') {
      clearOAuthSession(provider)
    }
    resetSocialRedirecting()
  }
}

const handleQQLogin = () => {
  void startSocialLogin('qq')
}
const handleGoogleLogin = () => {
  void startSocialLogin('google')
}
const handleGithubLogin = () => {
  void startSocialLogin('github')
}
const handleLinuxDoLogin = () => {
  void startSocialLogin('linuxdo')
}
const handleXLogin = () => {
  void startSocialLogin('x')
}

const setOpen = (value: boolean) => {
  emit('update:open', value)
}

// 打开时确保站点配置就绪（已加载则秒开 OAuth）；关闭时复位表单
watch(
  () => props.open,
  (newVal) => {
    // 无论开/关都清掉跳转锁，避免「返回 / 关窗再开」后 OAuth 永久点不了
    resetSocialRedirecting()
    if (newVal) {
      mode.value = props.initialMode || 'login'
      if (!siteStore.isLoaded) {
        void siteStore.fetchConfig()
      }
    } else {
      resetForms()
      clickCaptchaOpen.value = false
      slideCaptchaOpen.value = false
    }
  },
  { immediate: true }
)

/** bfcache 恢复 / 页签重新可见时解锁 OAuth */
const handlePageShow = (event: PageTransitionEvent) => {
  if (event.persisted || socialRedirecting.value) {
    resetSocialRedirecting()
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible' && socialRedirecting.value) {
    resetSocialRedirecting()
  }
}

const handleWindowFocus = () => {
  if (socialRedirecting.value) {
    resetSocialRedirecting()
  }
}

onMounted(() => {
  window.addEventListener('pageshow', handlePageShow)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleWindowFocus)
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  window.removeEventListener('pageshow', handlePageShow)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleWindowFocus)
})
</script>

<template>
  <Dialog :open="open" @update:open="setOpen">
    <!-- 入退场由 DialogContent 自带的 .motion-surface（main.scss 真实 keyframes）驱动；
         原先这里挂的 data-[state=*]:slide-in-from-* / slide-out-to-* 是死类，不生成任何 CSS。 -->
    <DialogContent
      class="auth-dialog-content max-w-[min(100vw-1.5rem,400px)] gap-0 overflow-hidden p-0 sm:max-w-[400px]"
    >
      <!-- 无障碍标题：视觉层级仍由下方自定义 header 承担 -->
      <DialogTitle class="sr-only">{{ modeTitle }}</DialogTitle>
      <DialogDescription class="sr-only">{{ modeSubtitle }}</DialogDescription>

      <header class="auth-dialog-header">
        <button
          v-if="mode !== 'login'"
          type="button"
          class="auth-back-btn"
          aria-label="返回登录"
          @click="switchMode('login')"
        >
          <ArrowLeft class="h-4 w-4" />
        </button>

        <div class="auth-dialog-brand">
          <AuthLainMark :active="open" />
          <Transition name="auth-mode-copy" mode="out-in">
            <div :key="mode" class="auth-dialog-copy">
              <h2 class="auth-dialog-title">{{ modeTitle }}</h2>
              <p class="auth-dialog-subtitle">{{ modeSubtitle }}</p>
            </div>
          </Transition>
        </div>
      </header>

      <div class="auth-dialog-body">
        <Transition name="auth-mode-panel" mode="out-in">
          <!-- Login -->
          <form
            v-if="mode === 'login'"
            key="login"
            class="auth-form"
            @submit.prevent="handleLoginClick"
          >
            <div class="auth-field">
              <User class="auth-field-icon" aria-hidden="true" />
              <Input
                id="login-username"
                type="text"
                placeholder="用户名 / 邮箱"
                class="auth-input"
                autocomplete="username"
                :model-value="loginUsername"
                @update:model-value="(v) => (loginUsername = String(v))"
              />
            </div>

            <div class="auth-field-block">
              <div class="auth-field">
                <Lock class="auth-field-icon" aria-hidden="true" />
                <Input
                  id="login-password"
                  :type="showLoginPassword ? 'text' : 'password'"
                  placeholder="密码"
                  class="auth-input auth-input--trailing"
                  autocomplete="current-password"
                  :model-value="loginPassword"
                  @update:model-value="(v) => (loginPassword = String(v))"
                />
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showLoginPassword ? '隐藏密码' : '显示密码'"
                  @click="showLoginPassword = !showLoginPassword"
                >
                  <Eye v-if="!showLoginPassword" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
              <div class="auth-field-meta">
                <button type="button" class="auth-text-link" @click="switchMode('forgot')">
                  忘记密码？
                </button>
              </div>
            </div>

            <Button
              type="submit"
              class="auth-primary-btn"
              :disabled="!isLoginFormValid || isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? '登录中...' : '登录' }}
            </Button>

            <template v-if="hasSocialLoginOptions">
              <div class="auth-oauth-divider" role="separator">
                <span>其他登录方式</span>
              </div>

              <div class="auth-oauth-row">
                <button
                  v-if="siteStore.isQQLoginEnabled"
                  type="button"
                  class="auth-oauth-btn"
                  title="QQ 登录"
                  aria-label="QQ 登录"
                  :disabled="socialRedirecting"
                  @click="handleQQLogin"
                >
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                      d="M12.003 2c-2.265 0-6.29 1.364-6.29 7.325v1.195S3.55 14.96 3.55 17.474c0 .665.17 1.025.281 1.025.114 0 .902-.484 1.748-2.072 0 0-.18 2.197 1.904 3.967 0 0-1.77.495-1.77 1.182 0 .686 4.078.43 6.29.43 2.239 0 6.29.256 6.29-.43 0-.687-1.77-1.182-1.77-1.182 2.085-1.77 1.905-3.967 1.905-3.967.845 1.588 1.634 2.072 1.746 2.072.111 0 .283-.36.283-1.025 0-2.514-2.166-6.954-2.166-6.954V9.325C18.29 3.364 14.268 2 12.003 2z"
                    />
                  </svg>
                </button>
                <button
                  v-if="siteStore.isGoogleLoginEnabled"
                  type="button"
                  class="auth-oauth-btn"
                  title="Google 登录"
                  aria-label="Google 登录"
                  :disabled="socialRedirecting"
                  @click="handleGoogleLogin"
                >
                  <svg class="auth-oauth-google h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </button>
                <button
                  v-if="siteStore.isGithubLoginEnabled"
                  type="button"
                  class="auth-oauth-btn"
                  title="GitHub 登录"
                  aria-label="GitHub 登录"
                  :disabled="socialRedirecting"
                  @click="handleGithubLogin"
                >
                  <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                </button>
                <button
                  v-if="siteStore.isLinuxDoLoginEnabled"
                  type="button"
                  class="auth-oauth-btn"
                  title="LinuxDo 登录"
                  aria-label="LinuxDo 登录"
                  :disabled="socialRedirecting"
                  @click="handleLinuxDoLogin"
                >
                  <img
                    src="/linuxdo.png"
                    alt=""
                    class="auth-oauth-img"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
                <button
                  v-if="siteStore.isXLoginEnabled"
                  type="button"
                  class="auth-oauth-btn"
                  title="X 登录"
                  aria-label="X 登录"
                  :disabled="socialRedirecting"
                  @click="handleXLogin"
                >
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                    />
                  </svg>
                </button>
              </div>
            </template>

            <p class="auth-switch">
              还没有账号？
              <button type="button" class="auth-switch-action" @click="switchMode('register')">
                立即注册
              </button>
            </p>
          </form>

          <!-- Register -->
          <form
            v-else-if="mode === 'register'"
            key="register"
            class="auth-form"
            @submit.prevent="handleRegister"
          >
            <div class="auth-field">
              <User class="auth-field-icon" aria-hidden="true" />
              <Input
                type="text"
                placeholder="用户名"
                class="auth-input"
                autocomplete="username"
                :model-value="registerUsername"
                @update:model-value="(v) => (registerUsername = String(v))"
              />
            </div>

            <div class="auth-field">
              <Mail class="auth-field-icon" aria-hidden="true" />
              <Input
                type="email"
                placeholder="邮箱地址"
                class="auth-input"
                autocomplete="email"
                :model-value="registerEmail"
                @update:model-value="(v) => (registerEmail = String(v))"
              />
            </div>

            <div class="auth-field">
              <Lock class="auth-field-icon" aria-hidden="true" />
              <Input
                :type="showRegisterPassword ? 'text' : 'password'"
                placeholder="密码"
                class="auth-input auth-input--trailing"
                autocomplete="new-password"
                :model-value="registerPassword"
                @update:model-value="(v) => (registerPassword = String(v))"
              />
              <button
                type="button"
                class="auth-eye-btn"
                :aria-label="showRegisterPassword ? '隐藏密码' : '显示密码'"
                @click="showRegisterPassword = !showRegisterPassword"
              >
                <Eye v-if="!showRegisterPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>

            <div class="auth-field-block">
              <div class="auth-field">
                <Lock class="auth-field-icon" aria-hidden="true" />
                <Input
                  :type="showRegisterConfirmPassword ? 'text' : 'password'"
                  placeholder="确认密码"
                  class="auth-input auth-input--trailing"
                  :class="{ 'auth-input--invalid': !passwordsMatch }"
                  autocomplete="new-password"
                  :model-value="registerConfirmPassword"
                  @update:model-value="(v) => (registerConfirmPassword = String(v))"
                />
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showRegisterConfirmPassword ? '隐藏密码' : '显示密码'"
                  @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
                >
                  <Eye v-if="!showRegisterConfirmPassword" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
              <p v-if="!passwordsMatch" class="auth-error-text">两次输入的密码不一致</p>
            </div>

            <div v-if="siteStore.isRegisterGraphicsCaptchaEnabled">
              <GraphicsCaptcha ref="graphicsCaptchaRef" v-model="graphicsCaptchaValue" />
            </div>

            <div class="auth-code-row">
              <Input
                type="text"
                placeholder="邮箱验证码"
                class="auth-input auth-input--plain flex-1"
                :model-value="registerEmailCode"
                @update:model-value="(v) => (registerEmailCode = String(v))"
              />
              <Button
                type="button"
                variant="outline"
                class="auth-secondary-btn w-[108px] shrink-0"
                :disabled="!canSendEmail || emailCountdown > 0"
                @click="handleSendEmailCode"
              >
                <Loader2 v-if="isSendingEmail" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <Send v-else-if="emailCountdown <= 0" class="mr-1.5 h-3.5 w-3.5" />
                <span class="text-sm font-medium">
                  {{
                    isSendingEmail
                      ? '发送中'
                      : emailCountdown > 0
                        ? `${emailCountdown}s`
                        : '发送验证码'
                  }}
                </span>
              </Button>
            </div>

            <Button
              type="submit"
              class="auth-primary-btn"
              :disabled="!isRegisterFormValid || isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? '注册中...' : '注册' }}
            </Button>

            <p class="auth-switch">
              已有账号？
              <button type="button" class="auth-switch-action" @click="switchMode('login')">
                立即登录
              </button>
            </p>
          </form>

          <!-- Forgot -->
          <form
            v-else-if="mode === 'forgot'"
            key="forgot"
            class="auth-form"
            @submit.prevent="handleResetPassword"
          >
            <div class="auth-field">
              <Mail class="auth-field-icon" aria-hidden="true" />
              <Input
                type="email"
                placeholder="注册邮箱"
                class="auth-input"
                autocomplete="email"
                :model-value="forgotEmail"
                @update:model-value="(v) => (forgotEmail = String(v))"
              />
            </div>

            <div v-if="siteStore.isRegisterGraphicsCaptchaEnabled">
              <GraphicsCaptcha ref="graphicsCaptchaRef" v-model="graphicsCaptchaValue" />
            </div>

            <div class="auth-code-row">
              <Input
                type="text"
                placeholder="邮箱验证码"
                class="auth-input auth-input--plain flex-1"
                :model-value="forgotEmailCode"
                @update:model-value="(v) => (forgotEmailCode = String(v))"
              />
              <Button
                type="button"
                variant="outline"
                class="auth-secondary-btn w-[108px] shrink-0"
                :disabled="!canSendEmail || emailCountdown > 0"
                @click="handleSendEmailCode"
              >
                <Loader2 v-if="isSendingEmail" class="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <Send v-else-if="emailCountdown <= 0" class="mr-1.5 h-3.5 w-3.5" />
                <span class="text-sm font-medium">
                  {{
                    isSendingEmail
                      ? '发送中'
                      : emailCountdown > 0
                        ? `${emailCountdown}s`
                        : '发送验证码'
                  }}
                </span>
              </Button>
            </div>

            <div class="auth-field">
              <Lock class="auth-field-icon" aria-hidden="true" />
              <Input
                :type="showForgotPassword ? 'text' : 'password'"
                placeholder="新密码"
                class="auth-input auth-input--trailing"
                autocomplete="new-password"
                :model-value="forgotPassword"
                @update:model-value="(v) => (forgotPassword = String(v))"
              />
              <button
                type="button"
                class="auth-eye-btn"
                :aria-label="showForgotPassword ? '隐藏密码' : '显示密码'"
                @click="showForgotPassword = !showForgotPassword"
              >
                <Eye v-if="!showForgotPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>

            <div class="auth-field-block">
              <div class="auth-field">
                <Lock class="auth-field-icon" aria-hidden="true" />
                <Input
                  :type="showForgotConfirmPassword ? 'text' : 'password'"
                  placeholder="确认新密码"
                  class="auth-input auth-input--trailing"
                  :class="{ 'auth-input--invalid': !passwordsMatch }"
                  autocomplete="new-password"
                  :model-value="forgotConfirmPassword"
                  @update:model-value="(v) => (forgotConfirmPassword = String(v))"
                />
                <button
                  type="button"
                  class="auth-eye-btn"
                  :aria-label="showForgotConfirmPassword ? '隐藏密码' : '显示密码'"
                  @click="showForgotConfirmPassword = !showForgotConfirmPassword"
                >
                  <Eye v-if="!showForgotConfirmPassword" class="h-4 w-4" />
                  <EyeOff v-else class="h-4 w-4" />
                </button>
              </div>
              <p v-if="!passwordsMatch" class="auth-error-text">两次输入的密码不一致</p>
            </div>

            <Button
              type="submit"
              class="auth-primary-btn"
              :disabled="!isForgotFormValid || isSubmitting"
            >
              <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? '重置中...' : '重置密码' }}
            </Button>

            <Button
              type="button"
              variant="ghost"
              class="auth-ghost-btn"
              @click="switchMode('login')"
            >
              返回登录
            </Button>
          </form>
        </Transition>
      </div>
    </DialogContent>
  </Dialog>

  <ClickCaptchaDialog
    ref="clickCaptchaDialogRef"
    v-model:open="clickCaptchaOpen"
    @confirm="handleClickCaptchaConfirm"
    @verified="handleClickCaptchaVerified"
  />
  <SlideCaptchaDialog
    ref="slideCaptchaDialogRef"
    v-model:open="slideCaptchaOpen"
    @confirm="handleSlideCaptchaConfirm"
  />
</template>

<style scoped lang="scss">
/* ── Shell: 克制表面 + 有限 blur，Lain 为视觉锚点 ── */
:deep(.auth-dialog-content) {
  border-radius: 22px;
  border: 1px solid color-mix(in oklch, var(--border-color) 55%, transparent);
  background: color-mix(in oklch, var(--bg-surface-0) 94%, transparent);
  box-shadow: var(--shadow-cinematic);

  /* blur-xl → 12px：保留浮层质感，显著降低整页合成成本 */
  backdrop-filter: blur(12px);
  contain: layout style;
}

.dark :deep(.auth-dialog-content) {
  background: color-mix(in oklch, var(--bg-surface-1) 92%, transparent);
  border-color: color-mix(in oklch, var(--border-color) 65%, transparent);
}

.auth-dialog-header {
  position: relative;
  padding: 2.25rem 1.75rem 0.75rem;
}

.auth-back-btn {
  position: absolute;
  left: 1rem;
  top: 1rem;
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: var(--text-2);
  transition:
    color var(--duration-fast) linear,
    background-color var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-expo);

  &:hover {
    background: color-mix(in oklch, var(--bg-surface-2) 80%, transparent);
    color: var(--text-1);
  }

  &:active {
    transform: scale(0.96);
  }
}

.auth-dialog-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.auth-dialog-copy {
  margin-top: 0;
}

.auth-dialog-title {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.25;
  color: var(--text-1);
}

.auth-dialog-subtitle {
  margin-top: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--text-2);
}

.auth-dialog-body {
  padding: 1rem 1.75rem 1.75rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.auth-field {
  position: relative;

  &-block {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  &-icon {
    position: absolute;
    left: 0.95rem;
    top: 50%;
    z-index: 1;
    height: 1.05rem;
    width: 1.05rem;
    transform: translateY(-50%);
    color: color-mix(in oklch, var(--text-2) 72%, transparent);
    transition: color var(--duration-fast) linear;
    pointer-events: none;
  }

  &:focus-within .auth-field-icon {
    color: var(--brand-blue);
  }

  &-meta {
    display: flex;
    justify-content: flex-end;
  }
}

:deep(.auth-input) {
  height: 2.75rem;
  width: 100%;
  border-radius: 0.85rem;
  border: 1px solid transparent;
  background: color-mix(in oklch, var(--bg-surface-2) 70%, transparent);
  padding-left: 2.65rem;
  padding-right: 0.95rem;
  font-size: 0.875rem;
  transition:
    border-color var(--duration-fast) linear,
    background-color var(--duration-fast) linear,
    box-shadow var(--duration-fast) var(--ease-out-quart);
}

:deep(.auth-input--trailing) {
  padding-right: 2.65rem;
}

:deep(.auth-input--plain) {
  padding-left: 0.95rem;
}

:deep(.auth-input::placeholder) {
  color: color-mix(in oklch, var(--text-2) 70%, transparent);
}

:deep(.auth-input:focus-visible) {
  border-color: color-mix(in oklch, var(--brand-blue) 32%, transparent);
  background: color-mix(in oklch, var(--bg-surface-0) 88%, transparent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--brand-blue) 12%, transparent);
  outline: none;
}

:deep(.auth-input--invalid) {
  border-color: color-mix(in oklch, var(--status-danger) 45%, transparent);
}

:deep(.auth-input--invalid:focus-visible) {
  border-color: color-mix(in oklch, var(--status-danger) 55%, transparent);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--status-danger) 14%, transparent);
}

.auth-eye-btn {
  position: absolute;
  right: 0.55rem;
  top: 50%;
  display: flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  transform: translateY(-50%);
  color: color-mix(in oklch, var(--text-2) 75%, transparent);
  transition:
    color var(--duration-fast) linear,
    background-color var(--duration-fast) linear;

  &:hover {
    background: color-mix(in oklch, var(--bg-surface-2) 70%, transparent);
    color: var(--text-1);
  }
}

.auth-text-link {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-2);
  transition: color var(--duration-fast) linear;

  &:hover {
    color: var(--brand-blue);
  }
}

.auth-primary-btn {
  margin-top: 0.25rem;
  height: 2.75rem;
  width: 100%;
  border-radius: 0.85rem;
  font-size: 0.9375rem;
  font-weight: 550;
  box-shadow: 0 8px 20px -12px color-mix(in oklch, var(--brand-blue) 55%, transparent);
  transition:
    transform var(--duration-fast) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-quart),
    background-color var(--duration-fast) linear;

  &:hover:not(:disabled) {
    box-shadow: 0 10px 24px -12px color-mix(in oklch, var(--brand-blue) 62%, transparent);
  }

  &:active:not(:disabled) {
    transform: scale(0.985);
  }
}

.auth-secondary-btn {
  height: 2.75rem;
  border-radius: 0.85rem;
  border-color: color-mix(in oklch, var(--border-color) 70%, transparent);
  transition:
    transform var(--duration-fast) var(--ease-out-expo),
    background-color var(--duration-fast) linear;

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}

.auth-ghost-btn {
  height: 2.75rem;
  width: 100%;
  border-radius: 0.85rem;
  color: var(--text-2);
}

.auth-code-row {
  display: flex;
  gap: 0.625rem;
}

.auth-error-text {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--status-danger);
}

.auth-oauth-divider {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0 0.15rem;

  &::before {
    content: '';
    position: absolute;
    inset-inline: 0;
    top: 50%;
    border-top: 1px solid color-mix(in oklch, var(--border-color) 55%, transparent);
  }

  span {
    position: relative;
    background: color-mix(in oklch, var(--bg-surface-0) 94%, transparent);
    padding-inline: 0.75rem;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: color-mix(in oklch, var(--text-2) 80%, transparent);
  }
}

.dark .auth-oauth-divider span {
  background: color-mix(in oklch, var(--bg-surface-1) 92%, transparent);
}

.auth-oauth-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
}

.auth-oauth-btn {
  display: flex;
  height: 2.65rem;
  width: 2.65rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.8rem;
  border: 1px solid color-mix(in oklch, var(--border-color) 60%, transparent);
  color: color-mix(in oklch, var(--text-1) 72%, transparent);
  transition:
    transform var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) linear,
    background-color var(--duration-fast) linear,
    color var(--duration-fast) linear;

  &:hover {
    border-color: color-mix(in oklch, var(--border-color) 90%, transparent);
    background: color-mix(in oklch, var(--bg-surface-2) 55%, transparent);
    color: var(--text-1);
    transform: translateY(-1px);

    .auth-oauth-google {
      opacity: 1;
      filter: grayscale(0);
    }

    .auth-oauth-img {
      opacity: 1;
      filter: grayscale(0);
      transform: scale(1.04);
    }
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.55;
    pointer-events: none;
  }
}

.auth-oauth-google {
  opacity: 0.72;
  filter: grayscale(1);
  transition:
    opacity var(--duration-fast) linear,
    filter var(--duration-fast) linear;
}

.auth-oauth-img {
  height: 1.25rem;
  width: 1.25rem;
  opacity: 0.7;
  filter: grayscale(1);
  transition:
    opacity var(--duration-fast) linear,
    filter var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-expo);
}

.auth-switch {
  padding-top: 0.35rem;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--text-2);

  &-action {
    font-weight: 600;
    color: var(--text-1);
    transition: color var(--duration-fast) linear;

    &:hover {
      color: var(--brand-blue);
    }
  }
}

.auth-mode-copy-enter-active,
.auth-mode-copy-leave-active,
.auth-mode-panel-enter-active,
.auth-mode-panel-leave-active {
  transition:
    opacity var(--duration-normal) var(--ease-out-quart),
    transform var(--duration-normal) var(--ease-out-expo);
}

.auth-mode-copy-enter-from,
.auth-mode-panel-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.auth-mode-copy-leave-to,
.auth-mode-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Lain 自带 mb-4，标题区不再额外顶距，对齐历史间距 */

/* 模式切换：只动画 opacity + transform */
@media (prefers-reduced-motion: reduce) {
  .auth-mode-copy-enter-active,
  .auth-mode-copy-leave-active,
  .auth-mode-panel-enter-active,
  .auth-mode-panel-leave-active,
  .auth-back-btn,
  .auth-primary-btn,
  .auth-secondary-btn,
  .auth-oauth-btn,
  .auth-oauth-img {
    transition: none;
  }

  .auth-mode-copy-enter-from,
  .auth-mode-panel-enter-from,
  .auth-mode-copy-leave-to,
  .auth-mode-panel-leave-to {
    transform: none;
  }
}

@media (width <= 400px) {
  .auth-dialog-header {
    padding: 1.75rem 1.25rem 0.5rem;
  }

  .auth-dialog-body {
    padding: 0.75rem 1.25rem 1.35rem;
  }
}
</style>
