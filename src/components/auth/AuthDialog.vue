<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  Eye,
  EyeOff,
  Loader2,
  User,
  Lock,
  Mail,
  Send,
  ArrowLeft,
  ShieldCheck,
  Check,
} from 'lucide-vue-next'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import GraphicsCaptcha from '@/components/captcha/GraphicsCaptcha.vue'
import ClickCaptchaDialog from '@/components/captcha/ClickCaptchaDialog.vue'
import SlideCaptchaDialog from '@/components/captcha/SlideCaptchaDialog.vue'

type AuthMode = 'login' | 'register' | 'forgot'

const props = defineProps<{
  open: boolean
  initialMode?: AuthMode
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const authStore = useAuthStore()
const siteStore = useSiteStore()

const mode = ref<AuthMode>(props.initialMode || 'login')

// Form state - Login
const loginUsername = ref('')
const loginPassword = ref('')
const showLoginPassword = ref(false)

// Form state - Register
const registerUsername = ref('')
const registerPassword = ref('')
const registerConfirmPassword = ref('')
const registerEmail = ref('')
const registerEmailCode = ref('')
const showRegisterPassword = ref(false)
const showRegisterConfirmPassword = ref(false)

// Form state - Forgot Password
const forgotEmail = ref('')
const forgotPassword = ref('')
const forgotConfirmPassword = ref('')
const forgotEmailCode = ref('')
const showForgotPassword = ref(false)
const showForgotConfirmPassword = ref(false)

// Shared email state
const emailID = ref('')

// Captcha refs
const graphicsCaptchaRef = ref<InstanceType<typeof GraphicsCaptcha> | null>(null)

// Captcha state
const graphicsCaptchaValue = ref<{ captchaID: string; captchaCode: string }>({
  captchaID: '',
  captchaCode: '',
})
const clickCaptchaOpen = ref(false)
const slideCaptchaOpen = ref(false)
const slideCaptchaValue = ref<{ token: string; x: number; y: number }>({
  token: '',
  x: 0,
  y: 0,
})
const slideCaptchaVerified = ref(false)

// Loading state
const isSubmitting = ref(false)
const isSendingEmail = ref(false)
const emailCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

// Computed
const isLoginFormValid = computed(() => {
  return loginUsername.value.trim() !== '' && loginPassword.value.trim() !== ''
})

const isRegisterFormValid = computed(() => {
  return (
    registerUsername.value.trim() !== '' &&
    registerPassword.value.trim() !== '' &&
    registerConfirmPassword.value.trim() !== '' &&
    registerEmail.value.trim() !== '' &&
    registerEmailCode.value.trim() !== '' &&
    registerPassword.value === registerConfirmPassword.value
  )
})

const isForgotFormValid = computed(() => {
  return (
    forgotEmail.value.trim() !== '' &&
    forgotPassword.value.trim() !== '' &&
    forgotConfirmPassword.value.trim() !== '' &&
    forgotEmailCode.value.trim() !== '' &&
    forgotPassword.value === forgotConfirmPassword.value
  )
})

const passwordsMatch = computed(() => {
  if (mode.value === 'register') {
    if (!registerConfirmPassword.value) return true
    return registerPassword.value === registerConfirmPassword.value
  } else if (mode.value === 'forgot') {
    if (!forgotConfirmPassword.value) return true
    return forgotPassword.value === forgotConfirmPassword.value
  }
  return true
})

const canSendEmail = computed(() => {
  if (emailCountdown.value > 0) return false
  const email = mode.value === 'register' ? registerEmail.value : forgotEmail.value
  if (!email.trim()) return false
  if (siteStore.isRegisterGraphicsCaptchaEnabled && !graphicsCaptchaValue.value.captchaCode)
    return false
  return !isSendingEmail.value
})

const hasSocialLoginOptions = computed(() => {
  return (
    siteStore.isQQLoginEnabled ||
    siteStore.isGoogleLoginEnabled ||
    siteStore.isGithubLoginEnabled ||
    siteStore.isLinuxDoLoginEnabled ||
    siteStore.isXLoginEnabled
  )
})

// Methods
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
  slideCaptchaValue.value = { token: '', x: 0, y: 0 }
  slideCaptchaVerified.value = false
}

