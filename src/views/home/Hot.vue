<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getHotVideos, type FeedItem } from '@/api/video'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import { Flame } from 'lucide-vue-next'

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
  <div class="mx-auto mt-6 mb-8 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Page Header -->
    <div class="mb-6 flex items-center gap-3">
      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10">
        <Flame class="h-5 w-5 text-orange-500" />
      </div>
      <div>
        <h1 class="text-xl font-semibold text-foreground">综合热门</h1>
        <p class="text-sm text-muted-foreground">热度最高的视频，最多保留 Top200</p>
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
