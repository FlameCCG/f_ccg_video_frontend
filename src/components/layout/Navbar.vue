<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount, defineAsyncComponent } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter, useRoute } from 'vue-router'
import {
  Search,
  Mail,
  Upload,
  Crown,
  Zap,
  Star,
  History,
  Lightbulb,
  X,
  Trash2,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  getSearchSuggest,
  getHotSearchKeywords,
  type SearchSuggestItem,
  type HotKeywordItem,
} from '@/api/video'
import { getDynamicCounts } from '@/api/dynamic'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useSearchHistory } from '@/composables/useSearchHistory'
import { useDebounceFn } from '@vueuse/core'
import UserHoverPanel from '@/components/layout/UserHoverPanel.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import DOMPurify from 'dompurify'

/** 登录 Dialog 按需加载，避免首屏同步打包 Lain/验证码等重依赖 */
const AuthDialog = defineAsyncComponent(() => import('@/components/auth/AuthDialog.vue'))

const props = withDefaults(defineProps<{ light?: boolean }>(), { light: false })

/**
 * 顶栏叠在 banner 视频上时用 --media-overlay-text（明暗两套变量里都已定义），
 * 不再用 text-white/90 —— 那是 121 处调色板违规里最集中的一处，
 * 且暗色主题下纯白会比 banner 本身还亮。
 */
const navActionTextClass = computed(() =>
  props.light
    ? 't-tint text-muted-foreground hover:text-foreground'
    : 't-tint text-[color-mix(in_oklch,var(--media-overlay-text)_88%,transparent)] hover:text-[var(--media-overlay-text)]'
)

const avatarBorderClass = computed(() =>
  props.light
    ? 'border-border group-hover:border-primary'
    : 'border-[color-mix(in_oklch,var(--media-overlay-text)_50%,transparent)] group-hover:border-[var(--media-overlay-text)]'
)

const searchContainerClass = computed(() => (props.light ? 'search-bar-solid' : 'search-bar-glass'))

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const isSearchPage = computed(() => route.name === 'search')
const notificationStore = useNotificationStore()
const { counts } = storeToRefs(notificationStore)
const { history, addHistory, removeHistoryItem, clearHistory } = useSearchHistory()

// Auth dialog state — 首次打开后再挂载，关闭保留实例以便二次打开即时
const authDialogOpen = ref(false)
const authDialogMode = ref<'login' | 'register'>('login')
const authDialogMounted = ref(false)

const openAuthDialog = (mode: 'login' | 'register' = 'login') => {
  authDialogMode.value = mode
  authDialogMounted.value = true
  authDialogOpen.value = true
}

const openLoginDialog = () => openAuthDialog('login')

// State
const searchQuery = ref('')
const searchSuggestions = ref<SearchSuggestItem[]>([])
const showSuggestions = ref(false)
const hotKeywords = ref<HotKeywordItem[]>([])
const dynamicUnreadCount = ref(0)
const totalMessageUnread = computed(() => {
  const c = counts.value
  return c.reply + c.like + c.at + c.system + c.message
})

// Message hover panel
const showMessagePanel = ref(false)
let messageHoverTimer: ReturnType<typeof setTimeout> | null = null

const openMessagePanel = () => {
  if (messageHoverTimer) clearTimeout(messageHoverTimer)
  showMessagePanel.value = true
}

const scheduleCloseMessagePanel = () => {
  messageHoverTimer = setTimeout(() => {
    showMessagePanel.value = false
  }, 200)
}

// Fetch hot keywords on mount (no auth required)
const fetchHotKeywords = async () => {
  try {
    hotKeywords.value = await getHotSearchKeywords()
  } catch {
    /* noop */
  }
}

// Fetch Data
onMounted(async () => {
  // Hot keywords (public, no auth needed)
  void fetchHotKeywords()

  if (!authStore.isLoggedIn) return
  try {
    const [, dynResult] = await Promise.allSettled([
      notificationStore.fetchCounts(),
      getDynamicCounts(),
    ])
    if (dynResult.status === 'fulfilled') {
      dynamicUnreadCount.value = dynResult.value.unreadCount
    }
  } catch (error) {
    console.error('Failed to fetch navbar data:', error)
  }
})

