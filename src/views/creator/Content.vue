<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getUserVideoList, deleteVideo, type UserVideoItem } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { PlaySquare, MessageSquare, Clock, MoreVertical, Trash2, Edit } from 'lucide-vue-next'
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

const authStore = useAuthStore()
const { toast } = useToast()

const videos = ref<UserVideoItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)

const deleteDialogOpen = ref(false)
const videoToDelete = ref<number | null>(null)

const fetchVideos = async () => {
  if (!authStore.userId) return
  try {
    loading.value = true
    const res = await getUserVideoList({
      userId: authStore.userId,
      page: page.value,
      pageSize: 20,
    })
    videos.value = res.list
    total.value = res.total
  } catch (error) {
    console.error('Failed to fetch videos:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchVideos()
})

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const confirmDelete = (id: number) => {
  videoToDelete.value = id
  deleteDialogOpen.value = true
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
      <h1 class="text-2xl font-bold tracking-tight">内容管理</h1>
      <Button variant="outline" as-child>
        <router-link to="/creator/upload">发布视频</router-link>
      </Button>
    </div>

    <div class="bg-card rounded-xl border shadow-sm overflow-hidden">
      <!-- Tabs / Filters placeholder -->
      <div class="border-b px-6 py-3 flex gap-6 text-sm font-medium">
        <div class="text-primary border-b-2 border-primary pb-3 -mb-3 cursor-pointer">
          全部视频 ({{ total }})
        </div>
      </div>

      <div class="p-6">
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 3" :key="i" class="flex gap-4 animate-pulse">
            <div class="w-40 h-24 bg-muted rounded-lg shrink-0"></div>
            <div class="flex-1 space-y-2 py-1">
              <div class="h-5 bg-muted rounded w-1/3"></div>
              <div class="h-4 bg-muted rounded w-1/4 mt-4"></div>
            </div>
          </div>
        </div>

        <div
          v-else-if="videos.length === 0"
          class="py-20 text-center text-muted-foreground flex flex-col items-center"
        >
          <PlaySquare class="h-12 w-12 mb-4 opacity-20" />
          <p>还没有发布过视频</p>
          <Button class="mt-4" as-child>
            <router-link to="/creator/upload">去发布</router-link>
          </Button>
        </div>

        <div v-else class="space-y-6">
          <div v-for="video in videos" :key="video.id" class="flex gap-4 group">
            <!-- Cover -->
            <div class="relative w-40 aspect-video rounded-lg overflow-hidden shrink-0 bg-muted">
              <img :src="video.cover" :alt="video.title" class="w-full h-full object-cover" />
              <div
                class="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded"
              >
                {{ formatTime(video.duration) }}
              </div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div>
                <h3
                  class="font-medium text-base line-clamp-2 hover:text-primary cursor-pointer transition-colors"
                >
                  <router-link :to="`/video/${video.id}`">{{ video.title }}</router-link>
                </h3>
                <div class="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  <span class="flex items-center gap-1"
                    ><PlaySquare class="h-3.5 w-3.5" /> {{ video.views }}</span
                  >
                  <span class="flex items-center gap-1"
                    ><MessageSquare class="h-3.5 w-3.5" /> {{ video.danmuCount }}</span
                  >
                  <span class="flex items-center gap-1"
                    ><Clock class="h-3.5 w-3.5" /> {{ formatDate(video.createdAt) }}</span
                  >
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div
              class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 text-muted-foreground hover:text-primary"
              >
                <Edit class="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground">
                    <MoreVertical class="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    class="text-red-500 cursor-pointer"
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
          <Button class="bg-red-500 hover:bg-red-600 text-white" @click="handleDelete">
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
