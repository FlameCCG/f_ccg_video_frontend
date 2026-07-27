<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
</script>

<template>
  <!-- --shell-max 让 Navbar 收窄到与 VideoDetail 内容同一档，左右边缘对齐 -->
  <div
    class="video-layout relative min-h-screen bg-card"
    style="--shell-max: var(--container-reading, 1400px)"
  >
    <div
      class="video-layout-header sticky top-0 z-50 w-full border-b border-border bg-card shadow-surface"
    >
      <Navbar light />
    </div>

    <main class="bg-card">
      <RouterView v-slot="{ Component, route }">
        <Transition name="route" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
