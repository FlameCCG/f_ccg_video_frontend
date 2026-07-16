<script setup lang="ts">
import { defineAsyncComponent, ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { Toaster as ToastToaster } from '@/components/ui/toast'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import { initLive2d } from '@/utils/live2d'

const AuthDialog = defineAsyncComponent(() => import('@/components/auth/AuthDialog.vue'))
const AiChatDialog = defineAsyncComponent(() => import('@/components/ai/AiChatDialog.vue'))

const authStore = useAuthStore()
const siteStore = useSiteStore()
useThemeStore()
const showAuthDialog = ref(false)
const showChatDialog = ref(false)
/** 首次打开后再保持挂载，避免每次重载 marked/hljs 大包 */
const chatDialogMounted = ref(false)

const handleLoginRequired = () => {
  showAuthDialog.value = true
}

const handleOpenChat = () => {
  chatDialogMounted.value = true
  showChatDialog.value = true
}

const handleChatOpenChange = (open: boolean) => {
  showChatDialog.value = open
  if (open) chatDialogMounted.value = true
}

onMounted(() => {
  void authStore.initAuth()
  // 预拉站点配置，登录 Dialog 首次打开即可展示完整 OAuth 开关
  void siteStore.fetchConfig()
  window.addEventListener('auth:login-required', handleLoginRequired as EventListener)
  window.addEventListener('oml2d:open-chat', handleOpenChat)
  initLive2d()
})

onUnmounted(() => {
  window.removeEventListener('auth:login-required', handleLoginRequired as EventListener)
  window.removeEventListener('oml2d:open-chat', handleOpenChat)
})
</script>

<template>
  <RouterView />
  <AuthDialog v-if="showAuthDialog" :open="showAuthDialog" @update:open="showAuthDialog = $event" />

  <AiChatDialog
    v-if="chatDialogMounted"
    :open="showChatDialog"
    @update:open="handleChatOpenChange"
  />

  <Toaster position="top-center" :duration="3000" rich-colors style="--normal-z: 999999" />
  <ToastToaster />
</template>
