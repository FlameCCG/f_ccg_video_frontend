<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick } from 'vue'
import { getHomeVideos, type FeedItem } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import Carousel from '@/components/common/Carousel.vue'
import { BannerDisplay } from '@/constants/banner'

// State
const banners = ref<BannerItem[]>([])
const videos = ref<FeedItem[]>([])
const bannerLoading = ref(true)
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = 20
const initialLoading = ref(true)
const featuredRailRef = ref<HTMLElement | null>(null)
const heroBannerHeight = ref<number | null>(null)
let heroResizeObserver: ResizeObserver | null = null

// Featured videos count (shown next to carousel - 3 columns x 2 rows)
const FEATURED_COUNT = 6
/** 轮播容器最小高度，与 BannerDisplay 同源 */
const homeCarouselMinHeight = BannerDisplay.homeCarouselMinHeight

// Computed: Featured videos (first 6 for hero section)
const featuredVideos = computed(() => {
  if (!bannerLoading.value && banners.value.length === 0) {
    return []
  }
  return videos.value.slice(0, FEATURED_COUNT)
})

// Computed: Remaining videos (after featured)
const remainingVideos = computed(() => {
  if (!bannerLoading.value && banners.value.length === 0) {
    return videos.value
  }
  return videos.value.slice(FEATURED_COUNT)
})

// Fetch banners
const fetchBanners = async () => {
  bannerLoading.value = true
  try {
    banners.value = await getHomeCarouselBanners()
  } catch (error) {
    console.error('Failed to fetch banners:', error)
  } finally {
    bannerLoading.value = false
  }
}

// Fetch videos
const fetchVideos = async () => {
  if (loading.value || finished.value) return

  loading.value = true
  try {
    const result = await getHomeVideos({ page: page.value, pageSize })
    if (result.list.length < pageSize) {
      finished.value = true
    }
    videos.value = [...videos.value, ...result.list]
    page.value++
  } catch (error) {
    console.error('Failed to fetch videos:', error)
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

// Site touch (打点)
const siteTouchOnce = async () => {
  try {
    await touchSiteStat()
  } catch (error) {
    console.error('Failed to touch site stat:', error)
  }
}

// Load more handler
const handleLoadMore = () => {
  void fetchVideos()
}

const updateHeroBannerHeight = () => {
  if (!featuredRailRef.value || window.innerWidth < 1024) {
    heroBannerHeight.value = null
    return
  }

  const railStyles = window.getComputedStyle(featuredRailRef.value)
  const rowGap = Number.parseFloat(railStyles.rowGap || railStyles.gap || '0')
  const columnGap = Number.parseFloat(railStyles.columnGap || railStyles.gap || '0')
  const firstVisibleCard = Array.from(featuredRailRef.value.children).find(
    (element) => window.getComputedStyle(element).display !== 'none'
  ) as HTMLElement | undefined

  const measuredCoverHeight = firstVisibleCard?.firstElementChild?.getBoundingClientRect().height
  const measuredCardHeight = firstVisibleCard?.getBoundingClientRect().height
  const railWidth = featuredRailRef.value.getBoundingClientRect().width
  const cardWidth = (railWidth - columnGap * 2) / 3
  const fallbackCoverHeight = cardWidth * (9 / 16)
  const fallbackCardHeight = fallbackCoverHeight + 79
  const coverHeight = measuredCoverHeight ?? fallbackCoverHeight
  const cardHeight = measuredCardHeight ?? fallbackCardHeight

  heroBannerHeight.value = Math.round(cardHeight + rowGap + coverHeight)
}

onMounted(async () => {
  // Initialize banner height immediately on mount so the skeleton is sized correctly
  await nextTick()
  updateHeroBannerHeight()

  // Parallel fetch
  await Promise.all([fetchBanners(), fetchVideos(), siteTouchOnce()])
  await nextTick()

  updateHeroBannerHeight()
  heroResizeObserver = new ResizeObserver(() => {
    updateHeroBannerHeight()
  })

  if (featuredRailRef.value) {
    heroResizeObserver.observe(featuredRailRef.value)
  }
})

onBeforeUnmount(() => {
  heroResizeObserver?.disconnect()
})
</script>

<template>
  <div class="mx-auto mt-6 pb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <div v-if="bannerLoading || banners.length > 0" class="mb-6 lg:flex lg:items-start lg:gap-4">
      <div
        class="relative overflow-hidden rounded-[var(--radius-2xl)] border border-border/50 bg-card shadow-raised lg:min-w-0 lg:flex-[2]"
        :style="{
          minHeight: `${homeCarouselMinHeight}px`,
          ...(heroBannerHeight ? { height: `${heroBannerHeight}px` } : {}),
        }"
      >
        <div class="home-hero-carousel block h-full w-full lg:absolute lg:inset-0">
          <Carousel
            :items="banners"
            :loading="bannerLoading"
            :autoplay="true"
            :interval="5000"
            class="h-full w-full"
          />
        </div>
      </div>

      <div
        ref="featuredRailRef"
        class="mt-4 hidden lg:grid lg:min-w-0 lg:flex-[3] lg:grid-cols-3 lg:gap-4 lg:mt-0"
      >
        <template v-if="initialLoading">
          <VideoCardSkeleton v-for="i in 6" :key="i" />
        </template>
        <template v-else>
          <VideoCard v-for="video in featuredVideos" :key="video.id" :video="video" />
        </template>
      </div>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll :loading="loading" :finished="finished" @load-more="handleLoadMore">
      <div
        v-if="initialLoading"
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        <VideoCardSkeleton v-for="i in 10" :key="i" />
      </div>

      <!-- Video Cards -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <VideoCard v-for="video in remainingVideos" :key="video.id" :video="video" />
      </div>
    </InfiniteScroll>
  </div>
</template>

<style scoped lang="scss">
@media (width >= 1024px) {
  .home-hero-carousel :deep(.group) {
    height: 100%;
  }

  .home-hero-carousel :deep(.group > div:first-child) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
}
</style>
