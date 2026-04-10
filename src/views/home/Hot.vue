<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getHotVideos, type FeedItem } from '@/api/video'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import FeedError from '@/components/common/FeedError.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import TrendingNav from '@/components/navigation/TrendingNav.vue'

// State
const videos = ref<FeedItem[]>([])
const loading = ref(false)
const feedError = ref('')
const finished = ref(false)
const page = ref(1)
const pageSize = 20
const initialLoading = ref(true)

// Fetch videos
const fetchVideos = async () => {
  if (loading.value || finished.value) return

  loading.value = true
  feedError.value = ''
  try {
    const result = await getHotVideos({ page: page.value, pageSize }, { silent: true })
    if (
      result.list.length < pageSize ||
      (typeof result.total === 'number' && videos.value.length + result.list.length >= result.total)
    ) {
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

// Load more handler
const handleLoadMore = () => {
  if (feedError.value) return
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
      :disabled="!!feedError"
      :loading="loading"
      :finished="finished"
      :show-status="videos.length > 0 || loading"
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
      <FeedError
        v-if="feedError && !initialLoading"
        :message="feedError"
        :has-items="videos.length > 0"
        @retry="fetchVideos"
      />
      <EmptyState
        v-else-if="!initialLoading && !loading && videos.length === 0"
        variant="hot"
        size="lg"
        eyebrow="热度正在酝酿"
        title="下一次心动，尚未升温"
        description="还没有进入热门的作品。新的观看与喜欢，会让值得一看的内容浮现。"
      />
    </InfiniteScroll>
  </div>
</template>
