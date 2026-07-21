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

const navActionTextClass = computed(() =>
  props.light
    ? 'text-muted-foreground transition-colors hover:text-foreground'
    : 'text-white/90 transition-colors hover:text-white'
)

const avatarBorderClass = computed(() =>
  props.light
    ? 'border-border group-hover:border-primary'
    : 'border-white/50 group-hover:border-white'
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
  return value.slice(0, idx) + '<em>' + value.slice(idx, idx + query.length) + '</em>' + value.slice(idx + query.length)
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
  <nav
    class="relative mx-auto flex h-14 max-w-[1800px] items-center justify-between gap-1 px-3 sm:gap-2 sm:px-6 lg:px-8"
  >
    <!-- Left: Logo -->
    <div class="flex items-center gap-3 sm:gap-6">
      <router-link to="/" class="flex items-center gap-2">
        <img src="/logo.png" alt="Logo" class="h-10 w-auto object-contain drop-shadow-md" />
      </router-link>
    </div>

    <!-- Center: Search (hidden on search result page) -->
    <div
      v-if="!isSearchPage"
      class="absolute left-1/2 top-1/2 z-10 w-full max-w-[500px] -translate-x-1/2 -translate-y-1/2 px-4"
    >
      <div class="relative w-full group">
        <div
          class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 z-10 transition-colors duration-300"
        >
          <Search
            class="h-4 w-4"
            :class="[
              searchQuery
                ? 'text-primary'
                : props.light
                  ? 'text-muted-foreground/80'
                  : 'text-white/80 group-focus-within:text-muted-foreground/80',
            ]"
          />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          class="flex h-10 w-full rounded-full px-4 py-2 pl-10 pr-4 text-sm focus-visible:outline-none search-input-base"
          :class="searchContainerClass"
          placeholder="搜索视频、UP主..."
          @input="handleSearchInput"
          @keydown.enter="handleSearch(searchQuery)"
          @blur="handleBlur"
          @focus="handleSearchInput"
        />
        <!-- Suggestions / History / Hot Search Dropdown -->
        <div
          v-if="
            showSuggestions &&
            (searchSuggestions.length > 0 ||
              (!searchQuery.trim() && (history.length > 0 || hotKeywords.length > 0)))
          "
          class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-[480px] overflow-y-auto overflow-x-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <!-- Suggestions (when typing) -->
          <template v-if="searchQuery.trim() && searchSuggestions.length > 0">
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
          <template v-else-if="!searchQuery.trim()">
            <!-- Search History -->
            <template v-if="history.length > 0">
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
                  class="group flex items-center gap-1 rounded-md bg-secondary text-secondary-foreground px-2.5 py-1.5 text-xs cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  @mousedown.prevent="handleSearch(item)"
                >
                  <span class="truncate max-w-[140px]">{{ item }}</span>
                  <X
                    class="h-3.5 w-3.5 rounded-full p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-black/10 group-hover:opacity-100"
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
                  class="hot-keyword-item flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
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
    </div>

    <!-- Right: User Actions -->
    <div class="flex min-w-0 items-center gap-0.5 sm:gap-1">
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
              :container-class="`h-8 w-8 border-2 transition-colors duration-300 ${showAvatarPanel ? 'border-transparent bg-transparent' : avatarBorderClass}`"
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
          class="mr-1 h-8 cursor-pointer rounded-full bg-primary px-4 text-white hover:bg-primary/90 sm:mr-2 sm:px-5"
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
            :class="action.mobileHidden ? 'hidden sm:flex' : 'flex'"
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
                  class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive shadow-[0_0_10px_rgba(var(--color-destructive)/0.6)] px-1 text-[10px] text-destructive-foreground"
                >
                  {{ totalMessageUnread > 99 ? '99+' : totalMessageUnread }}
                </span>
                <span
                  v-if="action.badge === 'dynamic' && dynamicUnreadCount > 0"
                  class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive shadow-[0_0_10px_rgba(var(--color-destructive)/0.6)] px-1 text-[10px] text-destructive-foreground"
                >
                  {{ dynamicUnreadCount > 99 ? '99+' : dynamicUnreadCount }}
                </span>
              </div>
              <span class="mt-0.5 hidden text-[10px] font-medium sm:block">{{ action.name }}</span>
            </router-link>

            <!-- Message Hover Dropdown -->
            <Transition name="panel-fade">
              <div
                v-if="action.isMessage && showMessagePanel"
                class="absolute left-1/2 top-full z-[200] mt-1 -translate-x-1/2 rounded-lg border bg-popover py-2 text-popover-foreground shadow-lg w-32"
                @mouseenter="openMessagePanel"
                @mouseleave="scheduleCloseMessagePanel"
              >
                <div class="flex flex-col text-sm">
                  <router-link
                    to="/message/reply"
                    class="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  >
                    <span>回复我的</span>
                    <span
                      v-if="counts.reply > 0"
                      class="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground"
                      >{{ counts.reply }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/at"
                    class="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  >
                    <span>@ 我的</span>
                    <span
                      v-if="counts.at > 0"
                      class="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground"
                      >{{ counts.at }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/love"
                    class="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  >
                    <span>收到的赞</span>
                    <span
                      v-if="counts.like > 0"
                      class="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground"
                      >{{ counts.like }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/system"
                    class="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  >
                    <span>系统通知</span>
                    <span
                      v-if="counts.system > 0"
                      class="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground"
                      >{{ counts.system }}</span
                    >
                  </router-link>
                  <router-link
                    to="/message/chat"
                    class="flex items-center justify-between px-4 py-2 hover:bg-accent transition-colors"
                  >
                    <span>我的消息</span>
                    <span
                      v-if="counts.message > 0"
                      class="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground"
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
            :class="[navActionTextClass, action.mobileHidden ? 'hidden sm:flex' : 'flex']"
            @click="openLoginDialog"
          >
            <div class="relative">
              <component :is="action.icon" class="h-5 w-5" />
            </div>
            <span class="mt-0.5 hidden text-[10px] font-medium sm:block">{{ action.name }}</span>
          </div>
        </template>
      </div>

      <slot name="after-actions" :action-text-class="navActionTextClass" />

      <!-- Upload Button -->
      <Button
        v-if="authStore.isLoggedIn"
        as-child
        size="sm"
        class="ml-1 h-8 rounded-lg border-0 bg-primary px-2 text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--color-primary)/0.3)] sm:ml-3 sm:px-4 transition-all"
      >
        <router-link to="/upload" class="flex items-center gap-1.5">
          <Upload class="h-4 w-4" />
          <span class="hidden sm:inline">投稿</span>
        </router-link>
      </Button>
      <Button
        v-else
        size="sm"
        class="ml-1 h-8 cursor-pointer rounded-lg border-0 bg-primary px-2 text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--color-primary)/0.3)] sm:ml-3 sm:px-4 transition-all"
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
  color: var(--brand-blue, oklch(var(--primary)));
  font-style: normal;
  font-weight: 700;
  background: oklch(var(--primary) / 0.12);
  border-radius: 2px;
  padding: 0 1px;
}

.panel-fade-enter-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-fade-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.nav-avatar-wrapper {
  will-change: transform;
}

.avatar-normal {
  transform: scale(1) translateY(0);
  opacity: 1;
  transition:
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease 0.05s;
}

.avatar-expanded {
  transform: scale(2.5) translateY(0);
  opacity: 0;
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}

.search-input-base {
  border: 1px solid transparent;
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);

  &:focus-visible {
    background-color: var(--color-background);
    color: var(--color-foreground);
    border-color: color-mix(in oklch, var(--color-primary) 40%, transparent);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-primary) 20%, transparent);

    &::placeholder {
      color: color-mix(in oklch, var(--color-muted-foreground) 70%, transparent);
    }
  }
}

