<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, shallowRef, watch } from 'vue'
import { ChevronLeft, ChevronRight, Tv } from 'lucide-vue-next'
import AppImage from '@/components/common/AppImage.vue'
import type { BannerItem } from '@/api/banner'
import { BannerDisplay } from '@/constants/banner'

interface Props {
  items: BannerItem[]
  autoplay?: boolean
  interval?: number
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  autoplay: true,
  interval: 5000,
  loading: false,
})

/**
 * 移动端固定 4:3（与 BannerArtSpec.homeCarousel 一致）；
 * 桌面在 scoped CSS 中用媒体查询取消固定比例并对齐父级高度。
 */
const homeCarouselMobileAspect = BannerDisplay.homeCarouselMobileAspect

const currentIndex = shallowRef(0)
const pendingIndex = shallowRef<number | null>(null)
const settledCovers = reactive(new Set<string>())
let timer: ReturnType<typeof setInterval> | null = null

const totalItems = computed(() => props.items.length)
const currentCover = computed(() => props.items[currentIndex.value]?.cover.trim() ?? '')
const showLoadingVeil = computed(
  () => props.loading || (currentCover.value.length > 0 && !settledCovers.has(currentCover.value))
)
const itemsSignature = computed(() =>
  props.items.map((item) => `${item.id}:${item.cover}`).join('\u0000')
)

const normalizeIndex = (index: number) => {
  if (index < 0) {
    return totalItems.value - 1
  }
  if (index >= totalItems.value) return 0
  return index
}

const commitIndex = (index: number) => {
  currentIndex.value = index
  pendingIndex.value = null
}

/**
 * 下一张尚未完成加载时继续保留当前画面，等目标图可显示后再交接。
 * 这样不会把 AppImage 的 loading veil 暴露成一次轮播切图。
 */
const goTo = (index: number) => {
  if (totalItems.value === 0) return

  const targetIndex = normalizeIndex(index)
  const targetCover = props.items[targetIndex]?.cover.trim()
  if (!targetCover || settledCovers.has(targetCover)) {
    commitIndex(targetIndex)
    return
  }

  pendingIndex.value = targetIndex
}

const handleSlideSettled = (cover: string, index: number) => {
  const normalizedCover = cover.trim()
  if (normalizedCover) settledCovers.add(normalizedCover)

  if (pendingIndex.value === index && props.items[index]?.cover.trim() === normalizedCover) {
    commitIndex(index)
  }
}

const prev = () => {
  goTo(currentIndex.value - 1)
}

const next = () => {
  goTo(currentIndex.value + 1)
}

const startAutoplay = () => {
  if (timer || props.loading) return

  if (props.autoplay && totalItems.value > 1) {
    timer = setInterval(() => {
      next()
    }, props.interval)
  }
}

const stopAutoplay = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const restartAutoplay = () => {
  stopAutoplay()
  startAutoplay()
}

watch([itemsSignature, () => props.autoplay, () => props.interval, () => props.loading], () => {
  pendingIndex.value = null
  if (currentIndex.value >= totalItems.value) {
    currentIndex.value = 0
  }

  restartAutoplay()
})

onMounted(() => {
  startAutoplay()
})

onUnmounted(() => {
  stopAutoplay()
})
</script>

