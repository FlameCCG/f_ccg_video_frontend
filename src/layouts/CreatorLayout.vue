<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  Upload,
  Home,
  FileVideo,
  MessageSquare,
  LogOut,
  Settings,
  User,
  MonitorPlay,
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

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const handleLogout = () => {
  authStore.logout()
  void router.push('/')
}

const navItems = [
  { name: '首页', icon: Home, path: '/creator/home' },
  { name: '视频管理', icon: FileVideo, path: '/creator/content' },
  { name: '评论管理', icon: MessageSquare, path: '/creator/interaction' },
]
</script>

<template>
  <div class="min-h-screen bg-muted/30 flex flex-col">
    <!-- Top Navbar -->
    <header
      class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div class="flex h-14 items-center px-6 justify-between">
        <!-- Left: Logo & Links -->
        <div class="flex items-center gap-6">
          <router-link to="/creator/home" class="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" class="h-8 w-auto object-contain" />
            <span class="text-lg font-bold text-primary tracking-tight">创作中心</span>
          </router-link>
          <div class="h-4 w-px bg-border"></div>
          <router-link
            to="/"
            class="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MonitorPlay class="h-4 w-4" />
            主站
          </router-link>
        </div>

        <!-- Right: User Avatar -->
        <div class="flex items-center gap-4">
          <template v-if="authStore.isLoggedIn">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <div class="cursor-pointer group">
                  <div
                    class="h-8 w-8 rounded-full border-2 border-transparent group-hover:border-primary transition-colors overflow-hidden"
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
                  <router-link :to="`/user/${authStore.userId}`">
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
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <div class="flex-1 flex max-w-[1400px] w-full mx-auto">
      <!-- Left Sidebar -->
      <aside class="w-64 shrink-0 border-r bg-background hidden md:block">
        <div class="p-6 flex flex-col gap-6 sticky top-14">
          <!-- Upload Button -->
          <Button
            as-child
            size="lg"
            class="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            <router-link to="/creator/upload" class="flex items-center justify-center gap-2">
              <Upload class="h-5 w-5" />
              <span class="font-medium text-base">投稿</span>
            </router-link>
          </Button>

          <!-- Navigation -->
          <nav class="flex flex-col gap-1">
            <router-link
              v-for="item in navItems"
              :key="item.path"
              :to="item.path"
              class="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors"
              :class="[
                route.path.startsWith(item.path) ||
                (item.path === '/creator/home' && route.path === '/creator')
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              ]"
            >
              <component :is="item.icon" class="h-5 w-5" />
              {{ item.name }}
            </router-link>
          </nav>
        </div>
      </aside>

      <!-- Main View -->
      <main class="flex-1 p-6 min-w-0">
        <RouterView />
      </main>
    </div>
  </div>
</template>
