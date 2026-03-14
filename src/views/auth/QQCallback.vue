<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loader2, AlertCircle } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isLoading = ref(true)
const errorMessage = ref('')

const handleQQCallback = async () => {
  const code = route.query.code as string | undefined

  if (!code) {
    errorMessage.value = '缺少授权码，请重新登录'
    isLoading.value = false
    return
  }

  try {
    const success = await authStore.loginWithQQ({ code })
    if (success) {
      void router.replace('/')
    } else {
      errorMessage.value = 'QQ 登录失败，请重试'
    }
  } catch {
    errorMessage.value = 'QQ 登录失败，请重试'
  } finally {
    isLoading.value = false
  }
}

const goToLogin = () => {
  void router.replace('/')
  setTimeout(() => window.dispatchEvent(new CustomEvent('auth:login-required')), 100)
}

onMounted(() => {
  void handleQQCallback()
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
          <h1 class="text-2xl font-bold">QQ 登录中</h1>
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
