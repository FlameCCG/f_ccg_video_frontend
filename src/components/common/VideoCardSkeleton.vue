<script setup lang="ts">
/**
 * VideoCardSkeleton —— 与 VideoCard 逐像素对齐的骨架。
 *
 * 盒模型完全复制 src/components/video/VideoCard.vue：
 *   default   : 外框 rounded-[var(--radius-xl)] + border-border/50 + bg-card
 *               封面 aspect-video；信息区 px-0 py-2 h-[78px]
 *               = 8(py) + 40(标题两行 h-[40px]) + 6(mb-1.5) + 16(作者行) + 8(py)
 *   compact   : flex h-full flex-col；封面 aspect-[16/10] flex-1；信息区 px-1 py-1
 *   cover-only: 只出封面（Rank 页「左封面 + 右文字」那种排版用）
 *
 * 错峰：根节点把外部继承来的 --skeleton-index 存进 --skeleton-phase，
 * 内部各块再基于它加 0.3 ~ 0.85 的小偏移，让扫光在卡片内部由封面向下流。
 * （不能直接写 --skeleton-index: calc(var(--skeleton-index) + .3)，自引用构成循环，无效。）
 */
import { computed } from 'vue'

interface Props {
  variant?: 'default' | 'compact' | 'cover-only'
  /** 传 v-for 的下标即可，用来轻微变化标题第二行宽度，避免整屏等宽灰条 */
  seed?: number
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  seed: 0,
})

const CARD_FRAME = 'overflow-hidden rounded-[var(--radius-xl)] border border-border/50 bg-card'

const rootClass = computed(() => {
  if (props.variant === 'cover-only') return ''
  if (props.variant === 'compact') return `flex h-full flex-col ${CARD_FRAME}`
  return CARD_FRAME
})

const coverClass = computed(() => {
  if (props.variant === 'cover-only') return 'aspect-video w-full rounded-md'
  if (props.variant === 'compact') return 'aspect-[16/10] w-full flex-1'
  return 'aspect-video w-full'
})

const TITLE_TAIL_WIDTHS = ['72%', '58%', '84%', '64%']

const titleTailWidth = computed(
  () => TITLE_TAIL_WIDTHS[Math.abs(Math.trunc(props.seed)) % TITLE_TAIL_WIDTHS.length]
)
</script>

<template>
  <div class="vcs" :class="rootClass" aria-hidden="true">
    <div class="vcs__cover skeleton-shimmer" :class="coverClass"></div>

    <!-- default：标题两行 + 作者行，总高精确 78px -->
    <div v-if="variant === 'default'" class="h-[78px] px-0 py-2">
      <div class="mb-1.5 flex h-[40px] flex-col gap-[6px] pt-[3px]">
        <div class="vcs__line-a skeleton-shimmer h-[14px] w-full rounded-[4px]"></div>
        <div
          class="vcs__line-b skeleton-shimmer h-[14px] rounded-[4px]"
          :style="{ width: titleTailWidth }"
        ></div>
      </div>

      <div class="flex h-[16px] items-center gap-2">
        <div class="flex min-w-0 items-center gap-1">
          <div class="vcs__meta-a skeleton-shimmer h-[13px] w-[13px] rounded-[3px]"></div>
          <div class="vcs__meta-b skeleton-shimmer h-[10px] w-[68px] rounded-full"></div>
        </div>
        <div class="vcs__meta-c skeleton-shimmer h-[10px] w-[42px] rounded-full"></div>
      </div>
    </div>

    <!-- compact：单行标题，对齐 text-[11px] leading-tight -->
    <div v-else-if="variant === 'compact'" class="px-1 py-1">
      <div class="flex h-[13.75px] items-center">
        <div class="vcs__line-a skeleton-shimmer h-[10px] w-[86%] rounded-[3px]"></div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vcs {
  /* 把外部（SkeletonGroup / v-for :style）继承来的相位存下来，供内部块做二级偏移 */
  --skeleton-phase: var(--skeleton-index, 0);
}

.vcs__cover {
  --skeleton-index: var(--skeleton-phase);
}

.vcs__line-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.3);
}

.vcs__line-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.45);
}

.vcs__meta-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.6);
}

.vcs__meta-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.7);
}

.vcs__meta-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.85);
}
</style>
