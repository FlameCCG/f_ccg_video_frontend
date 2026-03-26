<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import { useNotificationStore } from '@/stores/notification'

const route = useRoute()
const notificationStore = useNotificationStore()
const { counts } = storeToRefs(notificationStore)

const navItems = [
  { text: '回复我的', path: '/message/reply', icon: 'reply' },
  { text: '@ 我的', path: '/message/at', icon: 'atSign' },
  { text: '收到的赞', path: '/message/love', icon: 'heart' },
  { text: '系统通知', path: '/message/system', icon: 'bell' },
  { text: '我的消息', path: '/message/chat', icon: 'messageCircle' },
]

const fetchCounts = async () => {
  try {
    await notificationStore.fetchCounts()
  } catch (error) {
    console.error('Failed to fetch notification counts', error)
  }
}

onMounted(() => {
  fetchCounts().catch((err) => console.error('Error fetching counts:', err))
  // Could set up polling or WS listener for updates here
})

const getBadgeCount = (path: string) => {
  if (path === '/message/reply') return counts.value.reply
  if (path === '/message/at') return counts.value.at
  if (path === '/message/love') return counts.value.like
  if (path === '/message/system') return counts.value.system
  if (path === '/message/chat') return counts.value.message
  return 0
}
</script>

<template>
  <div class="relative min-h-screen bg-[#f4f5f7]">
    <!-- Navbar -->
    <div class="sticky top-0 z-50 w-full bg-background shadow-sm">
      <Navbar light />
    </div>

    <!-- Decorative Background (matches the sky/cloud concept from reference) -->
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <!-- A soft top-to-bottom gradient similar to Bilibili's message center -->
      <div class="absolute inset-0 bg-gradient-to-b from-[#e1eaf5] to-[#f4f5f7] opacity-80"></div>
      <!-- Decorative circles / clouds placeholders if needed -->
    </div>

    <!-- Main Content Container -->
    <main class="relative z-10 mx-auto mt-3 max-w-[1140px] px-2 pb-6 sm:px-4 md:mt-4 md:pb-10">
      <div
        class="flex min-h-[calc(100vh-100px)] flex-col overflow-hidden rounded-2xl bg-background shadow-sm md:flex-row"
      >
        <!-- Left Sidebar Navigation -->
        <aside
          class="w-full shrink-0 overflow-hidden border-b border-border/50 bg-background/90 backdrop-blur-md md:w-[180px] md:border-b-0 md:border-r"
        >
          <div
            class="flex items-center gap-2 px-4 py-4 text-base font-semibold text-foreground md:mb-4 md:px-6 md:py-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="lucide lucide-send"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
            消息中心
          </div>

          <nav
            class="flex gap-2 overflow-x-auto px-3 pb-4 md:flex-1 md:flex-col md:space-y-1 md:px-3 md:pb-0"
          >
            <template v-for="item in navItems" :key="item.path">
              <router-link
                :to="item.path"
                class="group flex shrink-0 items-center justify-between rounded-full px-3 py-2 text-sm transition-colors hover:bg-muted md:rounded-lg md:px-3 md:py-2.5"
                :class="[
                  route.path.startsWith(item.path)
                    ? 'font-medium text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                ]"
              >
                <div class="flex items-center gap-2">
                  <!-- A small dot strictly for active state like the reference image shows for "我的消息" -->
                  <span
                    class="h-1.5 w-1.5 rounded-full bg-primary"
                    :class="route.path.startsWith(item.path) ? 'opacity-100' : 'opacity-0'"
                  ></span>
                  <span>{{ item.text }}</span>
                </div>
                <span
                  v-if="getBadgeCount(item.path) > 0"
                  class="flex h-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-medium text-destructive-foreground"
                >
                  {{ getBadgeCount(item.path) > 99 ? '99+' : getBadgeCount(item.path) }}
                </span>
              </router-link>
            </template>
          </nav>
        </aside>

        <!-- Right Content Area -->
        <div class="min-w-0 flex-1 bg-background">
          <RouterView />
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* Any specific MessageLayout scoped styles */
</style>
