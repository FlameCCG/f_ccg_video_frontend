<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Mail,
  Upload,
  User,
  LogOut,
  Settings,
  Crown,
  Zap,
  Star,
  History,
  Lightbulb,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getSearchSuggest, type SearchSuggestItem } from '@/api/video'
import { getNotificationCounts } from '@/api/notification'
import { useAuthStore } from '@/stores/auth'
import AuthDialog from '@/components/auth/AuthDialog.vue'

const router = useRouter()
const authStore = useAuthStore()

// Auth dialog state
const authDialogOpen = ref(false)
const authDialogMode = ref<'login' | 'register'>('login')

const openAuthDialog = (mode: 'login' | 'register' = 'login') => {
  authDialogMode.value = mode
  authDialogOpen.value = true
}

const openLoginDialog = () => openAuthDialog('login')

// State
const searchQuery = ref('')
const searchSuggestions = ref<SearchSuggestItem[]>([])
const showSuggestions = ref(false)
const unreadCounts = ref({
  reply: 0,
  like: 0,
  at: 0,
  system: 0,
  message: 0,
})

// Fetch Data
onMounted(async () => {
  try {
    if (authStore.isLoggedIn) {
      const counts = await getNotificationCounts()
      unreadCounts.value = counts
    }
  } catch (error) {
    console.error('Failed to fetch navbar data:', error)
  }
})

// Search Logic
const handleSearchInput = async () => {
  if (!searchQuery.value.trim()) {
    searchSuggestions.value = []
    return
  }
  try {
    const suggestions = await getSearchSuggest({ prefix: searchQuery.value })
    searchSuggestions.value = suggestions
    showSuggestions.value = true
  } catch (error) {
    console.error('Failed to fetch suggestions:', error)
  }
}

const handleSearch = (query: string) => {
  if (!query.trim()) return
  showSuggestions.value = false
  searchQuery.value = query
  void router.push({ name: 'search', query: { keyword: query } })
}

const handleBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false
  }, 200)
}

const handleLogout = () => {
  authStore.logout()
  void router.push('/')
}

// Total unread count
const totalUnread = computed(() => {
  return Object.values(unreadCounts.value).reduce((a, b) => a + b, 0)
})

// Nav action items
const navActions = [
  { name: '大会员', icon: Crown, path: '/vip' },
  { name: '消息', icon: Mail, path: '/message', badge: 'message' },
  { name: '动态', icon: Zap, path: '/dynamic', badge: 'total' },
  { name: '收藏', icon: Star, path: '/favorite' },
  { name: '历史', icon: History, path: '/history' },
  { name: '创作中心', icon: Lightbulb, path: '/creator' },
]
</script>

