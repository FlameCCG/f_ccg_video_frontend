<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getHomeVideos, type FeedItem } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'
import { touchSiteStat } from '@/api/site'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import InfiniteScroll from '@/components/common/InfiniteScroll.vue'
import Carousel from '@/components/common/Carousel.vue'
import { BannerDisplay } from '@/constants/banner'

// State
const banners = ref<BannerItem[]>([])
const videos = ref<FeedItem[]>([])
const loading = ref(false)
const finished = ref(false)
const page = ref(1)
const pageSize = 20
/**
 * 首屏骨架的**唯一**真值：轮播、hero 精选位、下方网格三块共用。
 *
 * 原来是 bannerLoading（推荐位接口）+ initialLoading（视频接口）两个 flag 各管一块。
 * 两个接口先后返回，用户就会看到两段交接：先轮播「啪」地换成真图、右边六张还在闪，
 * 或者反过来。首屏骨架要么整屏都在，要么整屏都不在，中间态是 bug 不是过程。
 */
const initialLoading = ref(true)

// Featured videos count (shown next to carousel - 3 columns x 2 rows)
const FEATURED_COUNT = 6
/** 轮播容器与真实素材、骨架共用同一画幅。 */
const homeCarouselAspect = BannerDisplay.homeCarouselAspect

/** hero（轮播 + 精选位）是否占位：加载期间恒占，加载完才由「有没有推荐位」决定去留 */
const showHero = computed(() => initialLoading.value || banners.value.length > 0)

// Computed: Featured videos (first 6 for hero section)
const featuredVideos = computed(() => {
  if (!showHero.value) {
    return []
  }
  return videos.value.slice(0, FEATURED_COUNT)
})

// Computed: Remaining videos (after featured)
const remainingVideos = computed(() => {
  if (!showHero.value) {
    return videos.value
  }
  return videos.value.slice(FEATURED_COUNT)
})

/**
 * 首屏最多为推荐位多等这么久。
 *
 * 「同起同落」的代价是等两个请求里最慢的那个，而 axios 全局超时是 30s：
 * 推荐位接口一挂，整屏骨架就得闪半分钟。给它单独封顶，超时就按「这次没有推荐位」
 * 排版继续走。视频流刻意不封顶 —— 提前换出一个空网格比多等一会儿糟得多。
 */
const BANNER_WAIT_BUDGET = 3000

const waitAtMost = (task: Promise<void>, ms: number) =>
  Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, ms))])

// Fetch banners
const fetchBanners = async () => {
  try {
    const list = await getHomeCarouselBanners()
    // 迟到的推荐位不再插回来：首屏已经按「没有 hero」排完版，这时候再插一行
    // 会把前 6 个视频从网格里拽上去，整页重排比没有轮播更难受。
    if (!initialLoading.value) return
    banners.value = list
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
  // 打点是旁路副作用，不参与首屏交接的等待条件
  void siteTouchOnce()

  // 两个接口并行取，等**都**落地（推荐位另有封顶）再一次性收掉整屏骨架
  await Promise.all([waitAtMost(fetchBanners(), BANNER_WAIT_BUDGET), fetchVideos()])
  initialLoading.value = false
})
</script>

<template>
  <div class="mx-auto mt-6 w-full max-w-page px-4 pb-8 sm:px-6 lg:px-8">
    <!-- 轮播保持 16:9，右侧精选位独立排版，不再反向拉伸 banner。 -->
    <div v-if="showHero" class="mb-6 lg:grid lg:grid-cols-[2fr_3fr] lg:items-start lg:gap-4">
      <div
        class="home-hero-frame relative w-full overflow-hidden rounded-2xl border border-border/50 bg-card shadow-raised lg:min-w-0"
        :style="{ aspectRatio: homeCarouselAspect }"
      >
        <div class="home-hero-carousel block h-full w-full lg:absolute lg:inset-0">
          <Carousel
            :items="banners"
            :loading="initialLoading"
            :autoplay="true"
            :interval="5000"
            class="h-full w-full"
          />
        </div>
      </div>

      <!--
        精选位的骨架 ↔ 内容交接挂全局 .skeleton-swap-*，与下方 InfiniteScroll 首屏
        用的是同一条曲线；配合同一个 initialLoading，整屏骨架同起同落。

        相位接力（--skeleton-index × --skeleton-step 80ms）：
        轮播 0 → 精选 0.5~3.0 → 下方网格 3.5~8.0（卡片内部各块再 +0~0.85）。
        半步步进是为了让末档停在 8.85（708ms），仍远小于 --duration-shimmer 1600ms，
        扫光不会绕回去。整屏因此是一道光从轮播斜着推到网格底部，而不是两组各闪各的。

        content-start 让稿件不足两行时仍按内容高度靠上排列，避免隐式行被网格拉伸。
      -->
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
          v-else
          key="featured"
          class="mt-4 hidden lg:mt-0 lg:grid lg:min-w-0 lg:grid-cols-3 lg:gap-4 lg:content-start"
        >
          <VideoCard v-for="video in featuredVideos" :key="video.id" :video="video" />
        </div>
      </Transition>
    </div>

    <!-- Video Grid -->
    <InfiniteScroll
      :loading="loading"
      :finished="finished"
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
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        <VideoCard v-for="video in remainingVideos" :key="video.id" :video="video" />
      </div>
    </InfiniteScroll>
  </div>
</template>

<style scoped lang="scss">
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
