<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'

let wasDark = false

onMounted(() => {
  wasDark = document.documentElement.classList.contains('dark')
  document.documentElement.classList.remove('dark')
})

onBeforeUnmount(() => {
  if (wasDark) {
    document.documentElement.classList.add('dark')
  }
})
</script>

<template>
  <div class="video-layout relative min-h-screen bg-white">
    <div
      class="video-layout-header sticky top-0 z-50 w-full shadow-sm bg-white border-b border-[#e3e5e7]"
    >
      <Navbar />
    </div>

    <main class="bg-white">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/* Override Navbar's white-text classes for solid white header */
.video-layout-header :deep([class*='text-white']) {
  color: #61666d !important;
}

.video-layout-header :deep([class*='text-white']:hover) {
  color: #00a1d6 !important;
}

.video-layout-header :deep([class*='border-white']) {
  border-color: #e3e5e7 !important;
}

.video-layout-header :deep(input[type='text']) {
  color: #18191c !important;
  background: #f1f2f3 !important;
}

.video-layout-header :deep(input[type='text']:focus) {
  background: #fff !important;
}
</style>