const handleLoginClick = () => {
  if (!isLoginFormValid.value) return
  if (siteStore.isLoginClickCaptchaEnabled) {
    clickCaptchaOpen.value = true
  } else {
    void doLogin({ token: '', dots: [] })
  }
}

const handleClickCaptchaVerified = (value: { token: string; dots: ClickCaptchaPoint[] }) => {
  void doLogin(value)
}

const doLogin = async (captcha: { token: string; dots: ClickCaptchaPoint[] }) => {
  isSubmitting.value = true
  try {
    const success = await authStore.login({
      username: loginUsername.value.trim(),
      password: loginPassword.value,
      captchaToken: captcha.token,
      captchaDots: captcha.dots,
    })
    if (success) {
      emit('success')
      emit('update:open', false)
    }
  } finally {
    isSubmitting.value = false
  }
}

const handleSlideCaptchaClick = () => {
  if (siteStore.isRegisterSlideCaptchaEnabled) {
    slideCaptchaOpen.value = true
  }
}

const handleSlideCaptchaVerified = (value: { token: string; x: number; y: number }) => {
  slideCaptchaValue.value = value
  slideCaptchaVerified.value = true

  if (mode.value === 'register') {
    void handleSendEmailCode()
  }
}

const handleSendEmailCode = async () => {
  if (!canSendEmail.value) return

  if (
    mode.value === 'register' &&
    siteStore.isRegisterSlideCaptchaEnabled &&
    !slideCaptchaVerified.value
  ) {
    slideCaptchaOpen.value = true
    return
  }

  isSendingEmail.value = true
  try {
    const type = mode.value === 'register' ? 1 : 2
    const email = mode.value === 'register' ? registerEmail.value : forgotEmail.value
    const result = await sendEmailCaptcha({
      type,
      email: email.trim(),
      captchaID: graphicsCaptchaValue.value.captchaID,
      captchaCode: graphicsCaptchaValue.value.captchaCode,
      slideCaptchaToken: slideCaptchaValue.value.token,
      slideCaptchaX: slideCaptchaValue.value.x,
      slideCaptchaY: slideCaptchaValue.value.y,
    })
    emailID.value = result.emailID
    toast.success('验证码已发送到您的邮箱')

    emailCountdown.value = 60
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      emailCountdown.value--
      if (emailCountdown.value <= 0) {
        if (countdownTimer) clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  } catch {
    if (graphicsCaptchaRef.value) {
      void graphicsCaptchaRef.value.loadCaptcha()
    }
    slideCaptchaVerified.value = false
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
      slideCaptchaToken: slideCaptchaValue.value.token,
      slideCaptchaX: slideCaptchaValue.value.x,
      slideCaptchaY: slideCaptchaValue.value.y,
    })
    toast.success('注册成功，请登录')
    switchMode('login')
  } catch {
    if (graphicsCaptchaRef.value) {
      void graphicsCaptchaRef.value.loadCaptcha()
    }
    slideCaptchaVerified.value = false
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
    if (graphicsCaptchaRef.value) {
      void graphicsCaptchaRef.value.loadCaptcha()
    }
    slideCaptchaVerified.value = false
  } finally {
    isSubmitting.value = false
  }
}

// OAuth handlers
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

const startSocialLogin = async (provider: 'qq' | 'google' | OAuthProvider) => {
  const configReady = siteStore.isLoaded
    ? await siteStore.refreshConfig()
    : await siteStore.fetchConfig()

  if (configReady && !isSocialLoginEnabled(provider)) {
    toast.error(`${socialLoginLabels[provider]} 登录已关闭`)
    return
  }

  try {
    if (provider === 'qq') {
      window.location.href = await getQQLoginUrl()
      return
    }

    if (provider === 'google') {
      const stateParams = prepareStateLogin(provider)
      window.location.href = await getGoogleLoginUrl(stateParams)
      return
    }

    if (provider === 'linuxdo') {
      const stateParams = prepareStateLogin(provider)
      window.location.href = await getLinuxDoLoginUrl(stateParams)
      return
    }

    const pkceParams = await preparePkceLogin(provider)

    if (provider === 'github') {
      window.location.href = await getGithubLoginUrl(pkceParams)
      return
    }

    window.location.href = await getXLoginUrl(pkceParams)
  } catch {
    if (provider === 'github' || provider === 'linuxdo' || provider === 'x') {
      clearOAuthSession(provider)
    }
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

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      mode.value = props.initialMode || 'login'
      void siteStore.fetchConfig()
    } else {
      resetForms()
    }
  }
)

