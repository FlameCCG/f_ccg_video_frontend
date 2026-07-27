<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Info } from 'lucide-vue-next'
import { getRankVideos, type FeedItem } from '@/api/video'
import RankVideoCard from '@/components/video/RankVideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
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
  <div class="mx-auto mt-6 w-full max-w-reading px-4 pb-8 sm:px-6 lg:px-8">
    <TrendingNav />

    <div class="mb-6 mt-4 flex items-center">
      <p class="mr-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Info class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>排行榜根据内容折算，近期的数据综合展示，动态更新</span>
      </p>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll
      :loading="loading"
      :finished="finished"
      :initial-loading="initialLoading"
      @load-more="handleLoadMore"
    >
      <template #skeleton>
        <SkeletonGroup :count="10" class="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
          <div class="flex gap-4 p-2">
            <div class="relative w-[220px] shrink-0 sm:w-[260px]">
              <VideoCardSkeleton variant="cover-only" />
            </div>
            <div class="flex-1 space-y-2 py-1">
              <div class="skeleton-shimmer h-4 w-3/4 rounded-md"></div>
              <div class="skeleton-shimmer h-4 w-1/2 rounded-md"></div>
            </div>
          </div>
        </SkeletonGroup>
      </template>

      <!-- Rank Video Cards (2 columns) -->
      <div class="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
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
