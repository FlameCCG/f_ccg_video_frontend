<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getHomeVideos, getPartitions, type FeedItem, type Partition } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import DOMPurify from 'dompurify'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import FeedError from '@/components/common/FeedError.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Carousel from '@/components/common/Carousel.vue'
import { BannerDisplay } from '@/constants/banner'

const route = useRoute()

// State
const activePartition = ref<Partition | null>(null)
const banners = ref<BannerItem[]>([])
const videos = ref<FeedItem[]>([])
const bannerLoading = ref(true)
const loading = ref(false)
const feedError = ref('')
const finished = ref(false)
const page = ref(1)
const pageSize = 20
const initialLoading = ref(true)

// Featured videos count (shown next to carousel - 3 columns x 2 rows)
const FEATURED_COUNT = 6
const homeCarouselAspect = BannerDisplay.homeCarouselAspect

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
  feedError.value = ''
  try {
    const partitionId = route.params.id ? Number(route.params.id) : 0
    const result = await getHomeVideos(
      { page: page.value, pageSize, partitionId },
      { silent: true }
    )
    if (result.list.length < pageSize) {
      finished.value = true
    }
    videos.value = [...videos.value, ...result.list]
    page.value++
  } catch (error) {
    feedError.value = error instanceof Error ? error.message : '请稍后重试'
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
  if (feedError.value) return
  void fetchVideos()
}

// Full load/reload
const loadData = async () => {
  page.value = 1
  banners.value = []
  videos.value = []
  finished.value = false
  initialLoading.value = true
  bannerLoading.value = true

  await Promise.all([fetchPartitionInfo(), fetchBanners(), fetchVideos()])
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
})
</script>

<template>
  <div class="mx-auto mt-6 pb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Partition Header -->
    <div v-if="activePartition && !initialLoading" class="mb-8 flex items-center gap-3 sm:gap-4">
      <div class="flex items-center justify-center text-primary">
        <div
          class="partition-icon h-10 w-10 sm:h-12 sm:w-12 [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-current"
          :class="{ 'partition-icon--art': activePartition.name === '艺术' }"
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
        class="relative w-full overflow-hidden rounded-[var(--radius-2xl)] border border-border/50 bg-card shadow-raised lg:min-w-0 lg:flex-[2]"
        :style="{ aspectRatio: homeCarouselAspect }"
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

      <div class="mt-4 hidden lg:grid lg:min-w-0 lg:flex-[3] lg:grid-cols-3 lg:gap-4 lg:mt-0">
        <template v-if="initialLoading">
          <VideoCardSkeleton v-for="i in 6" :key="i" />
        </template>
        <template v-else>
          <VideoCard v-for="video in featuredVideos" :key="video.id" :video="video" />
        </template>
      </div>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll
      :disabled="!!feedError"
      :initial-loading="initialLoading"
      :loading="loading"
      :finished="finished"
      :show-status="videos.length > 0 || loading"
      @load-more="handleLoadMore"
    >
      <!-- Skeleton Loading -->
      <div
        v-if="initialLoading"
        class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      >
        <VideoCardSkeleton v-for="i in 10" :key="i" />
      </div>

      <!-- Video Cards -->
      <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <VideoCard
          v-for="(video, index) in videos"
          :key="video.id"
          :video="video"
          :class="shouldShowHero && index < FEATURED_COUNT ? 'lg:hidden' : ''"
        />
      </div>
      <FeedError
        v-if="feedError && !initialLoading"
        :message="feedError"
        :has-items="videos.length > 0"
        @retry="fetchVideos"
      />
      <EmptyState
        v-else-if="!initialLoading && !loading && videos.length === 0"
        variant="channel"
        size="lg"
        eyebrow="发现同好，从这里开始"
        title="这个分区，等一部好作品"
        description="这里暂时还没有视频。属于这个分区的故事，会从第一部作品开始。"
      />
    </InfiniteScroll>
  </div>
</template>

<style scoped lang="scss">
// 后端艺术 SVG 用 screen 叠色；浅色背景会把渐变漂白。主题变量负责切换。
.partition-icon--art :deep(svg :is(.art-blob1, .art-blob2, .art-blob3)) {
  mix-blend-mode: var(--partition-art-blend);
}

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
