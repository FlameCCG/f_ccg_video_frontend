<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getHomeVideos, getPartitions, type FeedItem, type Partition } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import Carousel from '@/components/common/Carousel.vue'

const route = useRoute()

// State
const activePartition = ref<Partition | null>(null)
const banners = ref<BannerItem[]>([])
const videos = ref<FeedItem[]>([])
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = 20
const initialLoading = ref(true)

// Featured videos count (shown next to carousel - 3 columns x 2 rows)
const FEATURED_COUNT = 6

// Computed: Featured videos (first 8 for hero section)
const featuredVideos = computed(() => videos.value.slice(0, FEATURED_COUNT))

// Computed: Remaining videos (after featured)
const remainingVideos = computed(() => videos.value.slice(FEATURED_COUNT))

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
  try {
    const partitionId = route.params.id ? Number(route.params.id) : 0
    banners.value = await getHomeCarouselBanners(partitionId)
  } catch (error) {
    console.error('Failed to fetch banners:', error)
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

// Full load/reload
const loadData = async () => {
  page.value = 1
  videos.value = []
  finished.value = false
  initialLoading.value = true
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
  <div class="mx-auto mt-6 mb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Partition Header -->
    <div v-if="activePartition && !initialLoading" class="mb-8 flex items-center gap-3 sm:gap-4">
      <div class="flex items-center justify-center text-primary">
        <div
          class="h-10 w-10 sm:h-12 sm:w-12 [&>svg]:h-full [&>svg]:w-full [&>svg]:fill-current"
          v-html="activePartition.icon"
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

    <!-- Hero Section: Carousel + Featured Videos using same grid as below -->
    <div
      class="mb-6 grid auto-rows-fr grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      <!-- Carousel Banner (spans 2 columns on lg) -->
      <div
        class="col-span-2 row-span-2 overflow-hidden rounded-lg sm:col-span-2 md:col-span-2 lg:col-span-2"
      >
        <Carousel :items="banners" :autoplay="true" :interval="5000" class="h-full" />
      </div>

      <!-- Featured Videos (same grid cells as below) -->
      <template v-if="initialLoading">
        <VideoCardSkeleton v-for="i in 6" :key="i" class="hidden lg:block" />
      </template>
      <template v-else>
        <VideoCard
          v-for="video in featuredVideos"
          :key="video.id"
          :video="video"
          class="hidden lg:block"
        />
      </template>
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
