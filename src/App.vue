<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/stores/auth'
import AuthDialog from '@/components/auth/AuthDialog.vue'

const authStore = useAuthStore()
const showAuthDialog = ref(false)

const handleLoginRequired = () => {
  showAuthDialog.value = true
}

onMounted(() => {
  void authStore.initAuth()
  window.addEventListener('auth:login-required', handleLoginRequired as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('auth:login-required', handleLoginRequired as EventListener)
})
</script>

<template>
  <RouterView />
  <AuthDialog :open="showAuthDialog" @update:open="showAuthDialog = $event" />
  <Toaster position="top-center" :duration="3000" rich-colors style="--normal-z: 999999" />
</template>
