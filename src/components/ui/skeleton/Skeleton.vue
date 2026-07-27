<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'

interface Props {
  class?: string
  /**
   * 错峰相位。全局 `.skeleton-shimmer` 用 `--skeleton-index * --skeleton-step(80ms)`
   * 算 animation-delay，于是一屏骨架是一道光斜着掠过，而不是十几块同相位齐闪。
   * 与 SkeletonGroup.vue / VideoCardSkeleton.vue 已有的 `--skeleton-index` 约定同源；
   * 不传时不写 inline style，行为与改造前完全一致（向后兼容）。
   * 允许小数（0.3 这类二级偏移）；上限 8 档，避免长列表末尾等太久。
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
