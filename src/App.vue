<script setup lang="ts">
import { defineAsyncComponent, ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { toast } from 'vue-sonner'
import { Toaster } from '@/components/ui/sonner'
import { Toaster as ToastToaster } from '@/components/ui/toast'
import { getAccessToken } from '@/api/request'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import { initLive2d } from '@/utils/live2d'

const AuthDialog = defineAsyncComponent(() => import('@/components/auth/AuthDialog.vue'))
const AiChatDialog = defineAsyncComponent(() => import('@/components/ai/AiChatDialog.vue'))

const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const siteStore = useSiteStore()
useThemeStore()
const showAuthDialog = ref(false)
const showChatDialog = ref(false)
/** 首次打开后再保持挂载，避免每次重载 marked/hljs 大包 */
const chatDialogMounted = ref(false)

/** 清登录态相关 UI（头像、未读角标等） */
const syncLoggedOutUi = () => {
  authStore.clearAuth()
  notificationStore.clearAllCounts()
}

/**
 * token 过期：同步清掉 Pinia 登录态（头像、用户名等），再打开登录框。
 * 仅 clearTokens 不够——Navbar 看的是 authStore.isLoggedIn / user。
 */
const handleSessionExpired = (event?: Event) => {
  const wasLoggedIn = authStore.isLoggedIn || !!authStore.user
  if (wasLoggedIn) {
    // clearAuth 无「已退出登录」toast，避免与过期提示重复
    syncLoggedOutUi()
    const detail = (event as CustomEvent<{ message?: string }> | undefined)?.detail
    toast.error(detail?.message || '登录已过期，请重新登录')
  }
  showAuthDialog.value = true
}

/** 业务要求登录（如 OAuth 回跳）：只弹登录框，不误报「登录已过期」 */
const handleLoginRequired = () => {
  // 若 localStorage token 已空但 Pinia 仍有登录态，补齐清理（头像等）
  if (!getAccessToken() && (authStore.isLoggedIn || authStore.user)) {
    syncLoggedOutUi()
  }
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
  window.addEventListener('auth:session-expired', handleSessionExpired as EventListener)
  window.addEventListener('auth:login-required', handleLoginRequired as EventListener)
  window.addEventListener('oml2d:open-chat', handleOpenChat)
  initLive2d()
})

onUnmounted(() => {
  window.removeEventListener('auth:session-expired', handleSessionExpired as EventListener)
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
