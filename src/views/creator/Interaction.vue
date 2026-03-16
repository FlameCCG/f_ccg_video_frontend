<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCreatorCommentList, type CommentItem } from '@/api/comment'
import { MessageSquare, ThumbsUp, Reply } from 'lucide-vue-next'

const comments = ref<CommentItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)

const fetchComments = async () => {
  try {
    loading.value = true
    const res = await getCreatorCommentList({
      page: page.value,
      pageSize: 20,
      sort: 0, // 0: recent
    })
    comments.value = res.list
    total.value = res.total
  } catch (error) {
    console.error('Failed to fetch comments:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchComments()
})

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight">互动管理</h1>
    </div>

    <div class="bg-card rounded-xl border shadow-sm overflow-hidden">
      <!-- Tabs -->
      <div class="border-b px-6 py-3 flex gap-6 text-sm font-medium">
        <div class="text-primary border-b-2 border-primary pb-3 -mb-3 cursor-pointer">
          全部评论 ({{ total }})
        </div>
      </div>

      <div class="p-6">
        <div v-if="loading" class="space-y-6">
          <div v-for="i in 3" :key="i" class="flex gap-4 animate-pulse">
            <div class="w-10 h-10 bg-muted rounded-full shrink-0"></div>
            <div class="flex-1 space-y-2 py-1">
              <div class="h-4 bg-muted rounded w-1/4"></div>
              <div class="h-4 bg-muted rounded w-full"></div>
              <div class="h-4 bg-muted rounded w-2/3"></div>
            </div>
          </div>
        </div>

        <div
          v-else-if="comments.length === 0"
          class="py-20 text-center text-muted-foreground flex flex-col items-center"
        >
          <MessageSquare class="h-12 w-12 mb-4 opacity-20" />
          <p>还没有收到评论</p>
        </div>

        <div v-else class="space-y-6">
          <div v-for="comment in comments" :key="comment.id" class="flex gap-4 group">
            <!-- Avatar -->
            <div class="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted">
              <img
                :src="comment.avatar"
                :alt="comment.username"
                class="w-full h-full object-cover"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="font-medium text-sm text-foreground/90">{{ comment.username }}</span>
                <span class="text-xs text-muted-foreground">{{
                  formatDate(comment.createdAt)
                }}</span>
              </div>

              <p class="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
                {{ comment.content }}
              </p>

              <!-- Video Info (mocked placeholder, as API might not return video title directly without extra fields, but we show it if available) -->
              <div
                class="mt-3 bg-muted/50 rounded-md p-3 flex items-center gap-3 text-xs text-muted-foreground cursor-pointer hover:bg-muted transition-colors"
              >
                <div class="w-12 aspect-video bg-muted-foreground/20 rounded"></div>
                <div class="flex-1 truncate">来自视频：视频标题占位符</div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <button class="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <ThumbsUp class="h-3.5 w-3.5" />
                  {{ comment.likeCount || '点赞' }}
                </button>
                <button class="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <Reply class="h-3.5 w-3.5" />
                  回复
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
