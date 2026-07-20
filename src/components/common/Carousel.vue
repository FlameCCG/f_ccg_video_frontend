<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { ChevronLeft, ChevronRight, Tv } from 'lucide-vue-next'
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

const currentIndex = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const totalItems = computed(() => props.items.length)

const goTo = (index: number) => {
  if (totalItems.value === 0) return

  if (index < 0) {
    currentIndex.value = totalItems.value - 1
  } else if (index >= totalItems.value) {
    currentIndex.value = 0
  } else {
    currentIndex.value = index
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

watch([totalItems, () => props.autoplay, () => props.interval, () => props.loading], () => {
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
    <div
      v-if="loading"
      class="carousel-frame carousel-skeleton skeleton-shimmer relative"
      aria-busy="true"
      aria-label="轮播图加载中"
    >
      <div class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        <span
          v-for="dot in 4"
          :key="dot"
          class="h-2 rounded-full carousel-skeleton__dot transition-all"
          :class="[dot === 1 ? 'w-6 carousel-skeleton__dot--active' : 'w-2']"
        ></span>
      </div>
    </div>

    <template v-else-if="items.length > 0">
      <!-- Slides -->
      <div class="carousel-frame relative">
        <TransitionGroup name="carousel">
          <a
            v-for="(item, index) in items"
            v-show="index === currentIndex"
            :key="item.id"
            :href="item.href"
            target="_blank"
            class="absolute inset-0 block"
          >
            <img
              :src="item.cover"
              :alt="`Banner ${index + 1}`"
              class="h-full w-full object-cover object-center"
            />
          </a>
        </TransitionGroup>
      </div>

      <!-- Navigation Arrows -->
      <button
        v-if="totalItems > 1"
        class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white opacity-0 transition-opacity hover:bg-black/50 group-hover:opacity-100"
        aria-label="上一张轮播图"
        @click.prevent="prev"
      >
        <ChevronLeft class="h-5 w-5" />
      </button>
      <button
        v-if="totalItems > 1"
        class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white opacity-0 transition-opacity hover:bg-black/50 group-hover:opacity-100"
        aria-label="下一张轮播图"
        @click.prevent="next"
      >
        <ChevronRight class="h-5 w-5" />
      </button>

      <!-- Dots Indicator -->
      <div v-if="totalItems > 1" class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        <button
          v-for="(_, index) in items"
          :key="index"
          class="h-2 w-2 rounded-full transition-all"
          :class="[index === currentIndex ? 'w-6 bg-card' : 'bg-card/50 hover:bg-card/70']"
          :aria-label="`切换到第 ${index + 1} 张轮播图`"
          :aria-current="index === currentIndex"
          @click="goTo(index)"
        />
      </div>
    </template>

    <div
      v-else
      class="carousel-frame banner-fallback relative flex flex-col items-center justify-center rounded-lg border border-border/30"
      aria-hidden="true"
    >
      <Tv class="h-10 w-10 mb-2 opacity-30 text-muted-foreground" />
      <span class="text-xs font-medium opacity-40 text-muted-foreground select-none">
        暂无推荐内容
      </span>
    </div>
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

.carousel-skeleton__dot {
  border-radius: 9999px;
  background: color-mix(in oklch, var(--color-foreground) 10%, var(--color-muted));
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-border) 20%, transparent);

  &--active {
    background: color-mix(in oklch, var(--color-foreground) 25%, var(--color-muted));
  }
}

.banner-fallback {
  background-color: var(--color-card) !important;
  background-image: none !important;
}

.carousel-enter-active,
.carousel-leave-active {
  transition: opacity 0.5s ease;
}

.carousel-enter-from,
.carousel-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .carousel-enter-active,
  .carousel-leave-active {
    transition: none;
  }

  .carousel-skeleton.skeleton-shimmer::after {
    animation: none;
    transform: none;
  }
}
</style>
