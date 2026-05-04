<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { Toaster as ToastToaster } from '@/components/ui/toast'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import AuthDialog from '@/components/auth/AuthDialog.vue'
import XaiChatDialog from '@/components/xai/XaiChatDialog.vue'
import { initLive2d } from '@/utils/live2d'

const authStore = useAuthStore()
useThemeStore()
const showAuthDialog = ref(false)
const showChatDialog = ref(false)

const handleLoginRequired = () => {
  showAuthDialog.value = true
}

const handleOpenChat = () => {
  showChatDialog.value = true
}

onMounted(() => {
  void authStore.initAuth()
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
  <AuthDialog :open="showAuthDialog" @update:open="showAuthDialog = $event" />

  <XaiChatDialog :open="showChatDialog" @update:open="showChatDialog = $event" />

  <Toaster position="top-center" :duration="3000" rich-colors style="--normal-z: 999999" />
  <ToastToaster />
</template>
