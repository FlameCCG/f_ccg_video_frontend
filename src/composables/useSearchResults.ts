import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { searchVideos, type FeedItem, type VideoSortValue } from '@/api/video'
import { searchUsers, type SearchUserHit, type UserSortValue } from '@/api/user'

export function useSearchResults(
  keyword: Ref<string>,
  tab: Ref<'video' | 'user'>,
  sort: Ref<{ sort: number; order: number }>
) {
  const page = ref(1)
  const pageSize = 20
  const videoTotal = ref(0)
  const userTotal = ref(0)
  const searchVideoResults = ref<FeedItem[]>([])
  const searchUserResults = ref<SearchUserHit[]>([])
  const isLoading = ref(false)
  const searchError = ref('')
  const totalPages = computed(() =>
    Math.ceil((tab.value === 'video' ? videoTotal.value : userTotal.value) / pageSize)
  )
  let sequence = 0
  let countedKeyword = ''
  let disposed = false

  const load = async () => {
    const query = keyword.value.trim()
    const request = ++sequence
    if (!query) {
      searchVideoResults.value = []
      searchUserResults.value = []
      videoTotal.value = userTotal.value = 0
      searchError.value = ''
      isLoading.value = false
      countedKeyword = ''
      return
    }
    isLoading.value = true
    searchError.value = ''
    const currentTab = tab.value
    const params = { keyword: query, page: page.value, pageSize }
    const current = () => !disposed && request === sequence
    if (countedKeyword !== query) {
      countedKeyword = query
      videoTotal.value = userTotal.value = 0
      const updateCount =
        currentTab === 'video'
          ? searchUsers({ keyword: query, page: 1, pageSize: 1 }, { silent: true }).then(
              (result) => {
                if (!disposed && keyword.value.trim() === query) userTotal.value = result.userTotal
              }
            )
          : searchVideos({ keyword: query, page: 1, pageSize: 1 }, { silent: true }).then(
              (result) => {
                if (!disposed && keyword.value.trim() === query)
                  videoTotal.value = result.videoTotal
              }
            )
      void updateCount.catch(() => {})
    }
    try {
      if (currentTab === 'video') {
        const result = await searchVideos(
          { ...params, videoSort: sort.value.sort as VideoSortValue, videoOrder: sort.value.order },
          { silent: true }
        )
        if (!current()) return
        videoTotal.value = result.videoTotal
        searchVideoResults.value = result.videos.map((video) => ({
          ...video,
          author: { id: 0, username: video.authorUsername, avatar: '' },
        }))
      } else {
        const result = await searchUsers(
          { ...params, userSort: sort.value.sort as UserSortValue, userOrder: sort.value.order },
          { silent: true }
        )
        if (!current()) return
        userTotal.value = result.userTotal
        searchUserResults.value = result.users
      }
    } catch (error) {
      if (current())
        searchError.value = error instanceof Error ? error.message : '搜索暂时不可用，请重试'
    } finally {
      if (current()) isLoading.value = false
    }
  }

  watch(
    [keyword, tab, () => sort.value.sort, () => sort.value.order],
    () => {
      page.value = 1
      searchVideoResults.value = []
      searchUserResults.value = []
      void load()
    },
    { immediate: true }
  )

  const goToPage = (target: number) => {
    if (isLoading.value || target < 1 || target > totalPages.value) return
    page.value = target
    void load()
  }
  onScopeDispose(() => {
    disposed = true
    sequence += 1
  })
  return {
    page,
    totalPages,
    videoTotal,
    userTotal,
    searchVideoResults,
    searchUserResults,
    isLoading,
    searchError,
    goToPage,
    retrySearch: load,
  }
}
