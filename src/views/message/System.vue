<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  getNotificationList,
  type NotificationItem,
  markNotificationsRead,
} from '@/api/notification'
import { useNotificationStore } from '@/stores/notification'
import { formatDateTimeAgo } from '@/utils/time'
import { navigateToNotificationTarget } from '@/utils/notification-target'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import { Bell } from 'lucide-vue-next'

const router = useRouter()
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

const openLink = (item: NotificationItem) => {
  void navigateToNotificationTarget(router, item)
}
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div class="flex h-[50px] shrink-0 items-center justify-between border-b px-6">
      <h2 class="text-[15px] font-medium text-foreground">系统通知</h2>
    </div>

    <!-- List -->
    <div
      class="flex-1 overflow-y-auto px-4 py-2 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
    >
      <SkeletonGroup v-if="loading && list.length === 0" :count="5" class="space-y-4">
        <div class="msg-sk-row flex gap-4 rounded-lg p-4">
          <div class="skeleton-shimmer h-[46px] w-[46px] shrink-0 rounded-full"></div>
          <div class="min-w-0 flex-1 space-y-2.5 pt-1">
            <div class="msg-sk-a skeleton-shimmer h-3.5 w-32 rounded"></div>
            <div class="msg-sk-b skeleton-shimmer h-4 w-full rounded"></div>
            <div class="msg-sk-c skeleton-shimmer h-3 w-24 rounded"></div>
          </div>
        </div>
      </SkeletonGroup>

      <EmptyState
        v-else-if="list.length === 0"
        size="lg"
        icon="bell"
        title="暂时没有新通知"
        description="稿件审核结果、账号安全提醒都会发到这里"
      />

      <div v-else class="space-y-4">
        <div
          v-for="item in list"
          :key="item.id"
          class="flex gap-4 rounded-lg p-4 t-tint hover:bg-muted/50"
        >
          <!-- Left Avatar (System Icon) -->
          <div class="shrink-0 pt-1">
            <div
              class="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[var(--status-info-soft)] text-[var(--status-info-ink)]"
            >
              <Bell class="h-6 w-6" :stroke-width="1.75" aria-hidden="true" />
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

            <button
              v-if="item.link"
              type="button"
              class="t-tint mb-2 self-start text-sm text-primary underline hover:text-primary/80"
              @click="openLink(item)"
            >
              查看详情
            </button>

            <div class="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span>{{ formatDateTimeAgo(item.createdAt) }}</span>
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
</style>