// Search Logic
// 短防抖：输入即联想，同时合并连打请求；用序号丢弃过期响应
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
    // 按 value 去重：下拉用 value 作 key 做 FLIP（同一个词继续输入时条目原地保留），
    // 重复 value 会撞 key。
    const seen = new Set<string>()
    searchSuggestions.value = list
      .filter((item) => {
        if (!item.value || seen.has(item.value)) return false
        seen.add(item.value)
        return true
      })
      .map((item) => ({
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

const handleSearchInput = () => {
  showSuggestions.value = true
  const q = searchQuery.value.trim()
  // 单字也实时联想（中文「毛」、英/数「c」）
  if (!q) {
    searchSuggestions.value = []
    return
  }
  void fetchSuggestions(searchQuery.value)
}

const handleSearch = (query: string) => {
  if (!query.trim()) return
  addHistory(query)
  showSuggestions.value = false
  searchQuery.value = query
  void router.push({ name: 'search', query: { keyword: query } })
}

const handleBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

// Avatar hover panel
const showAvatarPanel = ref(false)
const avatarAreaRef = ref<HTMLDivElement | null>(null)
let hoverTimer: ReturnType<typeof setTimeout> | null = null

const openAvatarPanel = () => {
  if (hoverTimer) clearTimeout(hoverTimer)
  showAvatarPanel.value = true
}

const scheduleClosePanel = () => {
  hoverTimer = setTimeout(() => {
    showAvatarPanel.value = false
  }, 200)
}

const closePanel = () => {
  showAvatarPanel.value = false
}

const handleClickOutside = (e: MouseEvent) => {
  if (avatarAreaRef.value && !avatarAreaRef.value.contains(e.target as Node)) {
    showAvatarPanel.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  if (hoverTimer) clearTimeout(hoverTimer)
})

const sanitizeHighlight = (html: string) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['em'],
    ALLOWED_ATTR: [],
  })
}

// Nav action items
const navActions = [
  { name: '大会员', icon: Crown, path: '/vip', mobileHidden: true },
  { name: '消息', icon: Mail, path: '/message', badge: 'message' as const, isMessage: true },
  { name: '动态', icon: Zap, path: '/dynamic', badge: 'dynamic' as const },
  { name: '收藏', icon: Star, path: '/favorites' },
  { name: '历史', icon: History, path: '/history', mobileHidden: true },
  { name: '创作中心', icon: Lightbulb, path: '/creator', mobileHidden: true },
]
</script>

