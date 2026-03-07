<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getRankVideos, type FeedItem } from '@/api/video'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import { Trophy } from 'lucide-vue-next'

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
    const result = await getRankVideos({ page: page.value, pageSize })
    if (result.list.length < pageSize) {
      finished.value = true
    }
    videos.value = [...videos.value, ...result.list]
    page.value++
  } catch (error) {
    console.error('Failed to fetch rank videos:', error)
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
  <div class="mx-auto mt-6 mb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Page Header -->
    <div class="mb-6 flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/10">
        <Trophy class="h-5 w-5 text-yellow-500" />
      </div>
      <div>
        <h1 class="text-xl font-semibold text-foreground">综合排行榜</h1>
        <p class="text-sm text-muted-foreground">全站综合排名 Top100</p>
      </div>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll :loading="loading" :finished="finished" @load-more="handleLoadMore">
      <!-- Skeleton Loading -->
      <div
        v-if="initialLoading"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <VideoCardSkeleton v-for="i in 12" :key="i" />
      </div>

      <!-- Video Cards -->
      <div
        v-else
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <VideoCard v-for="video in videos" :key="video.id" :video="video" />
      </div>
    </InfiniteScroll>
  </div>
</template>
