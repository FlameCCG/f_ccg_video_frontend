<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, Search, X, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AuthorCard from '@/components/user/AuthorCard.vue'
import {
  searchVideos,
  getSearchSuggest,
  getHotSearchKeywords,
  VideoSortType,
  type VideoSortValue,
  type FeedItem,
  type SearchVideoHit,
  type SearchSuggestItem,
  type HotKeywordItem,
} from '@/api/video'
import { searchUsers, UserSortType, type UserSortValue, type SearchUserHit } from '@/api/user'
import { useSearchHistory } from '@/composables/useSearchHistory'
import { useDebounceFn } from '@vueuse/core'
import DOMPurify from 'dompurify'

const route = useRoute()
const router = useRouter()

const keyword = ref((route.query.keyword as string) || '')
const activeTab = ref('video') // 'video', 'user'

// Sort state: sort = which field, order = 0 desc / 1 asc
const activeSort = ref<{ sort: number; order: number }>({ sort: 0, order: 0 })

const { history, addHistory, removeHistoryItem, clearHistory } = useSearchHistory()

// Dropdown state
const showDropdown = ref(false)
const searchSuggestions = ref<SearchSuggestItem[]>([])
const hotKeywords = ref<HotKeywordItem[]>([])

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

/** 空态里回显用户搜的词，截断防超长词撑破布局 */
const displayKeyword = computed(() => keyword.value.trim().slice(0, 20))

/** 只有确实改过排序时才提供「清空筛选条件」，否则那个按钮点了没反应 */
const hasActiveFilters = computed(() => activeSort.value.sort !== 0 || activeSort.value.order !== 0)

const resetFilters = () => {
  activeSort.value = { sort: 0, order: 0 }
}

const isLoading = ref(false)
const searchVideoResults = ref<FeedItem[]>([])
const searchUserResults = ref<SearchUserHit[]>([])

const mapSearchVideoHit = (video: SearchVideoHit): FeedItem => ({
  id: video.id,
  title: video.title,
  cover: video.cover,
  duration: video.duration,
  views: video.views,
  danmuCount: video.danmuCount,
  author: { id: 0, username: video.authorUsername, avatar: '' },
  createdAt: video.createdAt,
  highlight: video.highlight,
})

// 短防抖 + 序号丢弃过期响应，保证每字输入都能落到最新联想
let suggestSeq = 0
const fetchSuggestions = useDebounceFn(async (prefix: string) => {
  const q = prefix.trim()
  if (!q) {
    searchSuggestions.value = []
    return
  }
  const seq = ++suggestSeq
  try {
    const list = await getSearchSuggest({ prefix: q })
    if (seq !== suggestSeq) return
    searchSuggestions.value = list.map((item) => ({
      ...item,
      highlight: ensureSuggestHighlight(item, q),
    }))
  } catch (error) {
    if (seq !== suggestSeq) return
    console.error('Failed to fetch suggestions:', error)
  }
}, 100)

/** 后端未返回 <em> 时前端兜底高亮字面匹配段 */
const ensureSuggestHighlight = (item: SearchSuggestItem, query: string) => {
  if (item.highlight?.includes('<em>')) return item.highlight
  const value = item.value || ''
  if (!query || !value) return value
  const idx = value.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return value
  return (
    value.slice(0, idx) +
    '<em>' +
    value.slice(idx, idx + query.length) +
    '</em>' +
    value.slice(idx + query.length)
  )
}

// Search input handler – fetch suggestions when typing
const handleSearchInput = () => {
  showDropdown.value = true
  const q = keyword.value.trim()
  // 单字也实时联想
  if (!q) {
    searchSuggestions.value = []
    return
  }
  void fetchSuggestions(keyword.value)
}

const handleSearch = (query?: string) => {
  const q = query ?? keyword.value
  if (!q.trim()) return
  keyword.value = q
  addHistory(q)
  showDropdown.value = false
  void router.push({ name: 'search', query: { keyword: q } })
}

const handleBlur = () => {
  setTimeout(() => {
    showDropdown.value = false
  }, 200)
}

const fetchVideoResults = async (
  params: Parameters<typeof searchVideos>[0],
  options?: { silent?: boolean }
) => {
  try {
    const videoRes = await searchVideos(params)
    videoTotal.value = videoRes.videoTotal
    searchVideoResults.value = videoRes.videos.map(mapSearchVideoHit)
  } catch (error) {
    videoTotal.value = 0
    searchVideoResults.value = []
    if (!options?.silent) {
      console.error('Video search failed:', error)
    }
  }
}

const fetchUserResults = async (
  params: Parameters<typeof searchUsers>[0],
  options?: { silent?: boolean }
) => {
  try {
    const userRes = await searchUsers(params)
    userTotal.value = userRes.userTotal
    searchUserResults.value = userRes.users
  } catch (error) {
    userTotal.value = 0
    searchUserResults.value = []
    if (!options?.silent) {
      console.error('User search failed:', error)
    }
  }
}

