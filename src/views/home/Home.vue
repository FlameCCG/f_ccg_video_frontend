<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getHomeVideos, type FeedItem } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import Carousel from '@/components/common/Carousel.vue'

// State
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

// Fetch banners
const fetchBanners = async () => {
  try {
    banners.value = await getHomeCarouselBanners()
  } catch (error) {
    console.error('Failed to fetch banners:', error)
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

onMounted(async () => {
  // Parallel fetch
  await Promise.all([fetchBanners(), fetchVideos(), siteTouchOnce()])
})
</script>

<template>
  <div class="mx-auto mt-6 pb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      <div
        class="col-span-2 overflow-hidden rounded-lg sm:col-span-2 md:col-span-2 lg:col-span-2 lg:row-span-2 relative"
      >
        <div
          class="block w-full h-full lg:h-auto lg:absolute lg:top-0 lg:left-0 lg:right-0 lg:bottom-[79px]"
        >
          <Carousel :items="banners" :autoplay="true" :interval="5000" class="h-full w-full" />
        </div>
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
