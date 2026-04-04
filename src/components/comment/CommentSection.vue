<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {
  getCommentList,
  createComment,
  getReplyList,
  type CommentItem as TCommentItem,
} from '@/api/comment'
import CommentInput from './CommentInput.vue'
import CommentItem from './CommentItem.vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  videoId?: number
  dynamicId?: number
  authorId?: number
  initialCommentId?: number
}>()

const emit = defineEmits<{
  commentConsumed: []
}>()

const route = useRoute()

const comments = ref<TCommentItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortBy = ref<'time' | 'hot'>('hot')
const isLoading = ref(false)

const getTargetCommentId = () => {
  const rawTarget = props.initialCommentId ?? route.query.commentId
  const normalized = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
  const commentId = typeof normalized === 'number' ? normalized : Number(normalized)

  if (!commentId || Number.isNaN(commentId)) return undefined
  return commentId
}

const autoExpandRootId = ref<number | null>(null)
const autoExpandTargetId = ref<number | null>(null)

const scrollAndHighlight = (el: HTMLElement) => {
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.style.backgroundColor = 'var(--color-secondary)'
  el.style.transition = 'background-color 1.5s'
  setTimeout(() => {
    el.style.backgroundColor = ''
  }, 2000)
}

const findAndExpandReply = async (targetId: number) => {
  for (const comment of comments.value) {
    if (comment.replyCount <= 0) continue
    try {
      const res = await getReplyList({ rootId: comment.id, page: 1, pageSize: 50 })
      const found = res.list.some((reply) => reply.id === targetId)
      if (found) {
        autoExpandRootId.value = comment.id
        autoExpandTargetId.value = targetId
        return true
      }
    } catch {
      // Ignore reply loading failures and continue scanning the remaining roots.
    }
  }

  return false
}

const focusTargetComment = async () => {
  const targetCommentId = getTargetCommentId()
  if (!targetCommentId) return

  await nextTick()
  const targetEl = document.getElementById(`comment-${targetCommentId}`)
  if (targetEl) {
    scrollAndHighlight(targetEl)
    emit('commentConsumed')
    return
  }

  await findAndExpandReply(targetCommentId)
  emit('commentConsumed')
}

const loadComments = async (reset = false) => {
  if (isLoading.value) return
  if (reset) {
    page.value = 1
    comments.value = []
  }

  isLoading.value = true
  try {
    const res = await getCommentList({
      videoId: props.videoId || undefined,
      dynamicId: props.dynamicId || undefined,
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sortBy.value,
    })
    if (reset) {
      comments.value = res.list
    } else {
      comments.value.push(...res.list)
    }
    total.value = res.total
  } catch (error) {
    console.error('Failed to load comments', error)
  } finally {
    isLoading.value = false
  }
  await focusTargetComment()
}

const handleSortChange = (sort: 'time' | 'hot') => {
  if (sortBy.value === sort) return
  sortBy.value = sort
  void loadComments(true)
}

const handleCreateComment = async (content: string, atUserIds: number[], pictures: string[]) => {
  try {
    const res = await createComment({
      videoId: props.videoId || undefined,
      dynamicId: props.dynamicId || undefined,
      content,
      atUserIds,
      pictures,
    })
    toast.success('发表成功')
    // Insert at the top
    comments.value.unshift(res)
    total.value++
  } catch (error) {
    console.error('Failed to create comment', error)
  }
}

const handleCommentDeleted = (id: number) => {
  comments.value = comments.value.filter((c) => c.id !== id)
  total.value--
}

const handleCommentPinned = (id: number, pinned: boolean) => {
  const comment = comments.value.find((c) => c.id === id)
  if (comment) {
    comment.isPinned = pinned
    // Re-sort to put pinned at top if needed, but usually we just reload or let it be
    if (pinned) {
      comments.value = [comment, ...comments.value.filter((c) => c.id !== id)]
    } else {
      void loadComments(true)
    }
  }
}

watch([() => props.videoId, () => props.dynamicId], () => {
  if (props.videoId || props.dynamicId) {
    void loadComments(true)
  }
})

watch(
  () => route.query.commentId,
  (commentId, previousCommentId) => {
    if (commentId === previousCommentId) return
    if ((props.videoId || props.dynamicId) && commentId) {
      void loadComments(true)
    }
  }
)

watch(
  () => props.initialCommentId,
  (commentId, previousCommentId) => {
    if (commentId === previousCommentId) return
    if ((props.videoId || props.dynamicId) && commentId) {
      void loadComments(true)
    }
  }
)

onMounted(() => {
  if (props.videoId || props.dynamicId) {
    void loadComments(true)
  }
})
</script>

<template>
  <div class="mt-6">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6">
      <h3 class="text-xl font-semibold text-foreground">评论</h3>
      <span class="text-[13px] text-muted-foreground/80">{{ total }}</span>

      <div class="flex items-center gap-3 text-[13px] ml-2">
        <button
          class="transition-colors hover:text-primary"
          :class="sortBy === 'hot' ? 'text-foreground font-medium' : 'text-muted-foreground/80'"
          @click="handleSortChange('hot')"
        >
          最热
        </button>
        <div class="h-3 w-[1px] bg-accent"></div>
        <button
          class="transition-colors hover:text-primary"
          :class="sortBy === 'time' ? 'text-foreground font-medium' : 'text-muted-foreground/80'"
          @click="handleSortChange('time')"
        >
          最新
        </button>
      </div>
    </div>

    <!-- Main Input -->
    <div class="mb-8">
      <CommentInput @submit="handleCreateComment" />
    </div>

    <!-- Comment List -->
    <div class="space-y-2">
      <template v-if="comments.length > 0">
        <div v-for="(comment, index) in comments" :key="comment.id">
          <CommentItem
            :comment="comment"
            :video-id="videoId"
            :dynamic-id="dynamicId"
            :is-author="authorId === comment.userId"
            :auto-expand-target-id="
              autoExpandRootId === comment.id ? (autoExpandTargetId ?? undefined) : undefined
            "
            @deleted="handleCommentDeleted"
            @pinned="handleCommentPinned"
          />
          <div v-if="index < comments.length - 1" class="h-px w-full bg-border/50 ml-14"></div>
        </div>
      </template>

      <div v-else-if="!isLoading" class="py-12 text-center text-muted-foreground/80">
        还没有评论，快来抢沙发吧~
      </div>

      <!-- Load More -->
      <div v-if="comments.length < total" class="pt-4 text-center">
        <button
          class="text-[13px] text-muted-foreground/80 hover:text-primary transition-colors"
          :disabled="isLoading"
          @click="
            () => {
              page++
              void loadComments()
            }
          "
        >
          {{ isLoading ? '加载中...' : '加载更多评论' }}
        </button>
      </div>
    </div>
  </div>
</template>
