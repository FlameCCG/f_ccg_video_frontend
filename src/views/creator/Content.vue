<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getUserVideoList, deleteVideo, type UserVideoItem } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { PlaySquare, MessageSquare, Clock, MoreVertical, Trash2, Edit } from 'lucide-vue-next'
import AppImage from '@/components/common/AppImage.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatClock } from '@/utils/format'

const authStore = useAuthStore()
const { toast } = useToast()

const videos = ref<UserVideoItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)

const deleteDialogOpen = ref(false)
const videoToDelete = ref<number | null>(null)

type ContentTab = 'all' | 'published' | 'private' | 'reviewing'

const TAB_LABELS: Record<ContentTab, string> = {
  all: '全部',
  published: '已发布',
  private: '私密',
  reviewing: '审核中',
}

const activeTab = ref<ContentTab>('all')

const fetchVideos = async () => {
  if (!authStore.userId) return
  try {
    loading.value = true
    let auditStatus: number | undefined = undefined
    if (activeTab.value === 'published') auditStatus = 1
    else if (activeTab.value === 'private') auditStatus = 2
    else if (activeTab.value === 'reviewing') auditStatus = 4

    const res = await getUserVideoList({
      userId: authStore.userId,
      page: page.value,
      pageSize: 20,
      auditStatus,
    })
    videos.value = res.list
    total.value = res.total
  } catch (error) {
    console.error('Failed to fetch videos:', error)
  } finally {
    loading.value = false
  }
}

const handleTabChange = (tab: ContentTab) => {
  activeTab.value = tab
  page.value = 1
  void fetchVideos()
}

onMounted(() => {
  void fetchVideos()
})

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const confirmDelete = (id: number) => {
  videoToDelete.value = id
  setTimeout(() => {
    deleteDialogOpen.value = true
  }, 100)
}

