<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getHotVideos, type FeedItem } from '@/api/video'
import VideoCard from '@/components/video/VideoCard.vue'
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
  <div class="mx-auto mt-6 w-full max-w-reading px-4 pb-8 sm:px-6 lg:px-8">
    <TrendingNav />

    <div class="mb-4 mt-4 flex items-center justify-between">
      <p class="text-sm leading-cjk text-muted-foreground">各个领域中新奇好玩的优质内容都在这里</p>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll
      :loading="loading"
      :finished="finished"
      :initial-loading="initialLoading"
      @load-more="handleLoadMore"
    >
      <template #skeleton>
        <SkeletonGroup
          :count="10"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          <template #default="{ index }">
            <VideoCardSkeleton :seed="index" />
          </template>
        </SkeletonGroup>
      </template>

      <!-- Video Cards -->
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <VideoCard v-for="video in videos" :key="video.id" :video="video" />
      </div>
    </InfiniteScroll>
  </div>
</template>
