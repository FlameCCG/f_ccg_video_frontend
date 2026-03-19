<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  getCreatorCommentList,
  toggleCommentLike,
  createComment,
  deleteComment,
  type CreatorCommentItem,
  type LikeCommentResult,
} from '@/api/comment'
import CommentInput from '@/components/comment/CommentInput.vue'
import {
  MessageSquare,
  ThumbsUp,
  Reply,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  FileText,
  Trash2,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()
const comments = ref<CreatorCommentItem[]>([])
const loading = ref(true)
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const searchKeyword = ref('')
const sortBy = ref<0 | 1 | 2>(0)

const expandedComments = ref<Set<number>>(new Set())
const replyingTo = ref<number | null>(null)

const fetchComments = async () => {
  try {
    loading.value = true
    const res = await getCreatorCommentList({
      page: page.value,
      pageSize: pageSize.value,
      sort: sortBy.value,
      keyword: searchKeyword.value || undefined,
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

watch([page, sortBy], () => {
  void fetchComments()
})

const handleSearch = () => {
  searchKeyword.value = keyword.value
  page.value = 1
  void fetchComments()
}

const toggleExpand = (id: number) => {
  if (expandedComments.value.has(id)) {
    expandedComments.value.delete(id)
  } else {
    expandedComments.value.add(id)
  }
}

const findParentComment = (comment: CreatorCommentItem): CreatorCommentItem | undefined => {
  if (!comment.parentId) return undefined
  return comments.value.find((c) => c.id === comment.parentId)
}

const handleLike = async (comment: CreatorCommentItem) => {
  if (!authStore.isLoggedIn) {
    toast.error('请先登录')
    return
  }
  try {
    const res: LikeCommentResult = await toggleCommentLike({ commentId: comment.id })
    comment.isLiked = res.isLiked
    comment.likeCount = res.likeCount
  } catch {
    toast.error('操作失败')
  }
}

const toggleReply = (id: number) => {
  replyingTo.value = replyingTo.value === id ? null : id
}

const handleReply = async (comment: CreatorCommentItem, content: string, atUserIds: number[]) => {
  try {
    await createComment({
      videoId: comment.videoId || undefined,
      dynamicId: comment.dynamicId || undefined,
      content,
      parentId: comment.id,
      atUserIds,
    })
    toast.success('回复成功')
    replyingTo.value = null
    void fetchComments()
  } catch {
    toast.error('回复失败')
  }
}

const handleDelete = async (comment: CreatorCommentItem) => {
  if (!confirm('确定要删除这条评论吗？')) return
  try {
    await deleteComment({ commentId: comment.id })
    toast.success('已删除')
    comments.value = comments.value.filter((c) => c.id !== comment.id)
    total.value--
  } catch {
    toast.error('删除失败')
  }
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}

const isVideoComment = (comment: CreatorCommentItem) => !!comment.videoId && comment.videoId > 0

const isDynamicComment = (comment: CreatorCommentItem) =>
  !!comment.dynamicId && comment.dynamicId > 0

const goToTarget = (comment: CreatorCommentItem) => {
  if (isVideoComment(comment)) {
    void router.push(`/video/${comment.videoId}`)
  } else if (isDynamicComment(comment)) {
    void router.push(`/user/${comment.userId}`)
  }
}

const parsedContent = (text: string, atUserIds?: number[]) => {
  if (!text) return []
  const regex = /(@[^\s]+)/g
  const parts = text.split(regex)
  const ids = atUserIds ?? []
  let mentionIdx = 0

  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      const userId = mentionIdx < ids.length ? ids[mentionIdx] : undefined
      mentionIdx++
      return { type: 'mention' as const, text: part, id: index, userId }
    }
    return { type: 'text' as const, text: part, id: index, userId: undefined }
  })
}

const handleMentionClick = (userId?: number) => {
  if (userId) {
    void router.push(`/user/${userId}`)
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
            评论管理
          </div>
        </div>

        <div class="relative w-64" @keydown.enter="handleSearch">
          <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            :model-value="keyword"
            placeholder="搜索评论内容"
            class="pl-9 h-9 bg-muted/50 border-transparent focus-visible:bg-background"
            @update:model-value="(v) => (keyword = String(v))"
          />
        </div>
      </div>

      <!-- Filters -->
      <div class="px-6 py-3 border-b bg-muted/10 flex items-center justify-between text-sm">
        <div class="text-muted-foreground">共 {{ total }} 条评论</div>
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
          <button
            class="transition-colors"
            :class="
              sortBy === 2
                ? 'text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            "
            @click="sortBy = 2"
          >
            回复最多
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
          v-else-if="comments.length === 0"
          class="py-20 text-center text-muted-foreground flex flex-col items-center"
        >
          <MessageSquare class="h-12 w-12 mb-4 opacity-20" />
          <p>没有找到相关评论</p>
        </div>

        <div v-else class="divide-y">
          <div
            v-for="comment in comments"
            :key="comment.id"
            class="p-6 flex gap-4 group hover:bg-muted/30 transition-colors"
          >
            <!-- Avatar -->
            <div
              class="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-muted border cursor-pointer"
              @click="router.push(`/user/${comment.userId}`)"
            >
              <img
                :src="comment.avatar"
                :alt="comment.username"
                class="w-full h-full object-cover"
              />
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <!-- Header -->
              <div class="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
                <span
                  class="font-medium text-sm text-foreground/90 cursor-pointer hover:text-primary transition-colors"
                  @click="router.push(`/user/${comment.userId}`)"
                >
                  {{ comment.username }}
                </span>

                <template v-if="comment.replyTo && comment.parentId">
                  <span class="text-sm text-muted-foreground">回复</span>
                  <span
                    class="text-sm text-primary cursor-pointer hover:underline"
                    @click="router.push(`/user/${comment.replyTo.userId}`)"
                  >
                    @{{ comment.replyTo.username }}
                  </span>
                  <span class="text-sm text-muted-foreground">的评论</span>

                  <button
                    class="ml-2 text-xs text-primary hover:underline flex items-center gap-0.5"
                    @click="toggleExpand(comment.id)"
                  >
                    {{ expandedComments.has(comment.id) ? '收起评论' : '查看评论' }}
                  </button>
                </template>
              </div>

              <!-- Parent Comment Box (Expanded) -->
              <div
                v-if="expandedComments.has(comment.id) && comment.parentId"
                class="mb-3 bg-muted/50 border rounded-lg p-4 text-sm"
              >
                <template v-if="findParentComment(comment)">
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 rounded-full bg-muted overflow-hidden">
                      <img
                        :src="findParentComment(comment)!.avatar"
                        class="w-full h-full object-cover"
                      />
                    </div>
                    <span class="font-medium text-muted-foreground">
                      {{ findParentComment(comment)!.username }}
                    </span>
                  </div>
                  <p class="text-foreground/80 whitespace-pre-wrap break-words">
                    <template
                      v-for="part in parsedContent(
                        findParentComment(comment)!.content,
                        findParentComment(comment)!.atUserIds
                      )"
                      :key="part.id"
                    >
                      <span
                        v-if="part.type === 'mention'"
                        class="text-primary cursor-pointer hover:underline"
                        @click="handleMentionClick(part.userId)"
                      >
                        {{ part.text }}
                      </span>
                      <template v-else>{{ part.text }}</template>
                    </template>
                  </p>
                </template>
                <template v-else>
                  <div class="flex items-center gap-2 mb-2">
                    <div class="w-6 h-6 rounded-full bg-muted overflow-hidden">
                      <div
                        class="w-full h-full bg-primary/20 flex items-center justify-center text-primary text-xs"
                      >
                        {{ comment.replyTo?.username?.charAt(0)?.toUpperCase() || '@' }}
                      </div>
                    </div>
                    <span class="font-medium text-muted-foreground">
                      {{ comment.replyTo?.username }}
                    </span>
                  </div>
                  <p class="text-muted-foreground/60 italic">该评论不在当前页，请翻页查看</p>
                </template>
              </div>

              <!-- Current Comment Content -->
              <p
                class="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed mb-3"
              >
                <template
                  v-for="part in parsedContent(comment.content, comment.atUserIds)"
                  :key="part.id"
                >
                  <span
                    v-if="part.type === 'mention'"
                    class="text-primary cursor-pointer hover:underline"
                    @click="handleMentionClick(part.userId)"
                  >
                    {{ part.text }}
                  </span>
                  <template v-else>{{ part.text }}</template>
                </template>
              </p>

              <!-- Actions & Meta -->
              <div class="flex items-center gap-6 text-xs text-muted-foreground">
                <span>{{ formatDate(comment.createdAt) }}</span>
                <span v-if="comment.commenterAddr" class="text-muted-foreground/60">
                  IP属地: {{ comment.commenterAddr }}
                </span>

                <button
                  class="flex items-center gap-1.5 hover:text-primary transition-colors"
                  :class="{ 'text-primary': comment.isLiked }"
                  @click="handleLike(comment)"
                >
                  <ThumbsUp
                    class="h-3.5 w-3.5"
                    :class="{ 'fill-primary text-primary': comment.isLiked }"
                  />
                  {{ comment.likeCount || '点赞' }}
                </button>

                <button
                  class="flex items-center gap-1.5 hover:text-primary transition-colors"
                  :class="{ 'text-primary': replyingTo === comment.id }"
                  @click="toggleReply(comment.id)"
                >
                  <Reply class="h-3.5 w-3.5" />
                  回复
                </button>

                <button
                  class="flex items-center gap-1.5 hover:text-destructive transition-colors ml-auto"
                  @click="handleDelete(comment)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                  删除
                </button>
              </div>

              <!-- Reply Input -->
              <div v-if="replyingTo === comment.id" class="mt-3">
                <CommentInput
                  :placeholder="`回复 @${comment.username} :`"
                  auto-focus
                  @submit="(content, atUserIds) => handleReply(comment, content, atUserIds)"
                />
              </div>
            </div>

            <!-- Target Video/Dynamic -->
            <div
              class="w-32 shrink-0 cursor-pointer group/target flex flex-col gap-1.5"
              @click="goToTarget(comment)"
            >
              <div class="w-full aspect-video bg-muted rounded overflow-hidden border relative">
                <img
                  v-if="comment.videoCover"
                  :src="comment.videoCover"
                  class="w-full h-full object-cover group-hover/target:scale-105 transition-transform duration-300"
                />
                <div
                  v-else
                  class="absolute inset-0 flex items-center justify-center text-muted-foreground"
                >
                  <FileText class="h-5 w-5 opacity-40" />
                </div>
              </div>
              <div class="flex items-center gap-1">
                <Play
                  v-if="isVideoComment(comment)"
                  class="h-3 w-3 text-muted-foreground/50 shrink-0"
                />
                <FileText
                  v-else-if="isDynamicComment(comment)"
                  class="h-3 w-3 text-muted-foreground/50 shrink-0"
                />
                <div
                  class="text-xs text-muted-foreground line-clamp-2 group-hover/target:text-primary transition-colors"
                  :title="comment.videoTitle"
                >
                  {{ comment.videoTitle || (isDynamicComment(comment) ? '查看动态' : '查看详情') }}
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