<template>
  <div
    class="group relative h-full overflow-hidden rounded-lg"
    @mouseenter="stopAutoplay"
    @mouseleave="startAutoplay"
  >
    <!--
      内容层始终渲染：它才是撑起画幅的那一层。
      骨架不再是与内容互斥的 v-if 分支 —— 那样加载完成时轮播是「啪」地硬切，
      而同屏的视频卡片走的是 240ms 淡入，一页两种语言（这正是首页看着不统一的地方）。
      改成骨架垫在上层、加载完成后淡出（与 AppImage 的 veil 同一手法）：
      交接期间高度始终由下面的 .carousel-frame 提供，不会塌陷。
    -->
    <div
      v-if="items.length > 0"
      class="carousel-frame relative"
      :aria-hidden="showLoadingVeil || undefined"
    >
      <!--
        所有 slide 保持在视口内预加载，仅用 opacity 切换。
        目标图未 settled 时 goTo 会继续保留旧图，因此交接阶段不会露出骨架层。
      -->
      <a
        v-for="(item, index) in items"
        :key="item.id"
        :href="item.href"
        target="_blank"
        class="carousel-slide absolute inset-0 block"
        :class="{ 'is-active': index === currentIndex }"
        :aria-hidden="index === currentIndex ? undefined : true"
        :tabindex="index === currentIndex ? undefined : -1"
      >
        <AppImage
          :src="item.cover"
          :alt="`推荐位 ${index + 1}`"
          aspect="auto"
          object-position="center"
          eager
          :fetch-priority="index === 0 ? 'high' : 'low'"
          :reveal="false"
          :show-loading="false"
          fallback-variant="banner"
          @loaded="handleSlideSettled(item.cover, index)"
          @failed="handleSlideSettled(item.cover, index)"
        />
      </a>

      <!-- Navigation Arrows -->
      <button
        v-if="totalItems > 1"
        class="carousel-arrow media-chip absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 opacity-0 group-hover:opacity-100"
        aria-label="上一张轮播图"
        @click.prevent="prev"
      >
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button
        v-if="totalItems > 1"
        class="carousel-arrow media-chip absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 opacity-0 group-hover:opacity-100"
        aria-label="下一张轮播图"
        @click.prevent="next"
      >
        <ChevronRight class="h-5 w-5" />
      </button>

      <!-- Dots Indicator -->
      <div
        v-if="totalItems > 1"
        class="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2"
      >
        <button
          v-for="(_, index) in items"
          :key="index"
          class="t-tint h-2 rounded-full"
          :class="[index === currentIndex ? 'w-6 bg-card' : 'w-2 bg-card/50 hover:bg-card/70']"
          :aria-label="`切换到第 ${index + 1} 张轮播图`"
          :aria-current="index === currentIndex"
          @click="goTo(index)"
        />
      </div>
    </div>

    <div
      v-else
      class="carousel-frame carousel-empty relative flex flex-col items-center justify-center gap-2 rounded-lg border border-border/30"
      :aria-hidden="loading || undefined"
    >
      <span class="carousel-empty__well">
        <Tv class="h-5 w-5" :stroke-width="1.5" />
      </span>
      <span class="text-xs font-medium text-muted-foreground select-none">
        推荐位还空着，稍后再来看看
      </span>
    </div>

    <!-- 骨架只负责首次加载；轮播切换永远只在已完成解码的图片之间进行。 -->
    <Transition name="carousel-veil">
      <div
        v-if="showLoadingVeil"
        class="carousel-veil carousel-skeleton skeleton-shimmer"
        aria-busy="true"
        aria-label="轮播图加载中"
      >
        <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <span
            v-for="dot in 4"
            :key="dot"
            class="h-2 rounded-full carousel-skeleton__dot"
            :class="[dot === 1 ? 'w-6 carousel-skeleton__dot--active' : 'w-2']"
          ></span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
/* 比例来自 BannerDisplay.homeCarouselMobileAspect；桌面交给父级高度 */
.carousel-frame {
  width: 100%;
  overflow: hidden;
  aspect-ratio: v-bind(homeCarouselMobileAspect);

  @media (width >= 1024px) {
    aspect-ratio: auto;
    height: 100%;
    min-height: 0;
  }
}

/* 骨架垫层：脱离文档流盖在内容层上，画幅完全由下面的 .carousel-frame 决定。
   position 写在这里（未分层样式）会盖掉 @layer components 里 .skeleton-shimmer 的
   position: relative，overflow: hidden 仍然继承自那条规则，扫光不会溢出圆角。 */
.carousel-veil {
  position: absolute;
  inset: 0;
  z-index: 2;
}

.carousel-veil-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.carousel-veil-leave-to {
  opacity: 0;
}

.carousel-skeleton__dot {
  border-radius: 9999px;
  background: color-mix(in oklch, var(--color-foreground) 10%, var(--color-muted));
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-border) 20%, transparent);

  &--active {
    background: color-mix(in oklch, var(--color-foreground) 25%, var(--color-muted));
  }
}

/* 空态：与 EmptyState 同一套「光晕井」语言，但保留 banner 画幅不加额外 padding */
.carousel-empty {
  background-color: var(--color-card);

  &__well {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    color: var(--color-muted-foreground);
    background-color: color-mix(in oklch, var(--color-foreground) 4%, transparent);
    border-radius: 50%;
    box-shadow:
      inset 0 0 0 1px color-mix(in oklch, var(--color-foreground) 7%, transparent),
      0 0 0 7px color-mix(in oklch, var(--color-foreground) 2.5%, transparent),
      0 0 0 8px color-mix(in oklch, var(--color-foreground) 5%, transparent);
  }
}

.carousel-arrow {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.carousel-slide {
  z-index: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-slow) var(--ease-out-quart);
}

.carousel-slide.is-active {
  z-index: 1;
  opacity: 1;
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .carousel-slide {
    transition: none;
  }

  .carousel-skeleton.skeleton-shimmer::after {
    animation: none;
    transform: none;
  }
}
</style>
