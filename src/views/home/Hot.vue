<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getHotVideos, type FeedItem } from '@/api/video'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import TrendingNav from '@/components/navigation/TrendingNav.vue'

// State
const videos = ref<FeedItem[]>([])
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = 20
const initialLoading = ref(true)

// Fetch videos
const fetchVideos = async () => {
  if (loading.value || finished.value) return

  loading.value = true
  try {
    const result = await getHotVideos({ page: page.value, pageSize })
    if (result.list.length < pageSize) {
      finished.value = true
    }
    videos.value = [...videos.value, ...result.list]
    page.value++
  } catch (error) {
    console.error('Failed to fetch hot videos:', error)
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

// Load more handler
const handleLoadMore = () => {
  void fetchVideos()
}

onMounted(() => {
  void fetchVideos()
})
</script>

<template>
  <div class="mx-auto mt-6 mb-8 max-w-[1400px] px-4 sm:px-6 lg:px-8">
    <TrendingNav />

    <!-- Page Header (Optional, but image 1 also has some subtle text "各个领域中新奇好玩的优质内容都在这里~") -->
    <div class="mb-4 flex items-center justify-between">
      <p class="text-sm text-muted-foreground mt-4">各个领域中新奇好玩的优质内容都在这里~</p>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll :loading="loading" :finished="finished" @load-more="handleLoadMore">
      <!-- Skeleton Loading -->
      <div
        v-if="initialLoading"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        <VideoCardSkeleton v-for="i in 10" :key="i" />
      </div>

      <!-- Video Cards -->
      <div
        v-else
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        <VideoCard v-for="video in videos" :key="video.id" :video="video" />
      </div>
    </InfiniteScroll>
  </div>
</template>
