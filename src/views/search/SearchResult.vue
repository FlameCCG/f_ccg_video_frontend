<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, X, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import AuthorCard from '@/components/user/AuthorCard.vue'
import {
  searchVideos,
  VideoSortType,
  type VideoSortValue,
  type FeedItem,
  type SearchVideoHit,
} from '@/api/video'
import { searchUsers, UserSortType, type UserSortValue, type SearchUserHit } from '@/api/user'
import { useSearchHistory } from '@/composables/useSearchHistory'

const route = useRoute()
const router = useRouter()

const keyword = ref((route.query.keyword as string) || '')
const activeTab = ref('video') // 'video', 'user'

// Sort state: sort = which field, order = 0 desc / 1 asc
const activeSort = ref<{ sort: number; order: number }>({ sort: 0, order: 0 })

const { history, addHistory, removeHistoryItem, clearHistory } = useSearchHistory()
const showHistory = ref(false)

const videoTotal = ref(0)
const userTotal = ref(0)

const tabs = [
  { value: 'video', label: '视频' },
  { value: 'user', label: '用户' },
]

const videoSorts = [
  { sort: VideoSortType.Relevance, order: 0, label: '综合排序' },
  { sort: VideoSortType.ViewCount, order: 0, label: '最多播放' },
  { sort: VideoSortType.DanmakuCount, order: 0, label: '最多弹幕' },
  { sort: VideoSortType.Duration, order: 0, label: '时长最长' },
]

const userSorts = [
  { sort: UserSortType.Relevance, order: 0, label: '默认排序' },
  { sort: UserSortType.FollowerCount, order: 0, label: '粉丝数由高到低' },
  { sort: UserSortType.FollowerCount, order: 1, label: '粉丝数由低到高' },
  { sort: UserSortType.Level, order: 0, label: 'Lv等级由高到低' },
  { sort: UserSortType.Level, order: 1, label: 'Lv等级由低到高' },
]

const currentSorts = computed(() => {
  return activeTab.value === 'video' ? videoSorts : userSorts
})

// Derive a unique key for each sort option for active-state comparison
const activeSortKey = computed(() => `${activeSort.value.sort}_${activeSort.value.order}`)

const isLoading = ref(false)
const searchVideoResults = ref<FeedItem[]>([])
const searchUserResults = ref<SearchUserHit[]>([])

const handleSearch = () => {
  if (!keyword.value.trim()) return
  addHistory(keyword.value)
  showHistory.value = false
  void router.push({ name: 'search', query: { keyword: keyword.value } })
}

const handleHistoryItemClick = (item: string) => {
  keyword.value = item
  handleSearch()
}

const handleBlur = () => {
  setTimeout(() => {
    showHistory.value = false
  }, 200)
}

// Full search: fetch both tabs to get accurate tab badge counts
const fetchFullSearch = async () => {
  if (!keyword.value.trim()) return
  isLoading.value = true
  try {
    const [videoRes, userRes] = await Promise.all([
      searchVideos({ keyword: keyword.value, page: 1, pageSize: 20 }),
      searchUsers({ keyword: keyword.value, page: 1, pageSize: 20 }),
    ])

    videoTotal.value = videoRes.videoTotal
    userTotal.value = userRes.userTotal

    searchVideoResults.value = videoRes.videos.map((v: SearchVideoHit) => ({
      ...v,
      author: { id: 0, username: v.authorUsername, avatar: '' },
      createdAt: new Date().toISOString(),
    })) as unknown as FeedItem[]

    searchUserResults.value = userRes.users
  } catch (error) {
    console.error('Search failed:', error)
  } finally {
    isLoading.value = false
  }
}

// Tab-targeted fetch: only request the current tab's data (sort change)
const fetchCurrentTab = async () => {
  if (!keyword.value.trim()) return
  isLoading.value = true
  try {
    const { sort, order } = activeSort.value
    if (activeTab.value === 'video') {
      const videoRes = await searchVideos({
        keyword: keyword.value,
        page: 1,
        pageSize: 20,
        videoSort: sort as VideoSortValue,
        videoOrder: order,
      })
      videoTotal.value = videoRes.videoTotal
      searchVideoResults.value = videoRes.videos.map((v: SearchVideoHit) => ({
        ...v,
        author: { id: 0, username: v.authorUsername, avatar: '' },
        createdAt: new Date().toISOString(),
      })) as unknown as FeedItem[]
    } else if (activeTab.value === 'user') {
      const userRes = await searchUsers({
        keyword: keyword.value,
        page: 1,
        pageSize: 20,
        userSort: sort as UserSortValue,
        userOrder: order,
      })
      userTotal.value = userRes.userTotal
      searchUserResults.value = userRes.users
    }
  } catch (error) {
    console.error('Search failed:', error)
  } finally {
    isLoading.value = false
  }
}

// Flag to prevent sort watcher from firing during tab-switch reset
let resettingSort = false

watch(activeTab, () => {
  resettingSort = true
  activeSort.value = { sort: 0, order: 0 }
  resettingSort = false
  void fetchCurrentTab()
})

watch(activeSort, () => {
  if (!resettingSort) {
    void fetchCurrentTab()
  }
})

watch(
  () => route.query.keyword,
  (newKeyword) => {
    keyword.value = (newKeyword as string) || ''
    if (keyword.value) {
      activeSort.value = { sort: 0, order: 0 }
      void fetchFullSearch()
    }
  }
)

onMounted(() => {
  if (keyword.value) {
    void fetchFullSearch()
  }
})
</script>

