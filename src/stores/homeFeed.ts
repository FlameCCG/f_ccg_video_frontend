import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getHomeVideos, type FeedItem } from '@/api/video'
import { getHomeCarouselBanners, type BannerItem } from '@/api/banner'

/** 会话内缓存数据与分页，不把长列表写进 localStorage，也不保留离屏卡片 DOM。 */
export const useHomeFeedStore = defineStore('home-feed', () => {
  const banners = ref<BannerItem[]>([])
  const videos = ref<FeedItem[]>([])
  const loading = ref(false)
  const bannerLoading = ref(true)
  const initialLoading = ref(true)
  const feedError = ref('')
  const finished = ref(false)
  const page = ref(1)
  const scrollTop = ref(0)
  let started = false
  const pageSize = 20

  const fetchVideos = async () => {
    if (loading.value || finished.value) return
    loading.value = true
    feedError.value = ''
    try {
      const result = await getHomeVideos({ page: page.value, pageSize }, { silent: true })
      videos.value.push(...result.list)
      finished.value =
        result.list.length < pageSize ||
        (typeof result.total === 'number' && videos.value.length >= result.total)
      page.value++
    } catch (error) {
      feedError.value = error instanceof Error ? error.message : '请稍后重试'
    } finally {
      loading.value = false
      initialLoading.value = false
    }
  }

  const fetchBanners = async () => {
    try {
      banners.value = await getHomeCarouselBanners()
    } catch {
      // 轮播失败时保留同尺寸空态，不影响视频流。
    } finally {
      bannerLoading.value = false
    }
  }

  const initialize = () => {
    if (started) return
    started = true
    void fetchBanners()
    void fetchVideos()
  }

  return {
    banners,
    videos,
    loading,
    bannerLoading,
    initialLoading,
    feedError,
    finished,
    page,
    scrollTop,
    fetchVideos,
    initialize,
  }
})
