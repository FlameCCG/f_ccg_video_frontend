<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getNotificationList,
  type NotificationItem,
  markNotificationsRead,
} from '@/api/notification'
import { useNotificationStore } from '@/stores/notification'
import { formatTimeAgo } from '@/utils/time'
import { Bell } from 'lucide-vue-next'

const list = ref<NotificationItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const notificationStore = useNotificationStore()

const fetchData = async () => {
  try {
    loading.value = true
    const res = await getNotificationList({ category: 'system', page: page.value, pageSize: 20 })
    if (page.value === 1) {
      list.value = res.list || []
    } else {
      list.value.push(...(res.list || []))
    }
    total.value = res.total || 0

    const notificationIds = (res.list || []).map((item) => item.id)
    const unreadCount = (res.list || []).filter((item) => !item.isRead).length
    if (notificationIds.length > 0) {
      await markNotificationsRead({ ids: notificationIds })
      list.value = list.value.map((item) =>
        notificationIds.includes(item.id) ? { ...item, isRead: true } : item
      )
      if (unreadCount > 0) {
        notificationStore.markSystemRead(unreadCount)
      }
    }
  } catch (error) {
    console.error('Failed to load system notifications', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})
const openLink = (url: string) => window.open(url, '_blank')
</script>

<template>
  <div class="flex h-full flex-col bg-background">
    <!-- Header -->
    <div
      class="flex h-[50px] shrink-0 items-center justify-between border-b px-6 bg-background rounded-tr-xl"
    >
      <h2 class="text-[15px] font-medium text-foreground">系统通知</h2>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto px-4 py-2">
      <div
        v-if="loading && list.length === 0"
        class="flex items-center justify-center p-10 text-muted-foreground"
      >
        加载中...
      </div>

      <div
        v-else-if="list.length === 0"
        class="flex flex-col items-center justify-center p-20 text-muted-foreground"
      >
        <Bell class="h-12 w-12 text-muted-foreground/30 mb-4" />
        <div class="text-sm opacity-60">暂无新通知哦~</div>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="item in list"
          :key="item.id"
          class="flex gap-4 rounded-lg p-4 transition-colors hover:bg-muted/50"
        >
          <!-- Left Avatar (System Icon) -->
          <div class="shrink-0 pt-1">
            <div
              class="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-blue-500/10 text-blue-500"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="lucide lucide-bell"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
          </div>

          <!-- Middle Content -->
          <div class="flex min-w-0 flex-1 flex-col justify-center">
            <div class="mb-1 break-words text-sm font-medium text-foreground">
              {{ item.title || '系统助手' }}
            </div>

            <div class="mb-2 break-words text-sm text-foreground/80">
              {{ item.content }}
            </div>

            <div
              v-if="item.link"
              class="mb-2 text-sm text-primary underline cursor-pointer hover:text-primary/80"
              @click="openLink(item.link)"
            >
              查看详情
            </div>

            <div class="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span>{{ formatTimeAgo(Date.now() - 1000 * 60 * 60 * 24) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
