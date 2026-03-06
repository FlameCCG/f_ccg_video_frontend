import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getNotificationCounts, type NotificationCounts } from '@/api/notification'
import { useAuthStore } from './auth'

export const useNotificationStore = defineStore('notification', () => {
  // State
  const counts = ref<NotificationCounts>({
    reply: 0,
    like: 0,
    at: 0,
    system: 0,
    message: 0,
  })
  const isLoading = ref(false)
  const lastFetchTime = ref<number | null>(null)

  // Getters
  const totalUnread = computed(() => {
    return counts.value.reply + counts.value.like + counts.value.at + counts.value.system
  })

  const hasUnread = computed(() => totalUnread.value > 0)

  const replyCount = computed(() => counts.value.reply)
  const likeCount = computed(() => counts.value.like)
  const atCount = computed(() => counts.value.at)
  const systemCount = computed(() => counts.value.system)
  const messageCount = computed(() => counts.value.message)

  // Actions

  /**
   * 获取通知数量
   */
  const fetchCounts = async (): Promise<boolean> => {
    const authStore = useAuthStore()
    if (!authStore.isLoggedIn) {
      return false
    }

    isLoading.value = true

    try {
      const result = await getNotificationCounts()
      counts.value = result
      lastFetchTime.value = Date.now()
      return true
    } catch {
      return false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 更新特定类别的通知数量
   */
  const updateCount = (category: keyof NotificationCounts, delta: number) => {
    counts.value[category] = Math.max(0, counts.value[category] + delta)
  }

  /**
   * 清除特定类别的通知数量
   */
  const clearCount = (category: keyof NotificationCounts) => {
    counts.value[category] = 0
  }

  /**
   * 清除所有通知数量
   */
  const clearAllCounts = () => {
    counts.value = {
      reply: 0,
      like: 0,
      at: 0,
      system: 0,
      message: 0,
    }
  }

  /**
   * 标记回复已读后更新数量
   */
  const markReplyRead = (count: number = 1) => {
    updateCount('reply', -count)
  }

  /**
   * 标记点赞已读后更新数量
   */
  const markLikeRead = (count: number = 1) => {
    updateCount('like', -count)
  }

  /**
   * 标记@已读后更新数量
   */
  const markAtRead = (count: number = 1) => {
    updateCount('at', -count)
  }

  /**
   * 标记系统通知已读后更新数量
   */
  const markSystemRead = (count: number = 1) => {
    updateCount('system', -count)
  }

  /**
   * 标记私信已读后更新数量
   */
  const markMessageRead = (count: number = 1) => {
    updateCount('message', -count)
  }

  return {
    // State
    counts,
    isLoading,
    lastFetchTime,

    // Getters
    totalUnread,
    hasUnread,
    replyCount,
    likeCount,
    atCount,
    systemCount,
    messageCount,

    // Actions
    fetchCounts,
    updateCount,
    clearCount,
    clearAllCounts,
    markReplyRead,
    markLikeRead,
    markAtRead,
    markSystemRead,
    markMessageRead,
  }
})
