<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, AlertCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { clearOAuthSession, consumeOAuthSession, type OAuthProvider } from '@/utils/oauth'

type Provider = 'qq' | 'google' | 'github' | 'linuxdo' | 'x'

interface ProviderConfig {
  label: string
  /** Whether the provider uses an OAuth session (consume/clear + state validation). */
  useSession: boolean
  /** Whether the OAuth session must contain a codeVerifier. */
  requireCodeVerifier: boolean
  login: (params: {
    code: string
    state: string | undefined
    codeVerifier: string | undefined
  }) => Promise<boolean>
}

const props = defineProps<{
  provider: Provider
}>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(true)
const errorMessage = ref('')

const providerConfigs: Record<Provider, ProviderConfig> = {
  qq: {
    label: 'QQ',
    useSession: false,
    requireCodeVerifier: false,
    login: ({ code }) => authStore.loginWithQQ({ code }),
  },
  google: {
    label: 'Google',
    useSession: true,
    requireCodeVerifier: false,
    login: ({ code, state }) => authStore.loginWithGoogle({ code, state: state as string }),
  },
  github: {
    label: 'GitHub',
    useSession: true,
    requireCodeVerifier: true,
    login: ({ code, state, codeVerifier }) =>
      authStore.loginWithGithub({
        code,
        state: state as string,
        codeVerifier,
      }),
  },
  linuxdo: {
    label: 'LinuxDo',
    useSession: true,
    requireCodeVerifier: false,
    login: ({ code, state }) => authStore.loginWithLinuxDo({ code, state: state as string }),
  },
  x: {
    label: 'X',
    useSession: true,
    requireCodeVerifier: true,
    login: ({ code, state, codeVerifier }) =>
      authStore.loginWithX({
        code,
        state: state as string,
        codeVerifier: codeVerifier as string,
      }),
  },
}

const config = computed(() => providerConfigs[props.provider])

const handleCallback = async () => {
  const { provider } = props
  const { label, useSession, requireCodeVerifier, login } = config.value

  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const oauthError = route.query.error as string | undefined
  const oauthErrorDescription = route.query.error_description as string | undefined

  if (oauthError) {
    if (useSession) {
      clearOAuthSession(provider as OAuthProvider)
      errorMessage.value = oauthErrorDescription || `${label} 授权已取消或失败，请重新登录`
    } else {
      errorMessage.value = `${label} 授权已取消或失败，请重新登录`
    }
    isLoading.value = false
    return
  }

  if (!code) {
    if (useSession) {
      clearOAuthSession(provider as OAuthProvider)
    }
    errorMessage.value = '缺少授权码，请重新登录'
    isLoading.value = false
    return
  }

  let codeVerifier: string | undefined

  if (useSession) {
    const session = consumeOAuthSession(provider as OAuthProvider)
    if ((requireCodeVerifier && !session?.codeVerifier) || !session?.state) {
      errorMessage.value = `${label} 登录状态已失效，请重新发起登录`
      isLoading.value = false
      return
    }

    if (!state || state !== session.state) {
      errorMessage.value = `${label} 登录状态校验失败，请重新发起登录`
      isLoading.value = false
      return
    }

    codeVerifier = session.codeVerifier
  }

  try {
    const success = await login({ code, state, codeVerifier })
    if (success) {
      void router.replace('/')
    } else {
      errorMessage.value = `${label} 登录失败，请重试`
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : `${label} 登录失败，请重试`
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  void router.replace('/')
  setTimeout(() => window.dispatchEvent(new CustomEvent('auth:login-required')), 100)
}

onMounted(() => {
  void handleCallback()
})
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4"
  >
    <!-- Background decoration -->
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div class="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
    </div>

    <div class="relative flex flex-col items-center gap-6 text-center">
      <!-- Loading State -->
      <template v-if="isLoading">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Loader2 class="h-10 w-10 animate-spin text-primary" />
        </div>
        <div class="space-y-2">
          <h1 class="text-2xl font-bold">{{ config.label }} 登录中</h1>
          <p class="text-muted-foreground">正在验证您的身份，请稍候...</p>
        </div>
      </template>

      <!-- Error State -->
      <template v-else-if="errorMessage">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle class="h-10 w-10 text-destructive" />
        </div>
        <div class="space-y-2">
          <h1 class="text-2xl font-bold">登录失败</h1>
          <p class="text-muted-foreground">{{ errorMessage }}</p>
        </div>
        <button
          type="button"
          class="mt-4 rounded-lg bg-primary px-6 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          @click="goToLogin"
        >
          返回登录
        </button>
      </template>
    </div>
  </div>
</template>
