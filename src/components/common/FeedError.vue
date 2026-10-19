<script setup lang="ts">
import { Button } from '@/components/ui/button'
import EmptyState from './EmptyState.vue'
defineProps<{ message: string; hasItems?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div
    v-if="hasItems"
    class="status-surface-warning my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
    role="alert"
  >
    <p class="text-sm">加载更多内容失败：{{ message }}</p>
    <Button variant="outline" size="sm" @click="$emit('retry')">重新加载</Button>
  </div>
  <EmptyState v-else icon="offline" title="内容暂时没能加载" :description="message" announce>
    <Button variant="outline" @click="$emit('retry')">重新加载</Button>
  </EmptyState>
</template>
