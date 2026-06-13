<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { getHomeVideos, getPartitions, type FeedItem, type Partition } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import DOMPurify from 'dompurify'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import Carousel from '@/components/common/Carousel.vue'

const route = useRoute()

// State
const activePartition = ref<Partition | null>(null)
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

const shouldShowHero = computed(
  () =>
    initialLoading.value ||
    bannerLoading.value ||
    banners.value.length > 0 ||
    videos.value.length > 0
)

// Computed: Featured videos (first 6 for hero section)
const featuredVideos = computed(() => {
  if (!shouldShowHero.value) {
    return []
  }
  return videos.value.slice(0, FEATURED_COUNT)
})

// Computed: Remaining videos (after featured)
const remainingVideos = computed(() => {
  if (!shouldShowHero.value) {
    return videos.value
  }
  return videos.value.slice(FEATURED_COUNT)
})

// Partition icons are server-supplied SVG markup; sanitize before v-html.
const sanitizedPartitionIcon = computed(() =>
  activePartition.value?.icon
    ? DOMPurify.sanitize(activePartition.value.icon, {
        USE_PROFILES: { svg: true, svgFilters: true },
      })
    : ''
)

// Fetch partition info
const fetchPartitionInfo = async () => {
  try {
    const partitionId = route.params.id ? Number(route.params.id) : 0
    if (partitionId === 0) return
    const parts = await getPartitions()
    activePartition.value = parts.find((p) => p.id === partitionId) || null
  } catch (error) {
    console.error('Failed to fetch partition info:', error)
  }
}

// Fetch banners
const fetchBanners = async () => {
  bannerLoading.value = true
  try {
    const partitionId = route.params.id ? Number(route.params.id) : 0
    banners.value = await getHomeCarouselBanners(partitionId)
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
    const partitionId = route.params.id ? Number(route.params.id) : 0
    const result = await getHomeVideos({ page: page.value, pageSize, partitionId })
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

// Full load/reload
const loadData = async () => {
  page.value = 1
  banners.value = []
  videos.value = []
  finished.value = false
  initialLoading.value = true
  bannerLoading.value = true

  await nextTick()
  updateHeroBannerHeight()

  await Promise.all([fetchPartitionInfo(), fetchBanners(), fetchVideos()])

  await nextTick()
  updateHeroBannerHeight()
}

watch(
  () => route.params.id,
  () => {
    if (route.name === 'partition') {
      void loadData()
    }
  }
)

onMounted(async () => {
  // Parallel fetch
  await Promise.all([loadData(), siteTouchOnce()])

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
    <!-- Partition Header -->
    <div v-if="activePartition && !initialLoading" class="mb-8 flex items-center gap-3 sm:gap-4">
      <div class="flex items-center justify-center text-primary">
        <div
          class="h-10 w-10 sm:h-12 sm:w-12 [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-current"
          v-html="sanitizedPartitionIcon"
        />
      </div>
      <h1 class="text-3xl font-extrabold tracking-tight text-foreground/90 sm:text-4xl">
        {{ activePartition.name }}
      </h1>
    </div>

    <!-- Skeleton Partition Header -->
    <div v-else-if="initialLoading" class="mb-8 flex items-center gap-3 sm:gap-4">
      <div class="h-10 w-10 animate-pulse rounded-full bg-muted sm:h-12 sm:w-12"></div>
      <div class="h-10 w-32 animate-pulse rounded-md bg-muted sm:h-12 sm:w-40"></div>
    </div>

    <!-- Hero Section: Carousel + Featured Videos -->
    <div v-if="shouldShowHero" class="mb-6 lg:flex lg:items-start lg:gap-4">
      <div
        class="relative min-h-[220px] overflow-hidden rounded-[var(--radius-2xl)] border border-border/50 bg-card shadow-raised lg:min-w-0 lg:flex-[2]"
        :style="heroBannerHeight ? { height: `${heroBannerHeight}px` } : undefined"
      >
        <div class="home-hero-carousel block h-full w-full lg:absolute lg:inset-0">
          <Carousel
            :items="banners"
            :loading="initialLoading || bannerLoading"
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
      <!-- Skeleton Loading -->
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

<style scoped>
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
