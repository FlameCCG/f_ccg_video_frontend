<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getCreatorDanmuList, deleteDanmu, type CreatorDanmuItem } from '@/api/danmu'
import { MessageCircle, Search, ChevronLeft, ChevronRight, Play, Trash2 } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppImage from '@/components/common/AppImage.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import { toast } from 'vue-sonner'
import { formatClock } from '@/utils/format'

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

const clearSearch = () => {
  keyword.value = ''
  searchKeyword.value = ''
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
            placeholder="按弹幕内容 / 发送者 / 视频标题搜索"
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
            class="t-tint"
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
            class="t-tint"
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
        <!-- 骨架形状对齐真实条目：头像 + 三行文本 + 右侧 16:9 目标视频 -->
        <SkeletonGroup v-if="loading" :count="4" class="space-y-8 p-6">
          <div class="cd-sk-row flex gap-4">
            <div class="skeleton-shimmer h-10 w-10 shrink-0 rounded-full"></div>
            <div class="min-w-0 flex-1 space-y-3 py-1">
              <div class="cd-sk-a skeleton-shimmer h-4 w-1/4 rounded"></div>
              <div class="cd-sk-b skeleton-shimmer h-4 w-3/4 rounded"></div>
              <div class="cd-sk-c skeleton-shimmer h-3.5 w-1/2 rounded"></div>
            </div>
            <div class="w-32 shrink-0 space-y-2">
              <div class="cd-sk-d skeleton-shimmer aspect-video w-full rounded"></div>
              <div class="cd-sk-e skeleton-shimmer h-3 w-full rounded"></div>
            </div>
          </div>
        </SkeletonGroup>

        <EmptyState
          v-else-if="danmus.length === 0 && searchKeyword"
          size="lg"
          icon="search"
          announce
          title=""
          description="换个关键词，或者清空搜索看看全部弹幕"
        >
          <template #title>没有匹配「{{ searchKeyword.slice(0, 20) }}」的弹幕</template>
          <Button variant="outline" size="sm" @click="clearSearch">清空搜索</Button>
        </EmptyState>

        <EmptyState
          v-else-if="danmus.length === 0"
          size="lg"
          :icon="MessageCircle"
          title="你的视频还没有收到弹幕"
          description="弹幕会实时出现在这里，你可以随时删除不合适的内容"
        />

        <div v-else class="divide-y">
          <div
            v-for="danmu in danmus"
            :key="danmu.id"
            class="p-6 flex gap-4 group hover:bg-muted/30 t-tint"
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
                  class="font-medium text-sm text-foreground/90 cursor-pointer hover:text-primary t-tint"
                  @click="router.push(`/user/${danmu.userId}`)"
                >
                  {{ danmu.username }}
                </span>
                <span class="text-xs text-muted-foreground ml-2"
                  >在视频 {{ formatClock(danmu.timeOffset) }} 处发送了弹幕：</span
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
                <span class="tabular">{{ formatDate(danmu.createdAt) }}</span>

                <span v-if="danmu.likeCount > 0" class="text-muted-foreground/60">
                  获赞 <span class="tabular">{{ danmu.likeCount }}</span>
                </span>

                <button
                  class="t-tint ml-auto flex items-center gap-1.5 hover:text-destructive"
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
              <div class="w-full overflow-hidden rounded border">
                <AppImage
                  :src="danmu.videoCover"
                  :alt="danmu.videoTitle || '目标视频封面'"
                  aspect="16 / 9"
                  :fallback-icon="Play"
                  img-class="cd-cover-img group-hover/target:scale-105"
                />
              </div>
              <div class="flex items-center gap-1">
                <Play class="h-3 w-3 text-muted-foreground/50 shrink-0" />
                <div
                  class="text-xs text-muted-foreground line-clamp-2 group-hover/target:text-primary t-tint"
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

<style scoped lang="scss">
/* 卡内二级错峰：--skeleton-phase 落在行容器上，子块基于它偏移
   （同一元素既读又写 --skeleton-index 会构成 CSS 循环）。 */
.cd-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.cd-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.25);
}

.cd-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.4);
}

.cd-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.55);
}

.cd-sk-d {
  --skeleton-index: calc(var(--skeleton-phase) + 0.35);
}

.cd-sk-e {
  --skeleton-index: calc(var(--skeleton-phase) + 0.5);
}

/* Tailwind v4 的 scale-* 是独立的 `scale` 属性；显式过渡它，否则 hover 缩放是瞬移。
   选择器要穿透到 AppImage 内部的 <img>，所以用 :deep()。 */
:deep(.cd-cover-img) {
  transition: scale var(--duration-normal) var(--ease-out-expo);
}
</style>