<template>
  <!--
    顶栏版心全站恒定 = --container-page，不跟随所在 layout 的 --shell-max。
    曾经让它跟随，想让顶栏与内容左右边缘对齐；但各 layout 的 --shell-max 是
    1800 / 1400 / 1140 三档，结果就是首页→动态→消息→视频页之间顶栏宽度来回跳，
    logo 和右侧入口每换一页就位移。顶栏是全局导航，稳定优先于与内容对齐。
  -->
  <!--
    三段式 flex：左右两侧同为 flex-1（等权），中间搜索框因此始终居中，
    不需要 absolute 定位。原来搜索框是 absolute left-1/2 + max-w-500 居中、
    右侧集群固定 481px 右对齐，两者在顶栏宽度 < 1526px 时必然重叠
    （W/2+250 > W-513）—— /dynamic(1140)、/hot·/rank(1400) 以及任何
    ≤1526px 的视口都会撞。改成 flex item 后空间不够时搜索框自己收窄，撞不了。
  -->
  <nav
    class="relative mx-auto flex h-14 w-full max-w-[var(--container-page,1800px)] items-center gap-2 px-4 sm:px-6 lg:px-8"
  >
    <!-- Left: Logo -->
    <div class="flex min-w-max flex-1 items-center gap-3 sm:gap-6">
      <router-link to="/" class="flex shrink-0 items-center gap-2">
        <img src="/logo.png" alt="Logo" class="h-10 w-auto object-contain drop-shadow-md" />
      </router-link>
    </div>

    <!-- Center: Search (hidden on search result page) -->
    <div
      v-if="!isSearchPage"
      class="relative z-20 w-full min-w-0 max-w-[500px] shrink px-2 sm:px-4"
    >
      <div class="relative w-full group">
        <div
          class="t-tint pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4"
        >
          <Search
            class="h-4 w-4"
            :class="[
              searchQuery
                ? 'text-primary'
                : props.light
                  ? 'text-muted-foreground/80'
                  : 'text-[color-mix(in_oklch,var(--media-overlay-text)_80%,transparent)] group-focus-within:text-muted-foreground/80',
            ]"
          />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          class="search-input-base flex h-10 w-full rounded-full px-4 py-2 pl-10 pr-4 text-sm"
          :class="searchContainerClass"
          placeholder="搜索视频、UP主..."
          @input="handleSearchInput"
          @keydown.enter="handleSearch(searchQuery)"
          @blur="handleBlur"
          @focus="handleSearchInput"
        />
        <!-- Suggestions / History / Hot Search Dropdown -->
        <Transition name="panel-fade">
          <div
            v-if="
              showSuggestions &&
              (searchSuggestions.length > 0 ||
                (!searchQuery.trim() && (history.length > 0 || hotKeywords.length > 0)))
            "
            class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[480px] overflow-y-auto overflow-x-hidden rounded-lg border bg-popover text-popover-foreground shadow-overlay"
          >
            <!-- Suggestions (when typing)：靠 key=value 的 TransitionGroup 做 FLIP，
                 同一个词继续输入时未变化的条目原地保留，不再整块闪一次 -->
            <TransitionGroup v-if="searchQuery.trim() && searchSuggestions.length > 0" name="sug">
              <div
                v-for="(item, index) in searchSuggestions"
                :key="item.value"
                class="search-suggestion-item flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground"
                :style="{ '--sug-i': index }"
                @mousedown.prevent="handleSearch(item.value)"
              >
                <span class="truncate" v-html="sanitizeHighlight(item.highlight)"></span>
              </div>
            </TransitionGroup>

            <!-- History + Hot Search (when empty) -->
            <template v-else-if="!searchQuery.trim()">
              <!-- Search History -->
              <template v-if="history.length > 0">
                <div
                  class="flex items-center justify-between px-4 pb-2 pt-3 text-sm text-muted-foreground"
                >
                  <span class="font-medium">搜索历史</span>
                  <button
                    class="t-tint flex items-center gap-1 hover:text-primary"
                    @mousedown.prevent="clearHistory"
                  >
                    <Trash2 class="h-3.5 w-3.5" />清空
                  </button>
                </div>
                <div class="flex flex-wrap gap-2 px-4 pb-3">
                  <div
                    v-for="item in history"
                    :key="item"
                    class="t-tint group flex cursor-pointer items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
                    @mousedown.prevent="handleSearch(item)"
                  >
                    <span class="max-w-[140px] truncate">{{ item }}</span>
                    <X
                      class="history-chip-close h-3.5 w-3.5 rounded-full p-0.5 text-muted-foreground group-hover:opacity-100"
                      @mousedown.prevent.stop="removeHistoryItem(item)"
                    />
                  </div>
                </div>
              </template>

              <!-- Hot Search Keywords -->
              <template v-if="hotKeywords.length > 0">
                <div class="px-4 pb-2 pt-3 text-sm font-medium text-muted-foreground">CCG热搜</div>
                <div class="grid grid-cols-2 gap-x-2 px-2 pb-3">
                  <div
                    v-for="(kw, idx) in hotKeywords.slice(0, 10)"
                    :key="kw.keyword"
                    class="hot-keyword-item t-tint flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent"
                    @mousedown.prevent="handleSearch(kw.keyword)"
                  >
                    <span
                      class="hot-rank tabular inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded text-xs font-bold"
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
        </Transition>
      </div>
    </div>

    <!-- Right: User Actions -->
    <div class="flex min-w-max flex-1 items-center justify-end gap-0.5 sm:gap-1">
      <!-- User Avatar (when logged in) / Login Button -->
      <template v-if="authStore.isLoggedIn">
        <div
          ref="avatarAreaRef"
          class="relative mr-4"
          @mouseenter="openAvatarPanel"
          @mouseleave="scheduleClosePanel"
        >
          <div
            class="cursor-pointer group relative z-[210] origin-top nav-avatar-wrapper"
            :class="showAvatarPanel ? 'avatar-expanded' : 'avatar-normal'"
            @click="authStore.isLoggedIn ? router.push(`/user/${authStore.userId}`) : undefined"
          >
            <AppAvatar
              :src="authStore.user?.avatar"
              :name="authStore.user?.username"
              alt="Avatar"
              :container-class="`h-8 w-8 border-2 t-tint ${showAvatarPanel ? 'border-transparent bg-transparent' : avatarBorderClass}`"
              text-class="text-xs font-bold"
            />
          </div>
          <Transition name="panel-fade">
            <div
              v-if="showAvatarPanel"
              class="absolute left-1/2 -translate-x-1/2 top-full z-[200] pt-2"
              @mouseenter="openAvatarPanel"
              @mouseleave="scheduleClosePanel"
            >
              <UserHoverPanel @close="closePanel" />
            </div>
          </Transition>
        </div>
      </template>
      <template v-else>
        <Button
          variant="default"
          size="sm"
          class="mr-1 h-8 cursor-pointer rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90 sm:mr-2 sm:px-5"
          @click="openLoginDialog"
        >
          登录
        </Button>
      </template>

      <!-- Action Items -->
      <div class="flex items-center">
        <template v-for="action in navActions" :key="action.name">
          <!-- Auth needed items -->
          <div
            v-if="authStore.isLoggedIn"
            class="relative"
            :class="action.mobileHidden ? 'hidden lg:flex' : 'flex'"
            @mouseenter="action.isMessage ? openMessagePanel() : undefined"
            @mouseleave="action.isMessage ? scheduleCloseMessagePanel() : undefined"
          >
            <router-link
              :to="action.path"
              class="group relative flex cursor-pointer flex-col items-center justify-center px-2 py-1 sm:px-3"
              :class="navActionTextClass"
            >
              <div class="relative">
                <component :is="action.icon" class="h-5 w-5" />
                <!-- Badge -->
                <span
                  v-if="action.badge === 'message' && totalMessageUnread > 0"
                  class="signal-unread-message tabular absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-2xs font-semibold"
                >
                  {{ totalMessageUnread > 99 ? '99+' : totalMessageUnread }}
                </span>
                <span
                  v-if="action.badge === 'dynamic' && dynamicUnreadCount > 0"
                  class="signal-unread-dynamic tabular absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-2xs font-semibold"
                >
                  {{ dynamicUnreadCount > 99 ? '99+' : dynamicUnreadCount }}
                </span>
              </div>
              <span class="mt-0.5 hidden text-2xs font-medium sm:block">{{ action.name }}</span>
            </router-link>

            <!-- Message Hover Dropdown -->
            <Transition name="panel-fade">
              <div
                v-if="action.isMessage && showMessagePanel"
                class="absolute left-1/2 top-full z-[200] mt-1 w-32 -translate-x-1/2 rounded-lg border bg-popover py-2 text-popover-foreground shadow-overlay"
                @mouseenter="openMessagePanel"
                @mouseleave="scheduleCloseMessagePanel"
              >
                <div class="flex flex-col text-sm">
                  <router-link
                    to="/message/reply"
                    class="t-tint flex items-center justify-between px-4 py-2 hover:bg-accent"
                  >
                    <span>回复我的</span>
                    <span
                      v-if="counts.reply > 0"
                      class="tabular rounded-full bg-destructive px-1.5 py-0.5 text-2xs text-destructive-foreground"
                      >{{ counts.reply }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/at"
                    class="t-tint flex items-center justify-between px-4 py-2 hover:bg-accent"
                  >
                    <span>@ 我的</span>
                    <span
                      v-if="counts.at > 0"
                      class="tabular rounded-full bg-destructive px-1.5 py-0.5 text-2xs text-destructive-foreground"
                      >{{ counts.at }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/love"
                    class="t-tint flex items-center justify-between px-4 py-2 hover:bg-accent"
                  >
                    <span>收到的赞</span>
                    <span
                      v-if="counts.like > 0"
                      class="tabular rounded-full bg-destructive px-1.5 py-0.5 text-2xs text-destructive-foreground"
                      >{{ counts.like }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/system"
                    class="t-tint flex items-center justify-between px-4 py-2 hover:bg-accent"
                  >
                    <span>系统通知</span>
                    <span
                      v-if="counts.system > 0"
                      class="tabular rounded-full bg-destructive px-1.5 py-0.5 text-2xs text-destructive-foreground"
                      >{{ counts.system }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/chat"
                    class="t-tint flex items-center justify-between px-4 py-2 hover:bg-accent"
                  >
                    <span>我的消息</span>
                    <span
                      v-if="counts.message > 0"
                      class="tabular rounded-full bg-destructive px-1.5 py-0.5 text-2xs text-destructive-foreground"
                      >{{ counts.message }}</span
                    >
                  </router-link>
                </div>
              </div>
            </Transition>
          </div>
          <!-- Not logged in items -->
          <div
            v-else
            class="group relative cursor-pointer flex-col items-center justify-center px-1 py-1 sm:px-3"
            :class="[navActionTextClass, action.mobileHidden ? 'hidden lg:flex' : 'flex']"
            @click="openLoginDialog"
          >
            <div class="relative">
              <component :is="action.icon" class="h-5 w-5" />
            </div>
            <span class="mt-0.5 hidden text-2xs font-medium sm:block">{{ action.name }}</span>
          </div>
        </template>
      </div>

      <slot name="after-actions" :action-text-class="navActionTextClass" />

      <!-- Upload Button -->
      <Button
        v-if="authStore.isLoggedIn"
        as-child
        size="sm"
        class="ml-1 h-8 rounded-lg border-0 bg-primary px-2 text-primary-foreground shadow-raised hover:bg-primary/90 sm:ml-3 sm:px-4"
      >
        <router-link to="/upload" class="flex items-center gap-1.5">
          <Upload class="h-4 w-4" />
          <span class="hidden sm:inline">投稿</span>
        </router-link>
      </Button>
      <Button
        v-else
        size="sm"
        class="ml-1 h-8 cursor-pointer rounded-lg border-0 bg-primary px-2 text-primary-foreground shadow-raised hover:bg-primary/90 sm:ml-3 sm:px-4"
        @click="openLoginDialog"
      >
        <Upload class="h-4 w-4" />
        <span class="hidden sm:inline">投稿</span>
      </Button>
    </div>
  </nav>

  <!-- Auth Dialog：仅用户触发登录后挂载 -->
  <AuthDialog
    v-if="authDialogMounted"
    v-model:open="authDialogOpen"
    :initial-mode="authDialogMode"
  />
</template>

<style scoped lang="scss">
/* Search suggestion highlight */
.search-suggestion-item :deep(em) {
  color: var(--color-primary, var(--brand-blue));
  font-style: normal;
  font-weight: 700;
  background: color-mix(in oklch, var(--color-primary) 12%, transparent);
  border-radius: 2px;
  padding: 0 1px;
}

/* ------------------------------------------------------------------
 * 浮层出现/消失（头像面板、消息面板、搜索联想下拉）
 * 联想下拉原来是裸 v-if：实时联想每返回一批、结果从有到无都会整块硬闪一次，
 * 而同文件里头像面板和消息面板早就有 panel-fade —— 最高频的那个反而没有。
 * ------------------------------------------------------------------ */
.panel-fade-enter-active {
  transition:
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-expo);
}

.panel-fade-leave-active {
  transition:
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quart);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

/* 联想条目：key 用 value，同一批里没变的词原地不动，
   新词做 18ms 阶梯入场（高频输入场景的上限，再大就有迟钝感），
   -move 让下拉高度变化时条目滑过去而不是跳过去。 */
.sug-move {
  transition: transform var(--duration-normal) var(--ease-out-quart);
}

.sug-enter-active {
  transition:
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-expo);
  transition-delay: calc(min(var(--sug-i, 0), 6) * 18ms);
}

.sug-leave-active {
  position: absolute;
  left: 0;
  right: 0;
  transition: opacity var(--duration-fast) linear;
}

.sug-enter-from {
  opacity: 0;
  transform: translate3d(0, -6px, 0);
}

.sug-leave-to {
  opacity: 0;
}

.avatar-normal {
  transform: scale(1) translateY(0);
  opacity: 1;
  transition:
    transform var(--duration-normal) var(--ease-out-quint),
    opacity var(--duration-fast) linear var(--duration-fast);
}

.avatar-expanded {
  transform: scale(2.5) translateY(0);
  opacity: 0;
  /* will-change 只在真正会动的那一态挂上，不常驻占合成层 */
  will-change: transform;
  transition:
    transform var(--duration-normal) var(--ease-out-quint),
    opacity var(--duration-fast) linear;
}

.history-chip-close {
  opacity: 0;
  transition:
    opacity var(--duration-fast) linear,
    background-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    background-color: color-mix(in oklch, var(--color-foreground) 12%, transparent);
  }
}

.search-input-base {
  border: 1px solid transparent;
  /* 显式列出：原来是 transition: all 0.3s ease，会把 focus 的 3px 扩散阴影一起插值，
     每次聚焦搜索框都在重绘一层阴影；ease 也不是项目的任何一条缓动 token。 */
  transition:
    background-color var(--duration-normal) var(--ease-out-quart),
    border-color var(--duration-normal) var(--ease-out-quart),
    color var(--duration-fast) linear;
  backdrop-filter: blur(var(--blur-scrim, 8px));

  &:focus-visible {
    background-color: var(--color-background);
    color: var(--color-foreground);
    border-color: color-mix(in oklch, var(--color-primary) 40%, transparent);
    /* 光晕改用 outline：不参与过渡、不触发重绘链，且与全站焦点语言同源 */
    outline: 3px solid color-mix(in oklch, var(--color-primary) 20%, transparent);
    outline-offset: 0;

    &::placeholder {
      color: color-mix(in oklch, var(--color-muted-foreground) 70%, transparent);
    }
  }
}

.search-bar-solid {
  background-color: color-mix(in oklch, var(--color-secondary) 60%, transparent);
  color: var(--color-foreground);
  box-shadow: var(--shadow-surface) inset;

  &:hover:not(:focus-visible) {
    background-color: color-mix(in oklch, var(--color-secondary) 90%, transparent);
  }

  &::placeholder {
    color: color-mix(in oklch, var(--color-muted-foreground) 70%, transparent);
  }
}

/* 玻璃态：整块改走 media-overlay 语义。
   原实现是 rgb(255,255,255,.2) / #ffffff / rgb(0,0,0,.4) 明暗各写一遍硬编码，
   正是「两套主题各手搓一次」的典型；--media-overlay-text 明暗两套都已定义，
   所以 :global(.dark) 覆盖块可以整块删掉。 */
.search-bar-glass {
  background-color: color-mix(in oklch, var(--media-overlay-text) 18%, transparent);
  border-color: color-mix(in oklch, var(--media-overlay-text) 22%, transparent);
  color: var(--media-overlay-text);
  backdrop-filter: blur(var(--blur-glass, 22px));

  &:hover:not(:focus-visible) {
    background-color: color-mix(in oklch, var(--media-overlay-text) 28%, transparent);
  }

  &::placeholder {
    color: color-mix(in oklch, var(--media-overlay-text) 68%, transparent);
  }
}
</style>
