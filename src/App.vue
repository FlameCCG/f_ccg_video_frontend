<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(() => {
  void authStore.initAuth()
})
</script>

<template>
  <RouterView />
  <Toaster position="top-center" :duration="3000" rich-colors />
</template>
