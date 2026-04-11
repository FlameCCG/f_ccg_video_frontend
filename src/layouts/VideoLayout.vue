<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
</script>

<template>
  <div class="video-layout relative min-h-screen bg-card">
    <div
      class="video-layout-header sticky top-0 z-50 w-full shadow-sm bg-card border-b border-border"
    >
      <Navbar light />
    </div>

    <main class="bg-card">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
</style>