// Full search: fetch both tabs to get accurate tab badge counts
const fetchFullSearch = async () => {
  if (!keyword.value.trim()) return
  isLoading.value = true
  try {
    await Promise.all([
      fetchVideoResults({ keyword: keyword.value, page: 1, pageSize: 20 }, { silent: true }),
      fetchUserResults({ keyword: keyword.value, page: 1, pageSize: 20 }, { silent: true }),
    ])
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
      await fetchVideoResults({
        keyword: keyword.value,
        page: 1,
        pageSize: 20,
        videoSort: sort as VideoSortValue,
        videoOrder: order,
      })
    } else if (activeTab.value === 'user') {
      await fetchUserResults({
        keyword: keyword.value,
        page: 1,
        pageSize: 20,
        userSort: sort as UserSortValue,
        userOrder: order,
      })
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

// Fetch hot keywords on mount
const fetchHotKeywords = async () => {
  try {
    hotKeywords.value = await getHotSearchKeywords()
  } catch {
    /* noop */
  }
}

onMounted(() => {
  void fetchHotKeywords()
  if (keyword.value) {
    void fetchFullSearch()
  }
})
const sanitizeHighlight = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['em'],
    ALLOWED_ATTR: [],
  })
}
</script>

<template>
  <div class="search-page pb-10">
    <!-- Top: Centered Search Bar -->
    <div class="w-full bg-card border-b border-border py-6 mb-4">
      <div class="mx-auto flex w-full max-w-[700px] gap-2 px-4">
        <div class="relative flex-1">
          <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <Search class="h-5 w-5 text-primary" />
          </div>
          <input
            v-model="keyword"
            type="text"
            class="h-12 w-full rounded-md border-2 border-border bg-secondary pl-12 pr-4 text-base focus:border-primary focus:bg-card focus:outline-none t-tint"
            placeholder="搜索你感兴趣的视频或 UP 主"
            @input="handleSearchInput"
            @keydown.enter="handleSearch()"
            @focus="handleSearchInput"
            @blur="handleBlur"
          />
          <!-- Dropdown: Suggestions / History / Hot Keywords -->
          <div
            v-if="
              showDropdown &&
              (searchSuggestions.length > 0 ||
                (!keyword.trim() && (history.length > 0 || hotKeywords.length > 0)))
            "
            class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[480px] overflow-y-auto overflow-x-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
          >
            <!-- Suggestions (when typing) -->
            <template v-if="keyword.trim() && searchSuggestions.length > 0">
              <div
                v-for="(item, index) in searchSuggestions"
                :key="index"
                class="search-suggestion-item cursor-pointer px-4 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                @mousedown.prevent="handleSearch(item.value)"
              >
                <span class="truncate" v-html="sanitizeHighlight(item.highlight)"></span>
              </div>
            </template>

            <!-- History + Hot Search (when empty) -->
            <template v-else-if="!keyword.trim()">
              <!-- Search History -->
              <template v-if="history.length > 0">
                <div
                  class="flex items-center justify-between px-4 pt-3 pb-2 text-sm text-muted-foreground"
                >
                  <span class="font-medium">搜索历史</span>
                  <button
                    class="hover:text-primary flex items-center gap-1 t-tint"
                    @mousedown.prevent="clearHistory"
                  >
                    <Trash2 class="h-3.5 w-3.5" />清空
                  </button>
                </div>
                <div class="flex flex-wrap gap-2 px-4 pb-3">
                  <div
                    v-for="item in history"
                    :key="item"
                    class="group flex items-center gap-1 rounded-md bg-secondary text-muted-foreground px-2.5 py-1.5 text-xs cursor-pointer hover:bg-muted hover:text-foreground t-tint"
                    @mousedown.prevent="handleSearch(item)"
                  >
                    <span class="max-w-[140px] truncate">{{ item }}</span>
                    <X
                      class="history-remove h-3.5 w-3.5 rounded-full p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-foreground/10"
                      @mousedown.prevent.stop="removeHistoryItem(item)"
                    />
                  </div>
                </div>
              </template>

              <!-- Hot Search Keywords -->
              <template v-if="hotKeywords.length > 0">
                <div class="px-4 pt-3 pb-2 text-sm font-medium text-muted-foreground">CCG热搜</div>
                <div class="grid grid-cols-2 gap-x-2 px-2 pb-3">
                  <div
                    v-for="(kw, idx) in hotKeywords.slice(0, 10)"
                    :key="kw.keyword"
                    class="hot-keyword-item flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm t-tint hover:bg-accent"
                    @mousedown.prevent="handleSearch(kw.keyword)"
                  >
                    <span
                      class="hot-rank inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded text-xs font-bold"
                      :class="idx < 3 ? 'bg-primary/10 text-primary' : 'text-muted-foreground'"
                    >
                      {{ idx + 1 }}
                    </span>
                    <span class="truncate text-foreground">{{ kw.keyword }}</span>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </div>
        <Button
          class="h-12 w-28 rounded-md bg-primary text-base font-medium text-primary-foreground hover:bg-primary/80"
          @click="handleSearch()"
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
          class="group relative pb-2 text-[15px] font-medium t-tint"
          :class="activeTab === tab.value ? 'text-primary' : 'text-foreground hover:text-primary'"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
          <span
            v-if="tab.value === 'video'"
            class="ml-1 rounded-sm bg-secondary px-1 py-[1px] text-[11px] font-normal text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
            :class="activeTab === tab.value ? 'text-primary bg-primary/10' : ''"
          >
            {{ videoTotal > 99 ? '99+' : videoTotal }}
          </span>
          <span
            v-else-if="tab.value === 'user'"
            class="ml-1 rounded-sm bg-secondary px-1 py-[1px] text-[11px] font-normal text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
            :class="activeTab === tab.value ? 'text-primary bg-primary/10' : ''"
          >
            {{ userTotal > 99 ? '99+' : userTotal }}
          </span>
          <!-- Active Indicator -->
          <div
            v-if="activeTab === tab.value"
            class="absolute bottom-0 left-1/2 h-[3px] w-full -translate-x-1/2 rounded-t bg-primary"
          ></div>
        </button>
      </div>

      <!-- Filters Row (Only for videos) -->
      <div class="flex items-center justify-between mt-2 mb-6">
        <div class="flex items-center gap-3">
          <button
            v-for="sort in currentSorts"
            :key="`${sort.sort}_${sort.order}`"
            class="rounded-full px-4 py-1.5 text-[13px] t-tint"
            :class="
              activeSortKey === `${sort.sort}_${sort.order}`
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-primary'
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
          class="h-8 rounded text-[13px] text-muted-foreground"
        >
          更多筛选
          <ChevronDown class="ml-1 h-3.5 w-3.5" />
        </Button>
      </div>

      <Transition name="sr-swap" mode="out-in">
        <!-- Loading State：按当前 tab 给对应形状的骨架，不再用视频卡冒充用户卡 -->
        <SkeletonGroup
          v-if="isLoading && activeTab === 'video'"
          key="loading-video"
          :count="10"
          class="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        >
          <template #default="{ index }">
            <VideoCardSkeleton :seed="index" />
          </template>
        </SkeletonGroup>

        <SkeletonGroup
          v-else-if="isLoading"
          key="loading-user"
          :count="8"
          class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <div class="user-sk-row flex items-center gap-3 rounded-xl border border-border/50 p-4">
            <div class="skeleton-shimmer h-12 w-12 shrink-0 rounded-full"></div>
            <div class="min-w-0 flex-1 space-y-2">
              <div class="user-sk-a skeleton-shimmer h-4 w-24 rounded"></div>
              <div class="user-sk-b skeleton-shimmer h-3 w-32 rounded"></div>
            </div>
            <div class="user-sk-c skeleton-shimmer h-8 w-16 shrink-0 rounded-full"></div>
          </div>
        </SkeletonGroup>

        <!-- Video Results Grid -->
        <div
          v-else-if="activeTab === 'video' && searchVideoResults.length > 0"
          key="video"
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
          key="user"
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
        <div v-else key="empty" class="min-h-[400px]">
          <EmptyState
            size="lg"
            :icon="activeTab === 'user' ? 'user' : 'search'"
            announce
            title=""
            :description="
              activeTab === 'user'
                ? '试试完整的昵称，或去视频结果里找找 TA 的作品'
                : '试试更短的关键词，或换一种说法'
            "
          >
            <template #title>
              <template v-if="displayKeyword">
                没有找到「{{ displayKeyword }}」相关{{ activeTab === 'user' ? '用户' : '内容' }}
              </template>
              <template v-else>输入关键词开始搜索</template>
            </template>

            <Button v-if="hasActiveFilters" variant="outline" size="sm" @click="resetFilters">
              清空筛选条件
            </Button>
            <Button variant="ghost" size="sm" as-child>
              <router-link to="/hot">看看热门视频</router-link>
            </Button>
          </EmptyState>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 历史词条上的删除叉：原来是 transition-all，改成显式三条 */
.history-remove {
  transition:
    opacity var(--duration-fast) linear,
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear;
}

/* 用户卡骨架内部错峰：--skeleton-phase 定义在行容器上，子块基于它偏移
   （同一元素既读又写 --skeleton-index 会构成 CSS 循环）。 */
.user-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.user-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.3);
}

.user-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.45);
}

.user-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.6);
}

/* 骨架 ↔ 结果交叉淡出，避免整栅格硬切 */
.sr-swap-leave-active {
  transition: opacity var(--duration-fast) linear;
}

.sr-swap-enter-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.sr-swap-enter-from,
.sr-swap-leave-to {
  opacity: 0;
}

/* Search suggestion highlight */
.search-suggestion-item :deep(em) {
  color: var(--brand-blue, oklch(var(--primary)));
  font-style: normal;
  font-weight: 700;
  background: oklch(var(--primary) / 0.12);
  border-radius: 2px;
  padding: 0 1px;
}
</style>