const handleDelete = async () => {
  if (!videoToDelete.value) return
  try {
    await deleteVideo({ videoId: videoToDelete.value })
    toast({ title: '视频已删除' })
    void fetchVideos()
  } catch (error) {
    console.error('Failed to delete video:', error)
    toast({ title: '删除失败', variant: 'destructive' })
  } finally {
    deleteDialogOpen.value = false
    videoToDelete.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight">视频管理</h1>
      <Button variant="outline" as-child>
        <router-link to="/creator/upload">发布视频</router-link>
      </Button>
    </div>

    <div class="bg-card rounded-xl border shadow-sm overflow-hidden">
      <!-- Tabs / Filters placeholder -->
      <div class="border-b px-6 py-3 flex gap-6 text-sm font-medium">
        <div
          class="pb-3 -mb-3 cursor-pointer t-tint"
          :class="
            activeTab === 'all'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="handleTabChange('all')"
        >
          全部视频 <span v-if="activeTab === 'all'">({{ total }})</span>
        </div>
        <div
          class="pb-3 -mb-3 cursor-pointer t-tint"
          :class="
            activeTab === 'published'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="handleTabChange('published')"
        >
          已发布 <span v-if="activeTab === 'published'">({{ total }})</span>
        </div>
        <div
          class="pb-3 -mb-3 cursor-pointer t-tint"
          :class="
            activeTab === 'reviewing'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="handleTabChange('reviewing')"
        >
          审核中 <span v-if="activeTab === 'reviewing'">({{ total }})</span>
        </div>
        <div
          class="pb-3 -mb-3 cursor-pointer t-tint"
          :class="
            activeTab === 'private'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="handleTabChange('private')"
        >
          私密 <span v-if="activeTab === 'private'">({{ total }})</span>
        </div>
      </div>

      <div class="p-6">
        <!-- 骨架形状对齐真实条目：160×90 封面 + 标题 + 状态标签 + 三段统计 -->
        <SkeletonGroup v-if="loading" :count="4" class="space-y-6">
          <div class="ct-sk-row flex gap-4">
            <div class="skeleton-shimmer aspect-video w-40 shrink-0 rounded-lg"></div>
            <div class="min-w-0 flex-1 space-y-3 py-1">
              <div class="flex items-center gap-2">
                <div class="ct-sk-a skeleton-shimmer h-5 w-2/5 rounded"></div>
                <div class="ct-sk-b skeleton-shimmer h-4 w-12 rounded-sm"></div>
              </div>
              <div class="flex items-center gap-4 pt-1">
                <div class="ct-sk-c skeleton-shimmer h-3.5 w-14 rounded"></div>
                <div class="ct-sk-c skeleton-shimmer h-3.5 w-14 rounded"></div>
                <div class="ct-sk-d skeleton-shimmer h-3.5 w-24 rounded"></div>
              </div>
            </div>
          </div>
        </SkeletonGroup>

        <EmptyState
          v-else-if="videos.length === 0 && activeTab === 'all'"
          size="lg"
          icon="video"
          title="这里还没有你的稿件"
          description="发布第一个视频，数据和评论都会汇总到创作中心"
        >
          <Button size="sm" as-child>
            <router-link to="/creator/upload">去发布</router-link>
          </Button>
        </EmptyState>

        <EmptyState
          v-else-if="videos.length === 0"
          size="lg"
          icon="folder"
          :title="`没有${TAB_LABELS[activeTab]}的稿件`"
          description="换个标签看看，或者去发布一个新视频"
        >
          <Button variant="outline" size="sm" @click="handleTabChange('all')">
            查看全部视频
          </Button>
        </EmptyState>

        <div v-else class="space-y-6">
          <div v-for="video in videos" :key="video.id" class="flex gap-4 group">
            <!-- Cover -->
            <div class="relative w-40 shrink-0">
              <AppImage :src="video.cover" :alt="video.title" aspect="16 / 9" rounded="lg">
                <div
                  class="media-chip tabular absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-xs"
                >
                  {{ formatClock(video.duration) }}
                </div>
              </AppImage>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <div class="flex items-center gap-2">
                  <h3
                    class="font-medium text-base line-clamp-2 hover:text-primary cursor-pointer t-tint"
                  >
                    <router-link :to="`/video/${video.id}`">{{ video.title }}</router-link>
                  </h3>
                  <div class="flex gap-2">
                    <span
                      v-if="video.status"
                      class="px-2 py-0.5 text-[11px] rounded-sm whitespace-nowrap"
                      :class="{
                        'bg-[var(--status-success-soft)] text-[var(--status-success-ink)]':
                          video.status === 1,
                        'bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]':
                          video.status === 2,
                        'bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]':
                          video.status === 3,
                        'bg-[var(--status-info-soft)] text-[var(--status-info-ink)]':
                          video.status === 4,
                      }"
                    >
                      {{
                        video.statusText ||
                        (video.status === 1
                          ? '已发布'
                          : video.status === 2
                            ? '私密'
                            : video.status === 3
                              ? '已删除'
                              : '审核中')
                      }}
                    </span>
                    <span
                      v-if="video.auditStatus && video.auditStatus !== video.status"
                      class="px-2 py-0.5 text-[11px] rounded-sm whitespace-nowrap"
                      :class="{
                        'bg-[var(--status-success-soft)] text-[var(--status-success-ink)]':
                          video.auditStatus === 1,
                        'bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]':
                          video.auditStatus === 2,
                        'bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]':
                          video.auditStatus === 3,
                        'bg-[var(--status-info-soft)] text-[var(--status-info-ink)]':
                          video.auditStatus === 4,
                      }"
                    >
                      {{
                        video.auditStatusText ||
                        (video.auditStatus === 1
                          ? '已发布'
                          : video.auditStatus === 2
                            ? '私密'
                            : video.auditStatus === 3
                              ? '已删除'
                              : '审核中')
                      }}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span class="flex items-center gap-1">
                    <PlaySquare class="h-3.5 w-3.5" />
                    <span class="tabular">{{ video.views }}</span>
                  </span>
                  <span class="flex items-center gap-1">
                    <MessageSquare class="h-3.5 w-3.5" />
                    <span class="tabular">{{ video.danmuCount }}</span>
                  </span>
                  <span class="flex items-center gap-1">
                    <Clock class="h-3.5 w-3.5" />
                    <span class="tabular">{{ formatDate(video.createdAt) }}</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 t-motion">
              <Button
                as-child
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-primary"
              >
                <router-link
                  :to="{
                    name: 'creator-content-edit',
                    params: { id: video.id },
                    query: {
                      title: video.title,
                      cover: video.cover,
                      status: String(video.status ?? ''),
                    },
                  }"
                  aria-label="编辑视频"
                >
                  <Edit class="h-4 w-4" />
                </router-link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground">
                    <MoreVertical class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    class="cursor-pointer text-destructive focus:text-destructive"
                    @select="confirmDelete(video.id)"
                  >
                    <Trash2 class="mr-2 h-4 w-4" />
                    删除视频
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Dialog -->
    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除该视频？</DialogTitle>
          <DialogDescription>
            删除后将无法恢复，相关的弹幕、评论和数据也将被清除。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="deleteDialogOpen = false">取消</Button>
          <Button variant="destructive" @click="handleDelete"> 确认删除 </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped lang="scss">
/* 卡内二级错峰：--skeleton-phase 落在行容器上，子块基于它偏移
   （同一元素既读又写 --skeleton-index 会构成 CSS 循环）。 */
.ct-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.ct-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.3);
}

.ct-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.4);
}

.ct-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.55);
}

.ct-sk-d {
  --skeleton-index: calc(var(--skeleton-phase) + 0.7);
}
</style>
