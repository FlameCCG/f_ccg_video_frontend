<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, AlertCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { clearOAuthSession, consumeOAuthSession } from '@/utils/oauth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(true)
const errorMessage = ref('')

const handleLinuxDoCallback = async () => {
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined
  const oauthError = route.query.error as string | undefined
  const oauthErrorDescription = route.query.error_description as string | undefined

  if (oauthError) {
    clearOAuthSession('linuxdo')
    errorMessage.value = oauthErrorDescription || 'LinuxDo 授权已取消或失败，请重新登录'
    isLoading.value = false
    return
  }

  if (!code) {
    clearOAuthSession('linuxdo')
    errorMessage.value = '缺少授权码，请重新登录'
    isLoading.value = false
    return
  }

  const session = consumeOAuthSession('linuxdo')
  if (!session?.state) {
    errorMessage.value = 'LinuxDo 登录状态已失效，请重新发起登录'
    isLoading.value = false
    return
  }

  if (!state || state !== session.state) {
    errorMessage.value = 'LinuxDo 登录状态校验失败，请重新发起登录'
    isLoading.value = false
    return
  }

  try {
    const success = await authStore.loginWithLinuxDo({ code, state })
    if (success) {
      void router.replace('/')
    } else {
      errorMessage.value = 'LinuxDo 登录失败，请重试'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'LinuxDo 登录失败，请重试'
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  void router.replace('/')
  setTimeout(() => window.dispatchEvent(new CustomEvent('auth:login-required')), 100)
}

onMounted(() => {
  void handleLinuxDoCallback()
})
</script>

<template>
  <div
    class="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4"
  >
    <div class="pointer-events-none fixed inset-0 overflow-hidden">
      <div class="absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div class="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
    </div>

    <div class="relative flex flex-col items-center gap-6 text-center">
      <template v-if="isLoading">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Loader2 class="h-10 w-10 animate-spin text-primary" />
        </div>
        <div class="space-y-2">
          <h1 class="text-2xl font-bold">LinuxDo 登录中</h1>
          <p class="text-muted-foreground">正在验证您的身份，请稍候...</p>
        </div>
      </template>

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
