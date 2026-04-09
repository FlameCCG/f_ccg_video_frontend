<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
</script>

<template>
  <div class="video-layout relative min-h-screen bg-card">
    <div
      class="video-layout-header sticky top-0 z-50 w-full shadow-sm bg-card border-b border-border"
    >
      <Navbar />
    </div>

    <main class="bg-card">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
/* Override Navbar's legacy white-text classes so the header follows theme tokens */
.video-layout-header :deep([class*='text-white']) {
  color: var(--color-muted-foreground) !important;
}

.video-layout-header :deep([class*='text-white']:hover) {
  color: var(--color-primary) !important;
}

.video-layout-header :deep([class*='border-white']) {
  border-color: var(--color-border) !important;
}

.video-layout-header :deep(input[type='text']) {
  color: var(--color-foreground) !important;
  background-color: var(--color-secondary) !important;
}

.video-layout-header :deep(input[type='text']:focus) {
  background-color: var(--color-card) !important;
}
</style>