onMounted(() => {
  void siteStore.fetchConfig()
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="max-w-[400px] gap-0 overflow-hidden rounded-[24px] border border-border/20 bg-background/95 p-0 shadow-2xl backdrop-blur-xl transition-all sm:max-w-[420px]"
    >
      <!-- Header with refined styling -->
      <div class="relative px-8 pb-4 pt-10">
        <button
          v-if="mode !== 'login'"
          type="button"
          class="absolute left-6 top-6 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
          @click="switchMode('login')"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        <div class="flex flex-col items-center">
          <div class="mb-4 flex h-24 w-24 items-center justify-center pointer-events-none">
            <svg
              class="h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
            >
              <foreignObject width="100%" height="100%" style="overflow: visible">
                <video
                  src="/lain.webm"
                  autoplay
                  loop
                  muted
                  playsinline
                  style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transform: scale(3.5);
                    transform-origin: center center;
                    mask-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221.3%22 height=%221.1%22%3E%3Crect width=%221.3%22 height=%221.1%22 fill=%22black%22 fill-opacity=%220.35%22/%3E%3Ctext x=%22-0.1%22 y=%220.9%22 font-family=%22monospace%22 font-size=%221%22 font-weight=%22900%22 fill=%22black%22%3E01%3C/text%3E%3C/svg%3E');
                    mask-size: 1.3px 1.1px;
                  "
                  @timeupdate="
                    ($event.target as HTMLVideoElement).currentTime >= 15
                      ? (($event.target as HTMLVideoElement).currentTime = 5)
                      : null
                  "
                />
              </foreignObject>
            </svg>
          </div>
          <h2 class="text-xl font-bold tracking-tight text-foreground">
            {{ mode === 'login' ? '欢迎回来' : mode === 'register' ? '创建账号' : '重置密码' }}
          </h2>
          <p class="mt-2 text-sm text-muted-foreground">
            {{
              mode === 'login'
                ? '登录以继续探索精彩内容'
                : mode === 'register'
                  ? '加入我们，开启精彩之旅'
                  : '通过邮箱重置您的密码'
            }}
          </p>
        </div>
      </div>

      <!-- Content -->
      <div class="px-8 py-6">
        <!-- Login Form -->
        <form v-if="mode === 'login'" class="space-y-4" @submit.prevent="handleLoginClick">
          <div class="space-y-2">
            <div class="group relative">
              <User
                class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
              />
              <Input
                id="login-username"
                type="text"
                placeholder="用户名 / 邮箱"
                class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
                autocomplete="username"
                :model-value="loginUsername"
                @update:model-value="(v) => (loginUsername = String(v))"
              />
            </div>
          </div>

          <div class="space-y-2">
            <div class="group relative">
              <Lock
                class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
              />
              <Input
                id="login-password"
                :type="showLoginPassword ? 'text' : 'password'"
                placeholder="密码"
                class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-11 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
                autocomplete="current-password"
                :model-value="loginPassword"
                @update:model-value="(v) => (loginPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/80 hover:text-foreground"
                @click="showLoginPassword = !showLoginPassword"
              >
                <Eye v-if="!showLoginPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <div class="flex justify-end">
              <button
                type="button"
                class="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                @click="switchMode('forgot')"
              >
                忘记密码？
              </button>
            </div>
          </div>

          <Button
            type="submit"
            class="group relative mt-2 h-12 w-full overflow-hidden rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98]"
            :disabled="!isLoginFormValid || isSubmitting"
          >
            <div class="absolute inset-0 flex items-center justify-center">
              <Loader2 v-if="isSubmitting" class="mr-2 h-5 w-5 animate-spin" />
              <span class="transition-transform group-hover:scale-[1.02]">{{
                isSubmitting ? '登录中...' : '登录'
              }}</span>
            </div>
          </Button>

          <!-- OAuth Divider -->
          <div v-if="hasSocialLoginOptions" class="relative py-4">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-border/40"></div>
            </div>
            <div class="relative flex justify-center">
              <span
                class="bg-background px-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60"
                >其他登录方式</span
              >
            </div>
          </div>

          <!-- OAuth Buttons -->
          <div v-if="hasSocialLoginOptions" class="flex justify-center gap-3">
            <button
              v-if="siteStore.isQQLoginEnabled"
              type="button"
              class="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-border/40 bg-transparent transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              title="QQ 登录"
              @click="handleQQLogin"
            >
              <svg
                class="h-6 w-6 text-foreground opacity-60 transition-all group-hover:text-primary group-hover:opacity-100 dark:text-muted-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12.003 2c-2.265 0-6.29 1.364-6.29 7.325v1.195S3.55 14.96 3.55 17.474c0 .665.17 1.025.281 1.025.114 0 .902-.484 1.748-2.072 0 0-.18 2.197 1.904 3.967 0 0-1.77.495-1.77 1.182 0 .686 4.078.43 6.29.43 2.239 0 6.29.256 6.29-.43 0-.687-1.77-1.182-1.77-1.182 2.085-1.77 1.905-3.967 1.905-3.967.845 1.588 1.634 2.072 1.746 2.072.111 0 .283-.36.283-1.025 0-2.514-2.166-6.954-2.166-6.954V9.325C18.29 3.364 14.268 2 12.003 2z"
                />
              </svg>
            </button>
            <button
              v-if="siteStore.isGoogleLoginEnabled"
              type="button"
              class="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-border/40 bg-transparent transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              title="Google 登录"
              @click="handleGoogleLogin"
            >
              <div
                class="opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0"
              >
                <svg class="h-5 w-5" viewBox="0 0 24 24">
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
              </div>
            </button>
            <button
              v-if="siteStore.isGithubLoginEnabled"
              type="button"
              class="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-border/40 bg-transparent transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              title="GitHub 登录"
              @click="handleGithubLogin"
            >
              <svg
                class="h-6 w-6 text-foreground opacity-60 transition-all group-hover:opacity-100 dark:text-muted-foreground dark:group-hover:text-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </button>
            <button
              v-if="siteStore.isLinuxDoLoginEnabled"
              type="button"
              class="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-border/40 bg-transparent transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              title="LinuxDo 登录"
              @click="handleLinuxDoLogin"
            >
              <img
                src="/linuxdo.png"
                alt="LinuxDo"
                class="h-6 w-6 opacity-60 grayscale transition-all group-hover:scale-[1.04] group-hover:opacity-100 group-hover:grayscale-0"
                loading="lazy"
                decoding="async"
              />
            </button>
            <button
              v-if="siteStore.isXLoginEnabled"
              type="button"
              class="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl border border-border/40 bg-transparent transition-all hover:border-border hover:bg-muted/50 hover:shadow-sm"
              title="X 登录"
              @click="handleXLogin"
            >
              <svg
                class="h-4 w-4 text-foreground opacity-60 transition-all group-hover:opacity-100 dark:text-muted-foreground dark:group-hover:text-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
              </svg>
            </button>
          </div>

          <!-- Register Link -->
          <p class="pt-4 text-center text-sm text-muted-foreground">
            还没有账号？
            <button
              type="button"
              class="font-semibold text-foreground transition-colors hover:text-primary"
              @click="switchMode('register')"
            >
              立即注册
            </button>
          </p>
        </form>

        <!-- Register Form -->
        <form v-else-if="mode === 'register'" class="space-y-4" @submit.prevent="handleRegister">
          <div class="group relative">
            <User
              class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
            />
            <Input
              type="text"
              placeholder="用户名"
              class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              autocomplete="username"
              :model-value="registerUsername"
              @update:model-value="(v) => (registerUsername = String(v))"
            />
          </div>

          <div class="group relative">
            <Mail
              class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
            />
            <Input
              type="email"
              placeholder="邮箱地址"
              class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              autocomplete="email"
              :model-value="registerEmail"
              @update:model-value="(v) => (registerEmail = String(v))"
            />
          </div>

          <div class="group relative">
            <Lock
              class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
            />
            <Input
              :type="showRegisterPassword ? 'text' : 'password'"
              placeholder="密码"
              class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-11 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              autocomplete="new-password"
              :model-value="registerPassword"
              @update:model-value="(v) => (registerPassword = String(v))"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/80 hover:text-foreground"
              @click="showRegisterPassword = !showRegisterPassword"
            >
              <Eye v-if="!showRegisterPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>

          <div class="space-y-1.5">
            <div class="group relative">
              <Lock
                class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
              />
              <Input
                :type="showRegisterConfirmPassword ? 'text' : 'password'"
                placeholder="确认密码"
                class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-11 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
                :class="{
                  'border-destructive/50 focus-visible:border-destructive/50 focus-visible:ring-destructive/20':
                    !passwordsMatch,
                }"
                autocomplete="new-password"
                :model-value="registerConfirmPassword"
                @update:model-value="(v) => (registerConfirmPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/80 hover:text-foreground"
                @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
              >
                <Eye v-if="!showRegisterConfirmPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <p v-if="!passwordsMatch" class="text-xs font-medium text-destructive">
              两次输入的密码不一致
            </p>
          </div>

          <!-- Graphics Captcha -->
          <div v-if="siteStore.isRegisterGraphicsCaptchaEnabled">
            <GraphicsCaptcha ref="graphicsCaptchaRef" v-model="graphicsCaptchaValue" />
          </div>

          <!-- Email Code -->
          <div class="flex gap-3">
            <Input
              type="text"
              placeholder="邮箱验证码"
              class="h-12 flex-1 rounded-xl border border-transparent bg-muted/40 px-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              :model-value="registerEmailCode"
              @update:model-value="(v) => (registerEmailCode = String(v))"
            />
            <Button
              type="button"
              variant="outline"
              class="h-12 w-[110px] shrink-0 rounded-xl border-border/40 px-3 transition-all hover:bg-muted active:scale-[0.98]"
              :disabled="!canSendEmail || emailCountdown > 0"
              @click="handleSendEmailCode"
            >
              <Loader2 v-if="isSendingEmail" class="mr-2 h-4 w-4 animate-spin" />
              <Send v-else-if="emailCountdown <= 0" class="mr-2 h-4 w-4" />
              <span class="font-medium text-sm">
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
            class="group relative mt-2 h-12 w-full overflow-hidden rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98]"
            :disabled="!isRegisterFormValid || isSubmitting"
          >
            <div class="absolute inset-0 flex items-center justify-center">
              <Loader2 v-if="isSubmitting" class="mr-2 h-5 w-5 animate-spin" />
              <span class="transition-transform group-hover:scale-[1.02]">{{
                isSubmitting ? '注册中...' : '注册'
              }}</span>
            </div>
          </Button>

          <p class="pt-4 text-center text-sm text-muted-foreground">
            已有账号？
            <button
              type="button"
              class="font-semibold text-foreground transition-colors hover:text-primary"
              @click="switchMode('login')"
            >
              立即登录
            </button>
          </p>
        </form>

        <!-- Forgot Password Form -->
        <form v-else-if="mode === 'forgot'" class="space-y-4" @submit.prevent="handleResetPassword">
          <div class="group relative">
            <Mail
              class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
            />
            <Input
              type="email"
              placeholder="注册邮箱"
              class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              autocomplete="email"
              :model-value="forgotEmail"
              @update:model-value="(v) => (forgotEmail = String(v))"
            />
          </div>

          <!-- Graphics Captcha -->
          <div v-if="siteStore.isRegisterGraphicsCaptchaEnabled">
            <GraphicsCaptcha ref="graphicsCaptchaRef" v-model="graphicsCaptchaValue" />
          </div>

          <!-- Slide Captcha Trigger -->
          <div v-if="siteStore.isRegisterSlideCaptchaEnabled">
            <Button
              type="button"
              variant="outline"
              class="group relative h-12 w-full justify-start overflow-hidden rounded-xl border px-4 transition-all duration-300 active:scale-[0.98]"
              :class="[
                slideCaptchaVerified
                  ? 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10'
                  : 'border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground',
              ]"
              @click="handleSlideCaptchaClick"
            >
              <div class="flex w-full items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="flex h-5 w-5 items-center justify-center rounded-full transition-all duration-300"
                    :class="
                      slideCaptchaVerified
                        ? 'scale-100 bg-primary text-primary-foreground'
                        : 'scale-90 bg-muted-foreground/20 text-transparent group-hover:bg-muted-foreground/30'
                    "
                  >
                    <Check v-if="slideCaptchaVerified" class="h-3 w-3" />
                    <div v-else class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"></div>
                  </div>
                  <span class="font-medium tracking-wide">
                    {{ slideCaptchaVerified ? '安全验证已通过' : '点击进行安全验证' }}
                  </span>
                </div>
                <ShieldCheck
                  class="h-4 w-4 transition-all duration-500"
                  :class="
                    slideCaptchaVerified
                      ? 'scale-110 text-primary opacity-100'
                      : 'text-muted-foreground/40 opacity-50 group-hover:opacity-80'
                  "
                />
              </div>
              <div
                v-if="!slideCaptchaVerified"
                class="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite] bg-gradient-to-r from-transparent via-foreground/5 to-transparent"
              ></div>
            </Button>
          </div>

          <!-- Email Code -->
          <div class="flex gap-3">
            <Input
              type="text"
              placeholder="邮箱验证码"
              class="h-12 flex-1 rounded-xl border border-transparent bg-muted/40 px-4 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              :model-value="forgotEmailCode"
              @update:model-value="(v) => (forgotEmailCode = String(v))"
            />
            <Button
              type="button"
              variant="outline"
              class="h-12 w-[110px] shrink-0 rounded-xl border-border/40 px-3 transition-all hover:bg-muted active:scale-[0.98]"
              :disabled="!canSendEmail || emailCountdown > 0"
              @click="handleSendEmailCode"
            >
              <Loader2 v-if="isSendingEmail" class="mr-2 h-4 w-4 animate-spin" />
              <Send v-else-if="emailCountdown <= 0" class="mr-2 h-4 w-4" />
              <span class="font-medium text-sm">
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

          <div class="group relative">
            <Lock
              class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
            />
            <Input
              :type="showForgotPassword ? 'text' : 'password'"
              placeholder="新密码"
              class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-11 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
              autocomplete="new-password"
              :model-value="forgotPassword"
              @update:model-value="(v) => (forgotPassword = String(v))"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/80 hover:text-foreground"
              @click="showForgotPassword = !showForgotPassword"
            >
              <Eye v-if="!showForgotPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>

          <div class="space-y-1.5">
            <div class="group relative">
              <Lock
                class="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground/50 transition-colors group-focus-within:text-primary"
              />
              <Input
                :type="showForgotConfirmPassword ? 'text' : 'password'"
                placeholder="确认新密码"
                class="h-12 w-full rounded-xl border border-transparent bg-muted/40 pl-11 pr-11 text-sm transition-all placeholder:text-muted-foreground/50 focus-visible:border-primary/30 focus-visible:bg-transparent focus-visible:ring-4 focus-visible:ring-primary/10"
                :class="{
                  'border-destructive/50 focus-visible:border-destructive/50 focus-visible:ring-destructive/20':
                    !passwordsMatch,
                }"
                autocomplete="new-password"
                :model-value="forgotConfirmPassword"
                @update:model-value="(v) => (forgotConfirmPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:bg-muted/80 hover:text-foreground"
                @click="showForgotConfirmPassword = !showForgotConfirmPassword"
              >
                <Eye v-if="!showForgotConfirmPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <p v-if="!passwordsMatch" class="text-xs font-medium text-destructive">
              两次输入的密码不一致
            </p>
          </div>

          <Button
            type="submit"
            class="group relative mt-4 h-12 w-full overflow-hidden rounded-xl bg-primary text-base font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/30 active:scale-[0.98]"
            :disabled="!isForgotFormValid || isSubmitting"
          >
            <div class="absolute inset-0 flex items-center justify-center">
              <Loader2 v-if="isSubmitting" class="mr-2 h-5 w-5 animate-spin" />
              <span class="transition-transform group-hover:scale-[1.02]">{{
                isSubmitting ? '重置中...' : '重置密码'
              }}</span>
            </div>
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="mt-1 h-12 w-full rounded-xl text-muted-foreground transition-all hover:bg-muted active:scale-[0.98]"
            @click="switchMode('login')"
          >
            返回登录
          </Button>
        </form>
      </div>
    </DialogContent>
  </Dialog>

  <ClickCaptchaDialog
    v-model:open="clickCaptchaOpen"
    @verified="handleClickCaptchaVerified"
    @cancel="() => {}"
  />
  <SlideCaptchaDialog
    v-model:open="slideCaptchaOpen"
    @verified="handleSlideCaptchaVerified"
    @cancel="() => {}"
  />
</template>