<template>
  <nav class="mx-auto flex h-14 max-w-[2000px] items-center justify-between px-6 sm:px-10 lg:px-16">
    <!-- Left: Logo -->
    <div class="flex items-center gap-6">
      <router-link to="/" class="flex items-center gap-2">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary text-xl font-bold"
        >
          B
        </div>
        <span class="hidden text-lg font-bold text-white sm:block drop-shadow-sm">BiliVideo</span>
      </router-link>
    </div>

    <!-- Center: Search -->
    <div class="relative mx-8 flex max-w-xl flex-1 items-center">
      <div class="relative w-full">
        <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
          <Search class="h-4 w-4 text-muted-foreground" />
        </div>
        <input
          v-model="searchQuery"
          type="text"
          class="flex h-10 w-full rounded-full border-0 bg-white/95 px-4 py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all"
          placeholder="搜索视频、UP主..."
          @input="handleSearchInput"
          @keydown.enter="handleSearch(searchQuery)"
          @blur="handleBlur"
          @focus="handleSearchInput"
        />
        <!-- Suggestions -->
        <div
          v-if="showSuggestions && searchSuggestions.length > 0"
          class="absolute left-0 right-0 top-full z-[100] mt-1 max-h-80 overflow-y-auto overflow-x-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div
            v-for="(item, index) in searchSuggestions"
            :key="index"
            class="search-suggestion-item cursor-pointer px-4 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
            @mousedown="handleSearch(item.value)"
          >
            <span class="truncate" v-html="item.highlight"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: User Actions -->
    <div class="flex items-center gap-1">
      <!-- User Avatar (when logged in) / Login Button -->
      <template v-if="authStore.isLoggedIn">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <div class="relative mr-4 cursor-pointer group">
              <div
                class="h-8 w-8 rounded-full border-2 border-white/50 group-hover:border-white transition-colors overflow-hidden"
              >
                <img
                  :src="authStore.user?.avatar || '/placeholder-avatar.png'"
                  alt="Avatar"
                  class="h-full w-full object-cover"
                />
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuLabel>
              <div class="flex flex-col space-y-1">
                <p class="text-sm font-medium leading-none">
                  {{ authStore.user?.username || '用户' }}
                </p>
                <p class="text-xs leading-none text-muted-foreground">
                  {{ authStore.user?.email || 'user@example.com' }}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem as-child>
              <router-link to="/space">
                <User class="mr-2 h-4 w-4" />
                <span>个人中心</span>
              </router-link>
            </DropdownMenuItem>
            <DropdownMenuItem as-child>
              <router-link to="/settings">
                <Settings class="mr-2 h-4 w-4" />
                <span>设置</span>
              </router-link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @select="handleLogout">
              <LogOut class="mr-2 h-4 w-4" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
      <template v-else>
        <Button
          variant="default"
          size="sm"
          class="mr-2 h-8 cursor-pointer rounded-full bg-primary px-5 text-white hover:bg-primary/90"
          @click="openLoginDialog"
        >
          登录
        </Button>
      </template>

      <!-- Action Items -->
      <div class="flex items-center">
        <template v-for="action in navActions" :key="action.name">
          <router-link
            v-if="authStore.isLoggedIn"
            :to="action.path"
            class="group relative flex cursor-pointer flex-col items-center justify-center px-3 py-1 text-white/90 transition-colors hover:text-white"
          >
            <div class="relative">
              <component :is="action.icon" class="h-5 w-5" />
              <!-- Badge -->
              <span
                v-if="action.badge === 'message' && unreadCounts.message > 0"
                class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white"
              >
                {{ unreadCounts.message > 99 ? '99+' : unreadCounts.message }}
              </span>
              <span
                v-if="action.badge === 'total' && totalUnread > 0"
                class="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white"
              >
                {{ totalUnread > 99 ? '99+' : totalUnread }}
              </span>
            </div>
            <span class="mt-0.5 text-[10px] font-medium">{{ action.name }}</span>
          </router-link>
          <div
            v-else
            class="group relative flex cursor-pointer flex-col items-center justify-center px-3 py-1 text-white/90 transition-colors hover:text-white"
            @click="openLoginDialog"
          >
            <div class="relative">
              <component :is="action.icon" class="h-5 w-5" />
            </div>
            <span class="mt-0.5 text-[10px] font-medium">{{ action.name }}</span>
          </div>
        </template>
      </div>

      <!-- Upload Button -->
      <Button
        v-if="authStore.isLoggedIn"
        as-child
        size="sm"
        class="ml-3 h-8 rounded-lg border-0 bg-pink-500 px-4 text-white hover:bg-pink-600"
      >
        <router-link to="/upload" class="flex items-center gap-1.5">
          <Upload class="h-4 w-4" />
          <span>投稿</span>
        </router-link>
      </Button>
      <Button
        v-else
        size="sm"
        class="ml-3 h-8 cursor-pointer rounded-lg border-0 bg-pink-500 px-4 text-white hover:bg-pink-600"
        @click="openLoginDialog"
      >
        <Upload class="h-4 w-4" />
        <span>投稿</span>
      </Button>
    </div>
  </nav>

  <!-- Auth Dialog -->
  <AuthDialog v-model:open="authDialogOpen" :initial-mode="authDialogMode" />
</template>

<style scoped>
/* Search suggestion highlight */
.search-suggestion-item :deep(em) {
  color: hsl(var(--primary));
  font-style: normal;
  font-weight: 600;
}
</style>
