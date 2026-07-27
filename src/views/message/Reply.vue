<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  getNotificationList,
  type NotificationItem,
  markNotificationsRead,
  deleteNotifications,
} from '@/api/notification'
import AppAvatar from '@/components/common/AppAvatar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
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
    const res = await getNotificationList({ category: 'reply', page: page.value, pageSize: 20 })
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
        notificationStore.markReplyRead(unreadCount)
      }
    }
  } catch (error) {
    console.error('Failed to load replies', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchData()
})

const canOpenTarget = (item: NotificationItem) => !!resolveNotificationTarget(item)

const goReply = (item: NotificationItem) => {
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
      notificationStore.markReplyRead(1)
    }
  } catch (error) {
    console.error('Failed to delete reply notification', error)
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
      <h2 class="text-[15px] font-medium text-foreground">回复我的</h2>
    </div>

    <!-- List -->
    <div
      class="flex-1 overflow-y-auto px-4 py-2 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
    >
      <SkeletonGroup v-if="loading && list.length === 0" :count="5" class="space-y-4">
        <div class="msg-sk-row flex gap-4 rounded-lg p-4">
          <div class="skeleton-shimmer h-[46px] w-[46px] shrink-0 rounded-full"></div>
          <div class="min-w-0 flex-1 space-y-2.5 pt-1">
            <div class="msg-sk-a skeleton-shimmer h-3.5 w-28 rounded"></div>
            <div class="msg-sk-b skeleton-shimmer h-4 w-full rounded"></div>
            <div class="msg-sk-c skeleton-shimmer h-3 w-24 rounded"></div>
          </div>
          <div class="msg-sk-d skeleton-shimmer h-[60px] w-[100px] shrink-0 rounded"></div>
        </div>
      </SkeletonGroup>

      <EmptyState
        v-else-if="list.length === 0"
        size="lg"
        icon="message"
        title="还没有收到回复"
        description="你发出的评论有人回复时，会第一时间出现在这里"
      />

      <div v-else class="space-y-4">
        <div
          v-for="item in list"
          :key="item.id"
          class="group flex gap-4 rounded-lg p-4 t-tint hover:bg-muted/50"
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
                class="msg-avatar hover:scale-105"
              />
            </button>
          </div>

          <!-- Middle Content -->
          <div class="flex min-w-0 flex-1 flex-col">
            <div class="mb-1 text-sm">
              <span class="font-medium text-foreground cursor-pointer hover:text-primary">
                {{ item.actionUserName || '未知用户' }}
              </span>
              <span class="ml-2 text-muted-foreground">{{
                item.title ? item.title.replace('有人', '') : '回复了你的评论'
              }}</span>
            </div>

            <div v-if="item.content" class="mb-2">
              <button
                v-if="canOpenTarget(item)"
                type="button"
                class="-ml-2 inline-flex max-w-full cursor-pointer rounded-md px-2 py-1 text-left text-sm text-foreground t-tint hover:bg-primary/8 hover:text-primary"
                @click="goReply(item)"
              >
                <span class="break-words whitespace-pre-wrap">{{ item.content }}</span>
              </button>
              <div v-else class="break-words text-sm text-foreground">
                {{ item.content }}
              </div>
            </div>

            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{{ formatDateTimeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <!-- Right: delete + optional reference -->
          <div class="flex shrink-0 items-start gap-2">
            <button
              type="button"
              class="msg-action-btn mt-1 rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40"
              :disabled="deletingIds.has(item.id)"
              :aria-label="`删除来自 ${item.actionUserName || '用户'} 的回复通知`"
              @click.stop="handleDelete(item)"
            >
              <Trash2 class="h-4 w-4" />
            </button>
            <div v-if="item.videoTitle" class="max-w-[120px] cursor-pointer" @click="goReply(item)">
              <div
                class="h-[60px] overflow-hidden rounded bg-muted p-2 text-xs text-muted-foreground line-clamp-2 t-tint hover:text-primary"
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

<style scoped lang="scss">
/* 骨架条目内部错峰：--skeleton-phase 定义在行容器上，子块基于它偏移
   （同一元素既读又写 --skeleton-index 会构成 CSS 循环）。 */
.msg-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.msg-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.25);
}

.msg-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.4);
}

.msg-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.55);
}

.msg-sk-d {
  --skeleton-index: calc(var(--skeleton-phase) + 0.7);
}

/* 删除按钮：原来是 transition-all（会把 box-shadow / filter 一起卷进去），改成显式三条 */
.msg-action-btn {
  transition:
    color var(--duration-fast) linear,
    background-color var(--duration-fast) var(--ease-out-quart),
    opacity var(--duration-fast) linear;
}

/* Tailwind v4 的 scale-* 写的是独立的 `scale` 属性，t-motion 只过渡 transform，
   所以缩放必须显式过渡 scale，否则 hover 是瞬移。 */
.msg-avatar {
  transition: scale var(--duration-normal) var(--ease-out-expo);
}
</style>
