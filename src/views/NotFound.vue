<script setup lang="ts">
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
</script>

<template>
  <div class="mx-auto grid min-h-[65vh] max-w-reading place-items-center px-4">
    <EmptyState
      size="lg"
      icon="file"
      title="这个页面不在这里"
      description="链接可能已失效，回首页继续发现感兴趣的视频。"
    >
      <Button as-child><router-link to="/">返回首页</router-link></Button>
      <Button variant="outline" as-child><router-link to="/search">搜索视频</router-link></Button>
    </EmptyState>
  </div>
</template>
