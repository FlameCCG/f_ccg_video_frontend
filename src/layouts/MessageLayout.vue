<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { RouterView, useRoute } from 'vue-router'
import { Send } from 'lucide-vue-next'
import Navbar from '@/components/layout/Navbar.vue'
import { useNotificationStore } from '@/stores/notification'

const route = useRoute()
const notificationStore = useNotificationStore()
const { counts } = storeToRefs(notificationStore)

const navItems = [
  { text: '我的消息', path: '/message/chat', icon: 'messageCircle' },
  { text: '回复我的', path: '/message/reply', icon: 'reply' },
  { text: '@ 我的', path: '/message/at', icon: 'atSign' },
  { text: '收到的赞', path: '/message/love', icon: 'heart' },
  { text: '系统通知', path: '/message/system', icon: 'bell' },
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
  <div
    class="relative min-h-screen bg-background"
    style="--shell-max: var(--container-focus, 1140px)"
  >
    <!-- Navbar -->
    <div class="sticky top-0 z-50 w-full border-b border-border/40 bg-card shadow-surface">
      <Navbar light />
    </div>

    <!-- Main Content Container -->
    <main
      class="relative z-10 mx-auto mt-3 h-[calc(100vh-80px)] w-full max-w-focus px-4 sm:px-6 md:mt-4 md:h-[calc(100vh-90px)] lg:px-8"
    >
      <div
        class="flex h-full flex-col overflow-hidden rounded-2xl bg-card shadow-surface md:flex-row"
      >
        <!-- Left Sidebar Navigation -->
        <aside
          class="w-full shrink-0 overflow-hidden border-b border-border/50 bg-card md:w-[180px] md:border-b-0 md:border-r"
        >
          <div
            class="flex items-center gap-2 px-4 py-4 text-base font-semibold text-foreground md:mb-4 md:px-6 md:pt-6 md:pb-0"
          >
            <Send class="h-4 w-4 shrink-0" aria-hidden="true" />
            消息中心
          </div>

          <nav
            class="flex gap-2 overflow-x-auto px-3 pb-4 md:flex-1 md:flex-col md:space-y-1 md:px-3 md:pb-0"
          >
            <template v-for="item in navItems" :key="item.path">
              <router-link
                :to="item.path"
                class="t-tint group flex shrink-0 items-center justify-between rounded-full px-3 py-2 text-sm hover:bg-muted md:rounded-lg md:px-3 md:py-2.5"
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
                  class="tabular flex h-5 items-center justify-center rounded-full bg-destructive px-1.5 text-2xs font-medium text-destructive-foreground"
                >
                  {{ getBadgeCount(item.path) > 99 ? '99+' : getBadgeCount(item.path) }}
                </span>
              </router-link>
            </template>

            <!-- Divider -->
          </nav>
        </aside>

        <!-- Right Content Area -->
        <div class="min-w-0 flex-1 bg-card">
          <RouterView v-slot="{ Component, route: current }">
            <Transition name="route" mode="out-in">
              <component :is="Component" :key="current.path" />
            </Transition>
          </RouterView>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
/* Any specific MessageLayout scoped styles */
</style>
