<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getCreatorDanmuList, deleteDanmu, type CreatorDanmuItem } from '@/api/danmu'
import { MessageCircle, Search, ChevronLeft, ChevronRight, Play, Trash2 } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { toast } from 'vue-sonner'

const router = useRouter()
const danmus = ref<CreatorDanmuItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const searchKeyword = ref('')
const sortBy = ref<0 | 1>(0)

const fetchDanmus = async () => {
  try {
    loading.value = true
    const res = await getCreatorDanmuList({
      page: page.value,
      pageSize: pageSize.value,
      sort: sortBy.value,
      keyword: searchKeyword.value || undefined,
    })
    danmus.value = res.list
    total.value = res.total
  } catch (error) {
    console.error('Failed to fetch danmus:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchDanmus()
})

watch([page, sortBy], () => {
  void fetchDanmus()
})

const handleSearch = () => {
  searchKeyword.value = keyword.value
  page.value = 1
  void fetchDanmus()
}

const handleDelete = async (danmu: CreatorDanmuItem) => {
  if (!confirm('确定要删除这条弹幕吗？')) return
  try {
    await deleteDanmu({ danmuId: danmu.id })
    toast.success('已删除')
    danmus.value = danmus.value.filter((d) => d.id !== danmu.id)
    total.value--
  } catch {
    toast.error('删除失败')
  }
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

const formatDanmuTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const goToTarget = (danmu: CreatorDanmuItem) => {
  if (danmu.videoId && danmu.videoId > 0) {
    void router.push(`/video/${danmu.videoId}`)
  }
}
</script>

<template>
  <div class="space-y-6 max-w-6xl mx-auto">
    <div class="bg-card rounded-xl border shadow-sm overflow-hidden">
      <!-- Header -->
      <div class="border-b px-6 py-4 flex items-center justify-between">
        <div class="flex gap-8 text-base font-medium">
          <div class="text-primary border-b-2 border-primary pb-4 -mb-4 cursor-pointer">
            弹幕管理
          </div>
        </div>

        <div class="relative w-64" @keydown.enter="handleSearch">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            :model-value="keyword"
            placeholder="搜索弹幕内容/发送者/视频标题"
            class="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background"
            @update:model-value="(v) => (keyword = String(v))"
          />
        </div>
      </div>

      <!-- Filters -->
      <div class="px-6 py-3 border-b bg-muted/10 flex items-center justify-between text-sm">
        <div class="text-muted-foreground">共 {{ total }} 条弹幕</div>
        <div class="flex items-center gap-4">
          <button
            class="transition-colors"
            :class="
              sortBy === 0
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="sortBy = 0"
          >
            最近发布
          </button>
          <button
            class="transition-colors"
            :class="
              sortBy === 1
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="sortBy = 1"
          >
            点赞最多
          </button>
        </div>
      </div>

      <!-- List -->
      <div class="p-0">
        <div v-if="loading" class="p-6 space-y-8">
          <div v-for="i in 3" :key="i" class="flex gap-4 animate-pulse">
            <div class="w-10 h-10 bg-muted rounded-full shrink-0"></div>
            <div class="flex-1 space-y-3 py-1">
              <div class="h-4 bg-muted rounded w-1/4"></div>
              <div class="h-4 bg-muted rounded w-3/4"></div>
              <div class="h-4 bg-muted rounded w-1/2"></div>
            </div>
            <div class="w-32 shrink-0 space-y-2">
              <div class="w-full aspect-video bg-muted rounded"></div>
              <div class="h-3 bg-muted rounded w-full"></div>
            </div>
          </div>
        </div>

        <div
          v-else-if="danmus.length === 0"
          class="py-20 text-center text-muted-foreground flex flex-col items-center"
        >
          <MessageCircle class="h-12 w-12 mb-4 opacity-20" />
          <p>没有找到相关弹幕</p>
        </div>

        <div v-else class="divide-y">
          <div
            v-for="danmu in danmus"
            :key="danmu.id"
            class="p-6 flex gap-4 group hover:bg-muted/30 transition-colors"
          >
            <!-- Avatar -->
            <div class="shrink-0 cursor-pointer" @click="router.push(`/user/${danmu.userId}`)">
              <AppAvatar
                :src="danmu.avatar"
                :name="danmu.username"
                :alt="danmu.username"
                container-class="h-10 w-10 border bg-muted"
                text-class="text-sm font-semibold"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Header -->
              <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
                <span
                  class="font-medium text-sm text-foreground/90 cursor-pointer hover:text-primary transition-colors"
                  @click="router.push(`/user/${danmu.userId}`)"
                >
                  {{ danmu.username }}
                </span>
                <span class="text-xs text-muted-foreground ml-2"
                  >在视频 {{ formatDanmuTime(danmu.timeOffset) }} 处发送了弹幕：</span
                >
              </div>

              <!-- Current Danmu Content -->
              <p
                class="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed mb-3"
              >
                <span :style="{ color: danmu.color }">{{ danmu.content }}</span>
              </p>

              <!-- Actions & Meta -->
              <div class="flex items-center gap-6 text-xs text-muted-foreground">
                <span>{{ formatDate(danmu.createdAt) }}</span>

                <span v-if="danmu.likeCount > 0" class="text-muted-foreground/60">
                  获赞: {{ danmu.likeCount }}
                </span>

                <button
                  class="flex items-center gap-1.5 hover:text-destructive transition-colors ml-auto"
                  @click="handleDelete(danmu)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            </div>

            <!-- Target Video -->
            <div
              class="w-32 shrink-0 cursor-pointer group/target flex flex-col gap-1.5"
              @click="goToTarget(danmu)"
            >
              <div class="w-full aspect-video bg-muted rounded overflow-hidden border relative">
                <img
                  v-if="danmu.videoCover"
                  :src="danmu.videoCover"
                  class="w-full h-full object-cover group-hover/target:scale-105 transition-transform duration-300"
                />
                <div v-else class="absolute inset-0 flex items-center justify-center bg-black/5">
                  <Play class="h-6 w-6 text-primary/40" />
                </div>
              </div>
              <div class="flex items-center gap-1">
                <Play class="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <div
                  class="text-xs text-muted-foreground line-clamp-2 group-hover/target:text-primary transition-colors"
                  :title="danmu.videoTitle"
                >
                  {{ danmu.videoTitle || '查看原视频' }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="total > 0" class="p-6 border-t flex items-center justify-between">
          <div class="text-sm text-muted-foreground">共 {{ Math.ceil(total / pageSize) }} 页</div>
          <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">
              <ChevronLeft class="h-4 w-4 mr-1" />
              上一页
            </Button>
            <div class="text-sm font-medium px-4">
              {{ page }}
            </div>
            <Button
              variant="outline"
              size="sm"
              :disabled="page >= Math.ceil(total / pageSize)"
              @click="page++"
            >
              下一页
              <ChevronRight class="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
