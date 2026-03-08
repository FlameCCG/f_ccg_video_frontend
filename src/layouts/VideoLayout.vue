<script setup lang="ts">
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
</script>

<template>
  <div class="relative min-h-screen bg-background">
    <!-- Solid background Navbar (no banner, no transparency) -->
    <div
      class="sticky top-0 z-50 w-full border-b border-border/50 bg-white shadow-sm dark:bg-[#18191c]"
    >
      <Navbar />
    </div>

    <main>
      <RouterView />
    </main>
  </div>
</template>
