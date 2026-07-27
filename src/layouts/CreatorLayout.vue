<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  Upload,
  Home,
  FileVideo,
  MessageSquare,
  MessageCircle,
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
import AppAvatar from '@/components/common/AppAvatar.vue'

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
  { name: '弹幕管理', icon: MessageCircle, path: '/creator/danmu' },
]
</script>

<template>
  <div class="flex min-h-screen flex-col overflow-x-clip bg-muted/30">
    <!-- Top Navbar -->
    <header
      class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <div class="flex h-14 items-center justify-between px-4 sm:px-6">
        <!-- Left: Logo & Links -->
        <div class="flex min-w-0 items-center gap-3 sm:gap-6">
          <router-link to="/creator/home" class="flex shrink-0 items-center gap-2">
            <img src="/logo.png" alt="Logo" class="h-8 w-auto object-contain" />
            <span class="text-base font-bold tracking-tight text-primary sm:text-lg">创作中心</span>
          </router-link>
          <div class="hidden h-4 w-px bg-border sm:block"></div>
          <router-link
            to="/"
            class="t-tint flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground sm:gap-1.5 sm:text-sm"
          >
            <MonitorPlay class="h-4 w-4" />
            <span class="hidden sm:inline">主站</span>
          </router-link>
        </div>

        <!-- Right: User Avatar -->
        <div class="flex items-center gap-2 sm:gap-4">
          <template v-if="authStore.isLoggedIn">
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <div class="cursor-pointer group">
                  <div
                    class="t-tint h-8 w-8 overflow-hidden rounded-full border-2 border-transparent group-hover:border-primary"
                  >
                    <AppAvatar
                      :src="authStore.user?.avatar"
                      :name="authStore.user?.username"
                      alt="Avatar"
                      container-class="h-full w-full border-0"
                      text-class="text-xs font-bold"
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
    <div class="mx-auto flex w-full max-w-reading flex-1">
      <!-- Left Sidebar -->
      <aside class="w-64 shrink-0 border-r bg-background hidden md:block">
        <div class="p-6 flex flex-col gap-6 sticky top-14">
          <!-- Upload Button -->
          <Button
            as-child
            size="lg"
            class="w-full bg-primary text-primary-foreground shadow-surface hover:bg-primary/90"
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
              class="t-tint flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium"
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
      <main class="min-w-0 flex-1 p-4 sm:p-6">
        <RouterView v-slot="{ Component, route: current }">
          <Transition name="route" mode="out-in">
            <component :is="Component" :key="current.path" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>
