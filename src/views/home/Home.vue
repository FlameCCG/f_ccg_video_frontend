<script setup lang="ts">
import { onMounted, computed, ref, onBeforeUnmount, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { onBeforeRouteLeave } from 'vue-router'
import { useHomeFeedStore } from '@/stores/homeFeed'
import { useVirtualGrid } from '@/composables/useVirtualGrid'
import { touchSiteStat } from '@/api/site'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import FeedError from '@/components/common/FeedError.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Carousel from '@/components/common/Carousel.vue'
import { BannerDisplay } from '@/constants/banner'

const feed = useHomeFeedStore()
const { banners, videos, loading, bannerLoading, feedError, finished, initialLoading } =
  storeToRefs(feed)
const { fetchVideos } = feed
const FEATURED_COUNT = 6
const homeCarouselAspect = BannerDisplay.homeCarouselAspect
// 轮播加载、失败和空态始终占据相同画幅，迟到的推荐位不会移动视频。
const desktop = ref(window.matchMedia('(min-width: 1024px)').matches)
const media = window.matchMedia('(min-width: 1024px)')
const syncDesktop = () => {
  desktop.value = media.matches
}
media.addEventListener('change', syncDesktop)
onBeforeUnmount(() => media.removeEventListener('change', syncDesktop))
const featuredVideos = computed(() => videos.value.slice(0, FEATURED_COUNT))
const gridVideos = computed(() =>
  desktop.value ? videos.value.slice(FEATURED_COUNT) : videos.value
)
const gridContainer = useTemplateRef<HTMLElement>('gridContainer')
const { visibleItems, spacerStyle } = useVirtualGrid(gridVideos, gridContainer, feed.scrollTop)
onBeforeRouteLeave(() => {
  feed.scrollTop = window.scrollY
})

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

onMounted(() => {
  void siteTouchOnce()
  feed.initialize()
})
</script>

<template>
  <div class="mx-auto mt-6 w-full max-w-page px-4 pb-8 sm:px-6 lg:px-8">
    <!-- 轮播保持 16:9，右侧精选位独立排版，不再反向拉伸 banner。 -->
    <div class="mb-6 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-4">
      <div
        class="home-hero-frame relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-raised lg:min-w-0"
        :style="{ aspectRatio: homeCarouselAspect }"
      >
        <div class="home-hero-carousel block h-full w-full lg:absolute lg:inset-0">
          <Carousel
            :items="banners"
            :loading="bannerLoading"
            :autoplay="true"
            :interval="5000"
            class="h-full w-full"
          />
        </div>
      </div>

      <!-- 精选和网格随视频请求展示；轮播独立交接。 -->
      <Transition name="skeleton-swap" mode="out-in">
        <SkeletonGroup
          v-if="initialLoading"
          key="featured-skeleton"
          :count="FEATURED_COUNT"
          :start="0.5"
          :step="0.5"
          class="mt-4 hidden lg:mt-0 lg:grid lg:min-w-0 lg:grid-cols-3 lg:gap-4 lg:content-start"
        >
          <template #default="{ index }">
            <VideoCardSkeleton :seed="index" />
          </template>
        </SkeletonGroup>

        <div
          v-else-if="featuredVideos.length > 0"
          key="featured"
          class="mt-4 hidden lg:mt-0 lg:grid lg:min-w-0 lg:grid-cols-3 lg:gap-4 lg:content-start"
        >
          <VideoCard v-for="video in featuredVideos" :key="video.id" :video="video" />
        </div>
      </Transition>
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
        <!-- start/step 接住 hero 精选位的相位，见上方注释 -->
        <SkeletonGroup
          :count="10"
          :start="3.5"
          :step="0.5"
          class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          <template #default="{ index }">
            <VideoCardSkeleton :seed="index" />
          </template>
        </SkeletonGroup>
      </template>

      <!-- Video Cards -->
      <div ref="gridContainer" :style="spacerStyle" class="home-feed-window">
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          <VideoCard v-for="video in visibleItems" :key="video.id" :video="video" />
        </div>
      </div>
      <FeedError
        v-if="feedError && !initialLoading"
        :message="feedError"
        :has-items="videos.length > 0"
        @retry="fetchVideos"
      />
      <EmptyState
        v-else-if="!initialLoading && !loading && videos.length === 0"
        variant="home"
        eyebrow="属于你的放映室"
        title="第一场精彩，还未开映"
        description="推荐列表暂时为空。等作品发布后，就会在这里与你见面。"
      />
    </InfiniteScroll>
  </div>
</template>

<style scoped lang="scss">
.home-feed-window :deep(.video-card__title) {
  min-height: 2.5rem;
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
