<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="mx-auto mt-6 mb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Placeholder Content -->
    <div class="rounded-lg bg-card p-8 text-center">
      <p class="text-muted-foreground">页面内容开发中...</p>
      <p class="mt-2 text-sm text-muted-foreground">当前路由: {{ route.path }}</p>
    </div>
  </div>
</template>
