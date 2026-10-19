<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import SearchBox from '@/components/search/SearchBox.vue'
import FeedError from '@/components/common/FeedError.vue'
import VideoCard from '@/components/video/VideoCard.vue'
import VideoCardSkeleton from '@/components/common/VideoCardSkeleton.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AuthorCard from '@/components/user/AuthorCard.vue'
import { VideoSortType } from '@/api/video'
import { UserSortType } from '@/api/user'
import { useSearchResults } from '@/composables/useSearchResults'

const route = useRoute()
const router = useRouter()
const submittedKeyword = computed(() =>
  typeof route.query.keyword === 'string' ? route.query.keyword : ''
)
const keyword = ref(submittedKeyword.value)
const searchBox = ref<InstanceType<typeof SearchBox> | null>(null)
const activeTab = ref<'video' | 'user'>('video')
const activeSort = ref({ sort: 0, order: 0 })
const showFilters = ref(false)
const tabs = [
  { value: 'video' as const, label: '视频' },
  { value: 'user' as const, label: '用户' },
]
const videoSorts = [
  { sort: VideoSortType.Relevance, label: '综合排序' },
  { sort: VideoSortType.ViewCount, label: '最多播放' },
  { sort: VideoSortType.DanmakuCount, label: '最多弹幕' },
  { sort: VideoSortType.Duration, label: '时长最长' },
]
const userSorts = [
  { sort: UserSortType.Relevance, order: 0, label: '默认排序' },
  { sort: UserSortType.FollowerCount, order: 0, label: '粉丝数由高到低' },
  { sort: UserSortType.FollowerCount, order: 1, label: '粉丝数由低到高' },
  { sort: UserSortType.Level, order: 0, label: 'Lv等级由高到低' },
  { sort: UserSortType.Level, order: 1, label: 'Lv等级由低到高' },
]
const ascendingLabels: Record<number, string> = {
  0: '综合排序',
  1: '播放较少',
  2: '弹幕较少',
  3: '时长最短',
}
const currentSorts = computed(() =>
  activeTab.value === 'user'
    ? userSorts
    : videoSorts.map((item) => ({
        ...item,
        order: activeSort.value.order,
        label: activeSort.value.order === 1 ? ascendingLabels[item.sort] : item.label,
      }))
)
const activeSortKey = computed(() => `${activeSort.value.sort}_${activeSort.value.order}`)
const displayKeyword = computed(() => submittedKeyword.value.trim().slice(0, 20))
const hasActiveFilters = computed(() => activeSort.value.sort !== 0 || activeSort.value.order !== 0)
const resetFilters = () => {
  activeSort.value = { sort: 0, order: 0 }
}
watch(submittedKeyword, (value) => {
  keyword.value = value
  resetFilters()
})
watch(activeTab, resetFilters)
const {
  page,
  totalPages,
  videoTotal,
  userTotal,
  searchVideoResults,
  searchUserResults,
  isLoading,
  searchError,
  goToPage,
  retrySearch,
} = useSearchResults(submittedKeyword, activeTab, activeSort)
const hasResults = computed(() =>
  activeTab.value === 'video'
    ? searchVideoResults.value.length > 0
    : searchUserResults.value.length > 0
)
const handleSearch = (query = keyword.value) => {
  const value = query.trim()
  if (!value) return
  keyword.value = value
  if (value === submittedKeyword.value) void retrySearch()
  else void router.push({ name: 'search', query: { keyword: value } })
}
</script>
<template>
  <div class="search-page pb-10">
    <!-- Top: Centered Search Bar -->
    <div class="w-full bg-card border-b border-border py-6 mb-4">
      <div class="mx-auto flex w-full max-w-[700px] gap-2 px-4">
        <SearchBox
          ref="searchBox"
          v-model="keyword"
          large
          class="min-w-0 flex-1"
          placeholder="搜索你感兴趣的视频或 UP 主"
          @submit="handleSearch"
        />
        <Button
          class="h-12 shrink-0 rounded-md bg-primary text-base font-medium text-primary-foreground hover:bg-primary/80"
          @click="searchBox?.submit()"
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
          :aria-pressed="activeTab === tab.value"
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
      <div
        class="mb-4 mt-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex min-w-0 gap-2 overflow-x-auto pb-2">
          <button
            v-for="sort in currentSorts"
            :key="`${sort.sort}_${sort.order}`"
            class="t-tint min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13px]"
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
        <button
          v-if="activeTab === 'video'"
          type="button"
          class="ui-button flex min-h-11 shrink-0 items-center gap-2 self-start rounded-lg border border-border px-3 text-sm text-muted-foreground"
          :aria-expanded="showFilters"
          aria-controls="search-more-filters"
          @click="showFilters = !showFilters"
        >
          更多筛选 <ChevronDown class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div
        v-if="showFilters && activeTab === 'video'"
        id="search-more-filters"
        class="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary p-3"
        role="group"
        aria-label="排序方向"
      >
        <span class="mr-2 text-sm text-muted-foreground">排序方向</span>
        <button
          v-for="direction in [
            { value: 0, label: '由高到低' },
            { value: 1, label: '由低到高' },
          ]"
          :key="direction.value"
          type="button"
          class="ui-button min-h-11 rounded-lg px-3 text-sm"
          :class="
            activeSort.order === direction.value
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground'
          "
          :aria-pressed="activeSort.order === direction.value"
          @click="activeSort = { ...activeSort, order: direction.value }"
        >
          {{ direction.label }}
        </button>
      </div>
      <FeedError
        v-if="searchError && !isLoading"
        :message="searchError"
        :has-items="hasResults"
        @retry="retrySearch"
      />
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
        <div v-else-if="!searchError" key="empty" class="min-h-[400px]">
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
      <nav
        v-if="totalPages > 1 && hasResults"
        class="mt-8 flex flex-wrap items-center justify-center gap-3"
        aria-label="搜索结果分页"
      >
        <Button variant="outline" :disabled="page <= 1 || isLoading" @click="goToPage(page - 1)"
          ><ChevronLeft class="h-4 w-4" aria-hidden="true" />上一页</Button
        >
        <span class="text-sm text-muted-foreground" role="status" aria-live="polite"
          >第 {{ page }} / {{ totalPages }} 页</span
        >
        <Button
          variant="outline"
          :disabled="page >= totalPages || isLoading"
          @click="goToPage(page + 1)"
          >下一页<ChevronRight class="h-4 w-4" aria-hidden="true"
        /></Button>
      </nav>
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
