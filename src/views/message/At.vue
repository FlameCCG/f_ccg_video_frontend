<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getNotificationList,
  type NotificationItem,
  markNotificationsRead,
  deleteNotifications,
} from '@/api/notification'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useNotificationStore } from '@/stores/notification'
import { formatDateTimeAgo } from '@/utils/time'
import { Trash2 } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import {
  navigateToNotificationTarget,
  resolveNotificationTarget,
} from '@/utils/notification-target'

const router = useRouter()

const list = ref<NotificationItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const deletingIds = ref<Set<number>>(new Set())
const notificationStore = useNotificationStore()

const fetchData = async () => {
  try {
    loading.value = true
    const res = await getNotificationList({ category: 'at', page: page.value, pageSize: 20 })
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
        notificationStore.markAtRead(unreadCount)
      }
    }
  } catch (error) {
    console.error('Failed to load @ mentions', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})

const canOpenTarget = (item: NotificationItem) => !!resolveNotificationTarget(item)

const goLink = (item: NotificationItem) => {
  void navigateToNotificationTarget(router, item)
}

const goUserHome = (userId: number) => {
  if (!userId) return
  void router.push({ name: 'user-home', params: { id: userId } })
}

const handleDelete = async (item: NotificationItem) => {
  if (deletingIds.value.has(item.id)) return
  deletingIds.value = new Set(deletingIds.value).add(item.id)
  try {
    await deleteNotifications({ ids: [item.id] })
    const wasUnread = !item.isRead
    list.value = list.value.filter((n) => n.id !== item.id)
    total.value = Math.max(0, total.value - 1)
    if (wasUnread) {
      notificationStore.markAtRead(1)
    }
  } catch (error) {
    console.error('Failed to delete @ notification', error)
  } finally {
    const next = new Set(deletingIds.value)
    next.delete(item.id)
    deletingIds.value = next
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex h-[50px] shrink-0 items-center justify-between border-b px-6">
      <h2 class="text-[15px] font-medium text-foreground">@ 我的</h2>
    </div>

    <!-- List -->
    <div
      class="flex-1 overflow-y-auto px-4 py-2 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
    >
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
        <div class="text-sm opacity-60">暂无新@哦~</div>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="item in list"
          :key="item.id"
          class="group flex gap-4 rounded-lg p-4 transition-colors hover:bg-muted/50"
        >
          <!-- Left Avatar -->
          <div class="shrink-0 pt-1">
            <button
              type="button"
              class="cursor-pointer rounded-full"
              :aria-label="`查看 ${item.actionUserName || '用户'} 的主页`"
              @click="goUserHome(item.actionUserID)"
            >
              <AppAvatar
                :src="item.actionUserAvatar"
                :name="item.actionUserName"
                container-class="w-[46px] h-[46px] text-lg"
                class="transition-transform hover:scale-105"
              />
            </button>
          </div>

          <!-- Middle Content -->
          <div class="flex min-w-0 flex-1 flex-col justify-center">
            <div class="mb-1 text-sm">
              <span class="font-medium text-foreground cursor-pointer hover:text-primary">
                {{ item.actionUserName || '未知用户' }}
              </span>
              <span class="ml-2 text-muted-foreground">{{
                item.title ? item.title.replace('有人', '') : '在评论/视频中@了我'
              }}</span>
            </div>

            <div v-if="item.content" class="mb-2">
              <button
                v-if="canOpenTarget(item)"
                type="button"
                class="-ml-2 inline-flex max-w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/8 hover:text-primary"
                @click="goLink(item)"
              >
                <span class="break-words whitespace-pre-wrap">{{ item.content }}</span>
              </button>
              <div v-else class="break-words text-sm text-foreground opacity-90">
                {{ item.content }}
              </div>
            </div>

            <div class="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span>{{ formatDateTimeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <!-- Right: delete + optional reference -->
          <div class="flex shrink-0 items-start gap-2">
            <button
              type="button"
              class="mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
              :disabled="deletingIds.has(item.id)"
              :aria-label="`删除来自 ${item.actionUserName || '用户'} 的@通知`"
              @click.stop="handleDelete(item)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
            <div
              v-if="item.videoTitle"
              class="max-w-[120px] cursor-pointer"
              @click="goLink(item)"
            >
              <div
                class="h-[60px] flex items-center justify-center overflow-hidden rounded bg-muted text-xs text-muted-foreground p-2 line-clamp-2 hover:text-primary transition-colors"
              >
                {{ item.videoTitle }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
