<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getRankVideos, type FeedItem } from '@/api/video'
import RankVideoCard from '@/components/video/RankVideoCard.vue'
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
  <div class="mx-auto mt-6 pb-8 max-w-[1400px] px-4 sm:px-6 lg:px-8">
    <TrendingNav />

    <!-- Page Header text (Image 2: 排行榜根据内容折算，近期的数据综合展示，动态更新) -->
    <div class="mb-6 flex items-center mt-4">
      <div class="flex items-center gap-1 text-sm text-muted-foreground mr-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="lucide lucide-info"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>排行榜根据内容折算，近期的数据综合展示，动态更新</span>
      </div>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll :loading="loading" :finished="finished" @load-more="handleLoadMore">
      <!-- Skeleton Loading -->
      <div v-if="initialLoading" class="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        <div v-for="i in 10" :key="i" class="flex gap-4 p-2">
          <div class="relative shrink-0"><VideoCardSkeleton class="w-[220px] sm:w-[260px]" /></div>
          <div class="flex-1 space-y-2 py-1">
            <div class="h-4 w-3/4 rounded bg-muted"></div>
            <div class="h-4 w-1/2 rounded bg-muted"></div>
          </div>
        </div>
      </div>

      <!-- Rank Video Cards (2 columns) -->
      <div v-else class="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        <RankVideoCard
          v-for="(video, index) in videos"
          :key="video.id"
          :video="video"
          :rank="index + 1"
        />
      </div>
    </InfiniteScroll>
  </div>
</template>
