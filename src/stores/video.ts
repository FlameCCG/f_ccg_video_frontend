import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  getVideoDetail,
  toggleVideoLike,
  toggleVideoFavorite,
  addVideoCoin,
  tripleVideo,
  savePlayHistory,
  type VideoDetail,
  type CoinParams,
  type FavoriteParams,
  type TripleParams,
} from '@/api/video'
import { useAuthStore } from './auth'

export interface PlayerState {
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
  quality: string
  fullscreen: boolean
  pip: boolean
  theater: boolean
}

export interface InteractionState {
  isLiked: boolean
  isFavorited: boolean
  isCoined: boolean
}

export const useVideoStore = defineStore(
  'video',
  () => {
    // State
    const currentVideo = ref<VideoDetail | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)

    // Player state
    const playerState = ref<PlayerState>({
      playing: false,
      currentTime: 0,
      duration: 0,
      volume: 0.7,
      muted: false,
      playbackRate: 1,
      quality: '1080p',
      fullscreen: false,
      pip: false,
      theater: false,
    })

    // Interaction state
    const interactionState = ref<InteractionState>({
      isLiked: false,
      isFavorited: false,
      isCoined: false,
    })

    // Getters
    const videoId = computed(() => currentVideo.value?.id ?? null)
    const videoTitle = computed(() => currentVideo.value?.title ?? '')
    const videoCover = computed(() => currentVideo.value?.cover ?? '')
    const videoAuthor = computed(() => currentVideo.value?.author ?? null)
    const videoResources = computed(() => currentVideo.value?.resources ?? [])
    const videoParts = computed(() => currentVideo.value?.parts ?? [])
    const videoTags = computed(() => currentVideo.value?.tags ?? [])

    const likes = computed(() => currentVideo.value?.likes ?? 0)
    const coinCount = computed(() => currentVideo.value?.coinCount ?? 0)
    const favoriteCount = computed(() => currentVideo.value?.favoriteCount ?? 0)
    const views = computed(() => currentVideo.value?.views ?? 0)
    const danmuCount = computed(() => currentVideo.value?.danmuCount ?? 0)
    const commentCount = computed(() => currentVideo.value?.commentCount ?? 0)

    const watchProgress = computed(() => currentVideo.value?.watchProgress ?? 0)
    let fetchRequestId = 0

    // Actions

    /**
     * 获取视频详情
     */
    const fetchVideoDetail = async (id: number): Promise<boolean> => {
      const requestId = ++fetchRequestId
      isLoading.value = true
      error.value = null

      try {
        const video = await getVideoDetail(id)
        if (requestId !== fetchRequestId) {
          return false
        }
        currentVideo.value = video

        // Sync interaction state from video detail
        interactionState.value = {
          isLiked: video.isLiked,
          isFavorited: video.isFavorited,
          isCoined: video.isCoined,
        }

        return true
      } catch (e) {
        if (requestId !== fetchRequestId) {
          return false
        }
        error.value = e instanceof Error ? e.message : '获取视频详情失败'
        return false
      } finally {
        if (requestId === fetchRequestId) {
          isLoading.value = false
        }
      }
    }

    /**
     * 点赞/取消点赞
     */
    const toggleLike = async (): Promise<boolean> => {
      const authStore = useAuthStore()
      if (!authStore.isLoggedIn || !currentVideo.value) {
        return false
      }

      try {
        const result = await toggleVideoLike(currentVideo.value.id)
        interactionState.value.isLiked = !interactionState.value.isLiked
        currentVideo.value.likes = result.likes
        return true
      } catch {
        return false
      }
    }

    /**
     * 收藏/取消收藏
     */
    const toggleFavorite = async (folderId?: number): Promise<boolean> => {
      const authStore = useAuthStore()
      if (!authStore.isLoggedIn || !currentVideo.value) {
        return false
      }

      const params: FavoriteParams = {
        videoId: currentVideo.value.id,
        folderId,
      }

      try {
        const result = await toggleVideoFavorite(params)
        interactionState.value.isFavorited = !interactionState.value.isFavorited
        currentVideo.value.favoriteCount = result.favoriteCount
        return true
      } catch {
        return false
      }
    }

    /**
     * 投币
     */
    const addCoin = async (coins: 1 | 2 = 1): Promise<boolean> => {
      const authStore = useAuthStore()
      if (!authStore.isLoggedIn || !currentVideo.value) {
        return false
      }

      // Already coined
      if (interactionState.value.isCoined) {
        return false
      }

      const params: CoinParams = {
        videoId: currentVideo.value.id,
        coins,
      }

      try {
        const result = await addVideoCoin(params)
        interactionState.value.isCoined = true
        currentVideo.value.coinCount = result.coinCount
        // Update user coin count
        authStore.updateCoinCount(-coins)
        return true
      } catch {
        return false
      }
    }

    /**
     * 一键三连
     */
    const triple = async (folderId?: number, coins: 1 | 2 = 2): Promise<boolean> => {
      const authStore = useAuthStore()
      if (!authStore.isLoggedIn || !currentVideo.value) {
        return false
      }

      const params: TripleParams = {
        videoId: currentVideo.value.id,
        folderId,
        coins,
      }

      try {
        const result = await tripleVideo(params)
        interactionState.value = {
          isLiked: result.isLiked,
          isFavorited: result.isFavorited,
          isCoined: result.isCoined,
        }
        currentVideo.value.likes = result.likes
        currentVideo.value.coinCount = result.coinCount
        currentVideo.value.favoriteCount = result.favoriteCount
        // Update user coin count
        authStore.updateCoinCount(-coins)
        return true
      } catch {
        return false
      }
    }

    /**
     * 更新播放器状态
     */
    const updatePlayerState = (updates: Partial<PlayerState>) => {
      playerState.value = { ...playerState.value, ...updates }
    }

    /**
     * 保存播放进度
     */
    const saveProgress = async (): Promise<boolean> => {
      if (!currentVideo.value) {
        return false
      }

      try {
        const duration = Math.max(
          1,
          Math.round(playerState.value.duration || currentVideo.value.duration)
        )
        const progress = Math.min(duration, Math.max(0, Math.floor(playerState.value.currentTime)))

        await savePlayHistory({
          videoId: currentVideo.value.id,
          progress,
          duration,
        })
        return true
      } catch {
        return false
      }
    }

    /**
     * 清除当前视频状态
     */
    const clearVideo = () => {
      fetchRequestId++
      currentVideo.value = null
      isLoading.value = false
      error.value = null
      interactionState.value = {
        isLiked: false,
        isFavorited: false,
        isCoined: false,
      }
      playerState.value = {
        playing: false,
        currentTime: 0,
        duration: 0,
        volume: playerState.value.volume, // Keep volume
        muted: playerState.value.muted, // Keep muted
        playbackRate: 1,
        quality: '1080p',
        fullscreen: false,
        pip: false,
        theater: false,
      }
    }

    /**
     * 更新视频统计数据
     */
    const updateStats = (
      updates: Partial<
        Pick<
          VideoDetail,
          'views' | 'likes' | 'coinCount' | 'favoriteCount' | 'danmuCount' | 'commentCount'
        >
      >
    ) => {
      if (currentVideo.value) {
        Object.assign(currentVideo.value, updates)
      }
    }

    return {
      // State
      currentVideo,
      isLoading,
      error,
      playerState,
      interactionState,

      // Getters
      videoId,
      videoTitle,
      videoCover,
      videoAuthor,
      videoResources,
      videoParts,
      videoTags,
      likes,
      coinCount,
      favoriteCount,
      views,
      danmuCount,
      commentCount,
      watchProgress,

      // Actions
      fetchVideoDetail,
      toggleLike,
      toggleFavorite,
      addCoin,
      triple,
      updatePlayerState,
      saveProgress,
      clearVideo,
      updateStats,
    }
  },
  {
    persist: {
      pick: ['playerState.volume', 'playerState.muted'],
    },
  }
)