.search-bar-solid {
  background-color: color-mix(in oklch, var(--color-secondary) 60%, transparent);
  color: var(--color-foreground);
  box-shadow: inset 0 1px 2px rgb(0, 0, 0, 0.05);

  &:hover:not(:focus-visible) {
    background-color: color-mix(in oklch, var(--color-secondary) 90%, transparent);
  }

  &::placeholder {
    color: color-mix(in oklch, var(--color-muted-foreground) 70%, transparent);
  }
}

:global(.dark) .search-bar-solid {
  box-shadow: none;
}

.search-bar-glass {
  background-color: rgb(255, 255, 255, 0.2);
  border-color: rgb(255, 255, 255, 0.2);
  color: #ffffff;
  box-shadow: 0 1px 2px rgb(0, 0, 0, 0.05);
  backdrop-filter: blur(12px);

  &:hover:not(:focus-visible) {
    background-color: rgb(255, 255, 255, 0.3);
  }

  &::placeholder {
    color: rgb(255, 255, 255, 0.7);
  }
}

:global(.dark) .search-bar-glass {
  background-color: rgb(0, 0, 0, 0.4);
  border-color: rgb(255, 255, 255, 0.1);

  &:hover:not(:focus-visible) {
    background-color: rgb(0, 0, 0, 0.6);
  }
}

/* Bulletproof CSS for search bar to evade Tailwind JIT cache bugs */

/* 1. Solid variant (for video detail page / solid headers) */

/* 2. Glass variant (for homepage / banner overlay headers) */

/* Dark mode overrides for glass variant */
</style>
