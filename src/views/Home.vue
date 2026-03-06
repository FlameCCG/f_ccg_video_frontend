<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="mx-auto max-w-[2000px] px-6 py-4 sm:px-10 lg:px-16">
    <!-- Placeholder Content -->
    <div class="rounded-lg bg-card p-8 text-center">
      <p class="text-muted-foreground">页面内容开发中...</p>
      <p class="mt-2 text-sm text-muted-foreground">当前路由: {{ route.path }}</p>
    </div>
  </div>
</template>