<template>
  <div class="search-page pb-10">
    <!-- Top Search Header Layout -->
    <div class="w-full bg-white border-b border-[#e3e5e7] py-6 mb-4">
      <div class="mx-auto flex max-w-[1400px] gap-2 px-4 sm:px-5 lg:px-6">
        <div class="relative flex-1">
          <!-- Bilibili style big search bar -->
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <Search class="h-5 w-5 text-[#00a1d6]" />
          </div>
          <input
            v-model="keyword"
            type="text"
            class="h-12 w-full rounded-md border-2 border-[#e3e5e7] bg-[#f6f7f8] pl-12 pr-4 text-base focus:border-[#00a1d6] focus:bg-white focus:outline-none transition-colors"
            placeholder="搜索你感兴趣的视频或 UP 主"
            @keydown.enter="handleSearch"
            @focus="showHistory = true"
            @blur="handleBlur"
          />
          <!-- Search History -->
          <div
            v-if="showHistory && !keyword.trim() && history.length > 0"
            class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-80 overflow-y-auto overflow-x-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            <div
              class="flex items-center justify-between px-4 pt-3 pb-2 text-sm text-muted-foreground"
            >
              <span class="font-medium">搜索历史</span>
              <button
                class="hover:text-primary flex items-center gap-1 transition-colors"
                @mousedown.prevent="clearHistory"
              >
                <Trash2 class="h-3.5 w-3.5" />清空
              </button>
            </div>
            <div class="flex flex-wrap gap-2 px-4 pb-3">
              <div
                v-for="item in history"
                :key="item"
                class="group flex items-center gap-1 rounded-sm bg-accent/50 px-2.5 py-1.5 text-xs cursor-pointer transition-colors hover:bg-accent hover:text-primary"
                @mousedown.prevent="handleHistoryItemClick(item)"
              >
                <span class="max-w-[140px] truncate">{{ item }}</span>
                <X
                  class="h-3.5 w-3.5 p-0.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-black/10 rounded-full"
                  @mousedown.prevent.stop="removeHistoryItem(item)"
                />
              </div>
            </div>
          </div>
        </div>
        <Button
          class="h-12 w-28 rounded-md bg-[#00a1d6] text-base font-medium text-white hover:bg-[#00b5e5]"
          @click="handleSearch"
        >
          搜索
        </Button>
      </div>
    </div>

    <div class="mx-auto max-w-[1400px] px-4 sm:px-5 lg:px-6">
      <div class="mb-4 flex items-center gap-8">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="group relative pb-2 text-[15px] font-medium transition-colors"
          :class="
            activeTab === tab.value ? 'text-[#00a1d6]' : 'text-[#18191c] hover:text-[#00a1d6]'
          "
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span
            v-if="tab.value === 'video'"
            class="ml-1 rounded-sm bg-[#f1f2f3] px-1 py-[1px] text-[11px] font-normal text-[#61666d] group-hover:text-[#00a1d6] group-hover:bg-[#e6f7fc]"
            :class="activeTab === tab.value ? 'text-[#00a1d6] bg-[#e6f7fc]' : ''"
          >
            {{ videoTotal > 99 ? '99+' : videoTotal }}
          </span>
          <span
            v-else-if="tab.value === 'user'"
            class="ml-1 rounded-sm bg-[#f1f2f3] px-1 py-[1px] text-[11px] font-normal text-[#61666d] group-hover:text-[#00a1d6] group-hover:bg-[#e6f7fc]"
            :class="activeTab === tab.value ? 'text-[#00a1d6] bg-[#e6f7fc]' : ''"
          >
            {{ userTotal > 99 ? '99+' : userTotal }}
          </span>
          <!-- Active Indicator -->
          <div
            v-if="activeTab === tab.value"
            class="absolute bottom-0 left-1/2 h-[3px] w-full -translate-x-1/2 rounded-t bg-[#00a1d6]"
          ></div>
        </button>
      </div>

      <!-- Filters Row (Only for videos) -->
      <div class="flex items-center justify-between mt-2 mb-6">
        <div class="flex items-center gap-3">
          <button
            v-for="sort in currentSorts"
            :key="`${sort.sort}_${sort.order}`"
            class="rounded-full px-4 py-1.5 text-[13px] transition-colors"
            :class="
              activeSortKey === `${sort.sort}_${sort.order}`
                ? 'bg-[#e6f7fc] text-[#00a1d6]'
                : 'text-[#61666d] hover:text-[#00a1d6]'
            "
            @click="activeSort = { sort: sort.sort, order: sort.order }"
          >
            {{ sort.label }}
          </button>
        </div>
        <Button
          v-show="activeTab === 'video'"
          variant="outline"
          size="sm"
          class="h-8 rounded text-[13px] text-[#61666d]"
        >
          更多筛选 <span class="ml-1 text-[10px]">▼</span>
        </Button>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <VideoCardSkeleton v-for="i in 10" :key="i" />
      </div>

      <!-- Video Results Grid -->
      <div
        v-else-if="activeTab === 'video' && searchVideoResults.length > 0"
        class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      >
        <VideoCard
          v-for="video in searchVideoResults"
          :key="video.id"
          :video="video"
          class="w-full"
        />
      </div>

      <!-- User Results Grid -->
      <div
        v-else-if="activeTab === 'user' && searchUserResults.length > 0"
        class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      >
        <AuthorCard
          v-for="user in searchUserResults"
          :key="user.id"
          :author="{
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            level: user.level,
            description: `粉丝：${user.followerCount}`,
          }"
        />
      </div>

      <!-- Empty State -->
      <div v-else class="flex min-h-[400px] flex-col items-center justify-center text-[#9499a0]">
        <div class="mb-4 text-6xl">🔍</div>
        <p>没有找到相关结果，换个词试试吧</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Extra tweaks can be added here */
</style>
