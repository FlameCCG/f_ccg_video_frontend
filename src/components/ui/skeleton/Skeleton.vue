<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: string
  /**
   * 错峰相位由全局 skeleton-shimmer 使用 --skeleton-index 与 --skeleton-step 计算。
   * 与 SkeletonGroup、VideoCardSkeleton 共享相位约定；未传入时不写内联 style。
   * 支持小数相位，上限为 8 档，避免长列表末尾等待过久。
   */
  index?: number
}

const props = defineProps<Props>()

const style = computed(() =>
  props.index === undefined
    ? undefined
    : { '--skeleton-index': String(Math.max(0, Math.min(props.index, 8))) }
)
</script>

<template>
  <div :class="cn('skeleton-shimmer rounded-md', props.class)" :style="style" />
</template>
