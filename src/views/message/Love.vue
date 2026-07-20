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
import { Heart, Trash2 } from 'lucide-vue-next'
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
    const res = await getNotificationList({ category: 'like', page: page.value, pageSize: 20 })
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
        notificationStore.markLikeRead(unreadCount)
      }
    }
  } catch (error) {
    console.error('Failed to load likes', error)
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
      notificationStore.markLikeRead(1)
    }
  } catch (error) {
    console.error('Failed to delete like notification', error)
  } finally {
    const next = new Set(deletingIds.value)
    next.delete(item.id)
    deletingIds.value = next
  }
}

const getLikeTargetLabel = (item: NotificationItem) => {
  if (item.commentID) return '你的评论'
  if (item.dynamicID) return '你的动态'
  if (item.videoID) return '你的视频'
  return ''
}

const getLikeTitleParts = (item: NotificationItem) => {
  const targetLabel = getLikeTargetLabel(item)
  const title = item.title ? item.title.replace('有人', '').trim() : ''

  if (!targetLabel) {
    return {
      before: title || '赞了你的内容',
      target: '',
      after: '',
    }
  }

  const index = title.indexOf(targetLabel)
  if (index === -1) {
    return {
      before: title || '赞了',
      target: targetLabel,
      after: '',
    }
  }

  return {
    before: title.slice(0, index),
    target: targetLabel,
    after: title.slice(index + targetLabel.length),
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex h-[50px] shrink-0 items-center justify-between border-b px-6">
      <h2 class="text-[15px] font-medium text-foreground">收到的赞</h2>
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
        <Heart class="h-12 w-12 text-muted-foreground/30 mb-4" />
        <div class="text-sm opacity-60">还没有收到过赞哦~</div>
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
              <span class="ml-2 text-muted-foreground font-medium">
                {{ getLikeTitleParts(item).before }}
              </span>
              <button
                v-if="getLikeTitleParts(item).target && canOpenTarget(item)"
                type="button"
                class="cursor-pointer font-medium text-primary transition-opacity hover:opacity-80"
                @click="goLink(item)"
              >
                {{ getLikeTitleParts(item).target }}
              </button>
              <span class="text-muted-foreground font-medium">{{
                getLikeTitleParts(item).after
              }}</span>
            </div>

            <div class="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <span>{{ formatDateTimeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <!-- Right: delete + optional reference -->
          <div class="flex shrink-0 items-start gap-2">
            <button
              type="button"
              class="mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
              :disabled="deletingIds.has(item.id)"
              :aria-label="`删除来自 ${item.actionUserName || '用户'} 的点赞通知`"
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
