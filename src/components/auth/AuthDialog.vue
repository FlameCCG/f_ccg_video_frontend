<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Eye, EyeOff, Loader2, User, Lock, Mail, Send, ArrowLeft } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import { getQQLoginUrl } from '@/api/site'
import { sendEmailCaptcha } from '@/api/captcha'
import { registerByEmail, resetPassword } from '@/api/user'
import type { ClickCaptchaPoint } from '@/api/user'
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
  if (siteStore.isRegisterSlideCaptchaEnabled && !slideCaptchaVerified.value) return false
  return !isSendingEmail.value
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
}

const handleSendEmailCode = async () => {
  if (!canSendEmail.value) return
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
const handleQQLogin = async () => {
  try {
    const url = await getQQLoginUrl()
    window.location.href = url
  } catch {
    // Error handled by request interceptor
  }
}

const handleGoogleLogin = () => {
  toast.info('Google 登录即将上线')
}

const handleGithubLogin = () => {
  toast.info('GitHub 登录即将上线')
}

const handleXLogin = () => {
  toast.info('X 登录即将上线')
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
    <DialogContent class="max-w-[400px] gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl">
      <!-- Header with gradient -->
      <div class="relative bg-gradient-to-br from-primary via-primary to-pink-500 px-6 pb-8 pt-6">
        <button
          v-if="mode !== 'login'"
          type="button"
          class="absolute left-4 top-4 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
          @click="switchMode('login')"
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
        <div class="flex flex-col items-center">
          <div
            class="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm"
          >
            <svg class="h-10 w-10 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906l-1.174 1.12zm-8.88 8.88c.018.018.027.027.027.027l.027.027c.267.249.573.373.92.373.347 0 .653-.124.92-.373l.027-.027.027-.027c.249-.267.373-.573.373-.92 0-.347-.124-.653-.373-.92l-.027-.027-.027-.027c-.267-.249-.573-.373-.92-.373-.347 0-.653.124-.92.373l-.027.027-.027.027c-.249.267-.373.573-.373.92 0 .347.124.653.373.92zm6.4 0c.018.018.027.027.027.027l.027.027c.267.249.573.373.92.373.347 0 .653-.124.92-.373l.027-.027.027-.027c.249-.267.373-.573.373-.92 0-.347-.124-.653-.373-.92l-.027-.027-.027-.027c-.267-.249-.573-.373-.92-.373-.347 0-.653.124-.92.373l-.027.027-.027.027c-.249.267-.373.573-.373.92 0 .347.124.653.373.92z"
              />
            </svg>
          </div>
          <h2 class="text-xl font-bold text-white">
            {{ mode === 'login' ? '欢迎回来' : mode === 'register' ? '创建账号' : '重置密码' }}
          </h2>
          <p class="mt-1 text-sm text-white/80">
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
      <div class="px-6 py-5">
        <!-- Login Form -->
        <form v-if="mode === 'login'" class="space-y-4" @submit.prevent="handleLoginClick">
          <div class="space-y-1.5">
            <div class="relative">
              <User
                class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="login-username"
                type="text"
                placeholder="用户名 / 邮箱"
                class="h-11 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 transition-colors focus:bg-background"
                autocomplete="username"
                :model-value="loginUsername"
                @update:model-value="(v) => (loginUsername = String(v))"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <div class="relative">
              <Lock
                class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="login-password"
                :type="showLoginPassword ? 'text' : 'password'"
                placeholder="密码"
                class="h-11 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 pr-10 transition-colors focus:bg-background"
                autocomplete="current-password"
                :model-value="loginPassword"
                @update:model-value="(v) => (loginPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                @click="showLoginPassword = !showLoginPassword"
              >
                <Eye v-if="!showLoginPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <div class="flex justify-end">
              <button
                type="button"
                class="text-xs text-muted-foreground transition-colors hover:text-primary"
                @click="switchMode('forgot')"
              >
                忘记密码？
              </button>
            </div>
          </div>

          <Button
            type="submit"
            class="h-11 w-full rounded-xl text-base font-medium"
            :disabled="!isLoginFormValid || isSubmitting"
          >
            <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ isSubmitting ? '登录中...' : '登录' }}
          </Button>

          <!-- OAuth Divider -->
          <div class="relative py-2">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-muted-foreground/20"></div>
            </div>
            <div class="relative flex justify-center">
              <span class="bg-background px-3 text-xs text-muted-foreground">其他登录方式</span>
            </div>
          </div>

          <!-- OAuth Buttons -->
          <div class="flex justify-center gap-4">
            <button
              v-if="siteStore.isQQLoginEnabled"
              type="button"
              class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#12B7F5] text-white transition-all hover:scale-105 hover:shadow-lg"
              title="QQ 登录"
              @click="handleQQLogin"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12.003 2c-2.265 0-6.29 1.364-6.29 7.325v1.195S3.55 14.96 3.55 17.474c0 .665.17 1.025.281 1.025.114 0 .902-.484 1.748-2.072 0 0-.18 2.197 1.904 3.967 0 0-1.77.495-1.77 1.182 0 .686 4.078.43 6.29.43 2.239 0 6.29.256 6.29-.43 0-.687-1.77-1.182-1.77-1.182 2.085-1.77 1.905-3.967 1.905-3.967.845 1.588 1.634 2.072 1.746 2.072.111 0 .283-.36.283-1.025 0-2.514-2.166-6.954-2.166-6.954V9.325C18.29 3.364 14.268 2 12.003 2z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 transition-all hover:scale-105 hover:shadow-lg dark:bg-gray-800 dark:text-white dark:ring-gray-700"
              title="Google 登录"
              @click="handleGoogleLogin"
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
            </button>
            <button
              type="button"
              class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#24292F] text-white transition-all hover:scale-105 hover:shadow-lg dark:bg-white dark:text-[#24292F]"
              title="GitHub 登录"
              @click="handleGithubLogin"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </button>
            <button
              type="button"
              class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black text-white transition-all hover:scale-105 hover:shadow-lg dark:bg-white dark:text-black"
              title="X 登录"
              @click="handleXLogin"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
              </svg>
            </button>
          </div>

          <!-- Register Link -->
          <p class="pt-2 text-center text-sm text-muted-foreground">
            还没有账号？
            <button
              type="button"
              class="font-medium text-primary transition-colors hover:underline"
              @click="switchMode('register')"
            >
              立即注册
            </button>
          </p>
        </form>

        <!-- Register Form -->
        <form v-else-if="mode === 'register'" class="space-y-3" @submit.prevent="handleRegister">
          <div class="relative">
            <User class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="用户名"
              class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 transition-colors focus:bg-background"
              autocomplete="username"
              :model-value="registerUsername"
              @update:model-value="(v) => (registerUsername = String(v))"
            />
          </div>

          <div class="relative">
            <Mail class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              placeholder="邮箱地址"
              class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 transition-colors focus:bg-background"
              autocomplete="email"
              :model-value="registerEmail"
              @update:model-value="(v) => (registerEmail = String(v))"
            />
          </div>

          <div class="relative">
            <Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              :type="showRegisterPassword ? 'text' : 'password'"
              placeholder="密码"
              class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 pr-10 transition-colors focus:bg-background"
              autocomplete="new-password"
              :model-value="registerPassword"
              @update:model-value="(v) => (registerPassword = String(v))"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              @click="showRegisterPassword = !showRegisterPassword"
            >
              <Eye v-if="!showRegisterPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>

          <div class="space-y-1">
            <div class="relative">
              <Lock
                class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                :type="showRegisterConfirmPassword ? 'text' : 'password'"
                placeholder="确认密码"
                class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 pr-10 transition-colors focus:bg-background"
                :class="{ 'ring-2 ring-destructive': !passwordsMatch }"
                autocomplete="new-password"
                :model-value="registerConfirmPassword"
                @update:model-value="(v) => (registerConfirmPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                @click="showRegisterConfirmPassword = !showRegisterConfirmPassword"
              >
                <Eye v-if="!showRegisterConfirmPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <p v-if="!passwordsMatch" class="text-xs text-destructive">两次输入的密码不一致</p>
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
              class="h-10 w-full justify-start rounded-xl"
              :class="{ 'border-green-500 text-green-600': slideCaptchaVerified }"
              @click="handleSlideCaptchaClick"
            >
              {{ slideCaptchaVerified ? '验证已完成' : '点击进行滑块验证' }}
            </Button>
          </div>

          <!-- Email Code -->
          <div class="flex gap-2">
            <Input
              type="text"
              placeholder="邮箱验证码"
              class="h-10 flex-1 rounded-xl border-muted-foreground/20 bg-muted/50 transition-colors focus:bg-background"
              :model-value="registerEmailCode"
              @update:model-value="(v) => (registerEmailCode = String(v))"
            />
            <Button
              type="button"
              variant="outline"
              class="h-10 w-[88px] shrink-0 rounded-xl px-3"
              :disabled="!canSendEmail || emailCountdown > 0"
              @click="handleSendEmailCode"
            >
              <Loader2 v-if="isSendingEmail" class="mr-1 h-4 w-4 animate-spin" />
              <Send v-else-if="emailCountdown <= 0" class="mr-1 h-4 w-4" />
              <span>
                {{ isSendingEmail ? '发送中' : emailCountdown > 0 ? `${emailCountdown}s` : '发送' }}
              </span>
            </Button>
          </div>

          <Button
            type="submit"
            class="h-10 w-full rounded-xl font-medium"
            :disabled="!isRegisterFormValid || isSubmitting"
          >
            <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ isSubmitting ? '注册中...' : '注册' }}
          </Button>

          <p class="text-center text-sm text-muted-foreground">
            已有账号？
            <button
              type="button"
              class="font-medium text-primary transition-colors hover:underline"
              @click="switchMode('login')"
            >
              立即登录
            </button>
          </p>
        </form>

        <!-- Forgot Password Form -->
        <form v-else-if="mode === 'forgot'" class="space-y-3" @submit.prevent="handleResetPassword">
          <div class="relative">
            <Mail class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              placeholder="注册邮箱"
              class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 transition-colors focus:bg-background"
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
              class="h-10 w-full justify-start rounded-xl"
              :class="{ 'border-green-500 text-green-600': slideCaptchaVerified }"
              @click="handleSlideCaptchaClick"
            >
              {{ slideCaptchaVerified ? '验证已完成' : '点击进行滑块验证' }}
            </Button>
          </div>

          <!-- Email Code -->
          <div class="flex gap-2">
            <Input
              type="text"
              placeholder="邮箱验证码"
              class="h-10 flex-1 rounded-xl border-muted-foreground/20 bg-muted/50 transition-colors focus:bg-background"
              :model-value="forgotEmailCode"
              @update:model-value="(v) => (forgotEmailCode = String(v))"
            />
            <Button
              type="button"
              variant="outline"
              class="h-10 w-[88px] shrink-0 rounded-xl px-3"
              :disabled="!canSendEmail || emailCountdown > 0"
              @click="handleSendEmailCode"
            >
              <Loader2 v-if="isSendingEmail" class="mr-1 h-4 w-4 animate-spin" />
              <Send v-else-if="emailCountdown <= 0" class="mr-1 h-4 w-4" />
              <span>
                {{ isSendingEmail ? '发送中' : emailCountdown > 0 ? `${emailCountdown}s` : '发送' }}
              </span>
            </Button>
          </div>

          <div class="relative">
            <Lock class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              :type="showForgotPassword ? 'text' : 'password'"
              placeholder="新密码"
              class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 pr-10 transition-colors focus:bg-background"
              autocomplete="new-password"
              :model-value="forgotPassword"
              @update:model-value="(v) => (forgotPassword = String(v))"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              @click="showForgotPassword = !showForgotPassword"
            >
              <Eye v-if="!showForgotPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>

          <div class="space-y-1">
            <div class="relative">
              <Lock
                class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                :type="showForgotConfirmPassword ? 'text' : 'password'"
                placeholder="确认新密码"
                class="h-10 rounded-xl border-muted-foreground/20 bg-muted/50 pl-10 pr-10 transition-colors focus:bg-background"
                :class="{ 'ring-2 ring-destructive': !passwordsMatch }"
                autocomplete="new-password"
                :model-value="forgotConfirmPassword"
                @update:model-value="(v) => (forgotConfirmPassword = String(v))"
              />
              <button
                type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                @click="showForgotConfirmPassword = !showForgotConfirmPassword"
              >
                <Eye v-if="!showForgotConfirmPassword" class="h-4 w-4" />
                <EyeOff v-else class="h-4 w-4" />
              </button>
            </div>
            <p v-if="!passwordsMatch" class="text-xs text-destructive">两次输入的密码不一致</p>
          </div>

          <Button
            type="submit"
            class="h-10 w-full rounded-xl font-medium mt-2"
            :disabled="!isForgotFormValid || isSubmitting"
          >
            <Loader2 v-if="isSubmitting" class="mr-2 h-4 w-4 animate-spin" />
            {{ isSubmitting ? '重置中...' : '重置密码' }}
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="h-10 w-full rounded-xl text-muted-foreground mt-2"
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
