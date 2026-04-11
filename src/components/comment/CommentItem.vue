<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { CommentItem } from '@/api/comment'
import { toggleCommentLike, deleteComment, toggleCommentPin, getReplyList } from '@/api/comment'
import { ThumbsUp, MoreVertical, Pin, Trash2 } from 'lucide-vue-next'
import { useTimeAgo } from '@vueuse/core'
import { onClickOutside } from '@vueuse/core'
import { toast } from 'vue-sonner'
import CommentInput from './CommentInput.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import ImageViewer from '@/components/common/ImageViewer.vue'

const router = useRouter()

const props = defineProps<{
  comment: CommentItem
  videoId?: number
  dynamicId?: number
  isAuthor?: boolean
  isReply?: boolean
  autoExpandTargetId?: number
}>()

const emit = defineEmits<{
  (e: 'deleted', id: number): void
  (e: 'pinned', id: number, pinned: boolean): void
  (e: 'replied'): void
}>()

const authStore = useAuthStore()

const isLiked = ref(props.comment.isLiked)
const likeCount = ref(props.comment.likeCount)
const isPinned = ref(props.comment.isPinned)

const showReplyInput = ref(false)
const showMoreMenu = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)

onClickOutside(moreMenuRef, () => {
  showMoreMenu.value = false
})

const previewImageUrl = ref('')
const showPreview = ref(false)

const openImagePreview = (url: string) => {
  previewImageUrl.value = url
  showPreview.value = true
}

const replies = ref<CommentItem[]>([])
const repliesTotal = ref(props.comment.replyCount)
const repliesPage = ref(1)
const loadingReplies = ref(false)
const showAllReplies = ref(false)

const timeAgo = useTimeAgo(new Date(props.comment.createdAt))

const isSelf = computed(() => authStore.user?.id === props.comment.userId)

const parsedContent = computed(() => {
  const text = props.comment.content
  if (!text) return []

  const regex = /(@[^\s]+)/g
  const parts = text.split(regex)
  const atUserIds = props.comment.atUserIds ?? []
  let mentionIdx = 0

  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      const userId = mentionIdx < atUserIds.length ? atUserIds[mentionIdx] : undefined
      mentionIdx++
      return { type: 'mention' as const, text: part, id: index, userId }
    }
    return { type: 'text' as const, text: part, id: index, userId: undefined }
  })
})

const handleMentionClick = (userId?: number) => {
  if (userId) {
    void router.push(`/user/${userId}`)
  }
}

const handleLike = async () => {
  if (!authStore.isLoggedIn) {
    toast.error('请先登录')
    return
  }
  try {
    const res = await toggleCommentLike({ commentId: props.comment.id })
    isLiked.value = res.isLiked
    likeCount.value = res.likeCount
  } catch (error) {
    console.error('Like failed', error)
  }
}

const handleDelete = async () => {
  if (!confirm('确定要删除这条评论吗？')) return
  try {
    await deleteComment({ commentId: props.comment.id })
    toast.success('已删除')
    emit('deleted', props.comment.id)
  } catch (error) {
    console.error('Delete failed', error)
  }
}

const handlePin = async () => {
  try {
    await toggleCommentPin({ commentId: props.comment.id, pinned: !isPinned.value })
    isPinned.value = !isPinned.value
    toast.success(isPinned.value ? '已置顶' : '已取消置顶')
    emit('pinned', props.comment.id, isPinned.value)
  } catch (error) {
    console.error('Pin failed', error)
  }
}

const loadReplies = async () => {
  if (loadingReplies.value) return
  loadingReplies.value = true
  try {
    const res = await getReplyList({
      rootId: props.comment.id,
      page: repliesPage.value,
      pageSize: 10,
    })
    if (repliesPage.value === 1) {
      replies.value = res.list
    } else {
      replies.value.push(...res.list)
    }
    repliesTotal.value = res.total
    showAllReplies.value = true
  } catch (error) {
    console.error('Failed to load replies', error)
  } finally {
    loadingReplies.value = false
  }
}

/**
 * 当收到 autoExpandTargetId 时，自动加载回复并滚动到目标评论
 */
watch(
  () => props.autoExpandTargetId,
  async (targetId) => {
    if (!targetId || props.isReply) return
    // 加载回复
    repliesPage.value = 1
    await loadReplies()
    // 如果还没找到，继续加载更多
    while (
      !replies.value.some((r) => r.id === targetId) &&
      replies.value.length < repliesTotal.value
    ) {
      repliesPage.value++
      await loadReplies()
    }
    // 等 DOM 渲染完成后滚动到目标
    void nextTick(() => {
      const el = document.getElementById(`comment-${targetId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.style.backgroundColor = 'var(--color-secondary)'
        el.style.transition = 'background-color 1.5s'
        setTimeout(() => {
          el.style.backgroundColor = ''
        }, 2000)
      }
    })
  },
  { immediate: true }
)

const handleReplySubmit = async (content: string, atUserIds: number[], pictures: string[]) => {
  try {
    const { createComment } = await import('@/api/comment')
    const res = await createComment({
      videoId: props.videoId || undefined,
      dynamicId: props.dynamicId || undefined,
      content,
      parentId: props.comment.id,
      atUserIds,
      pictures,
    })
    toast.success('回复成功')
    showReplyInput.value = false

    // If this is a top-level comment, we add the reply to our own replies list
    if (!props.isReply) {
      replies.value.unshift(res)
      repliesTotal.value++
    }

    emit('replied')
  } catch (error) {
    console.error('Reply failed', error)
  }
}

const handleReplyDeleted = (id: number) => {
  replies.value = replies.value.filter((r) => r.id !== id)
  repliesTotal.value--
}
</script>

<template>
  <div :id="'comment-' + comment.id" class="flex gap-4 py-4" :class="{ 'py-2': isReply }">
    <!-- Avatar -->
    <div class="shrink-0">
      <AppAvatar
        :src="comment.avatar"
        :name="comment.username"
        alt="avatar"
        :container-class="isReply ? 'h-6 w-6' : 'h-10 w-10'"
        :text-class="isReply ? 'text-[11px] font-semibold' : 'text-sm font-semibold'"
      />
    </div>

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="text-[13px] font-medium text-muted-foreground">{{ comment.username }}</span>
        <span
          v-if="isPinned && !isReply"
          class="rounded border border-accent px-1 text-[10px] text-accent"
          >置顶</span
        >
      </div>

      <p class="mt-1.5 text-[15px] leading-relaxed text-foreground break-words whitespace-pre-wrap">
        <span
          v-if="isReply && comment.replyTo && comment.parentId !== comment.rootId"
          class="text-primary mr-1 cursor-pointer hover:underline"
        >
          回复 @{{ comment.replyTo.username }} :
        </span>
        <template v-for="part in parsedContent" :key="part.id">
          <span
            v-if="part.type === 'mention'"
            class="text-primary cursor-pointer hover:underline"
            @click.stop="handleMentionClick(part.userId)"
          >
            {{ part.text }}
          </span>
          <template v-else>
            {{ part.text }}
          </template>
        </template>
      </p>

      <!-- Pictures -->
      <div v-if="comment.pictures?.length" class="mt-2 flex flex-wrap gap-2">
        <div
          v-for="(pic, idx) in comment.pictures"
          :key="idx"
          class="h-24 w-24 overflow-hidden rounded-md border border-border cursor-pointer hover:opacity-90 transition-opacity"
          @click="openImagePreview(pic)"
        >
          <img :src="pic" class="h-full w-full object-cover" loading="lazy" />
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-2 flex items-center gap-4 text-[13px] text-muted-foreground/80">
        <span>{{ timeAgo }}</span>

        <button
          class="flex items-center gap-1 hover:text-primary transition-colors"
          :class="{ 'text-primary': isLiked }"
          @click="handleLike"
        >
          <ThumbsUp :size="14" :class="{ 'fill-current': isLiked }" />
          <span v-if="likeCount > 0">{{ likeCount }}</span>
        </button>

        <button
          class="flex items-center gap-1 hover:text-primary transition-colors"
          @click="showReplyInput = !showReplyInput"
        >
          回复
        </button>

        <div v-if="isSelf || isAuthor" ref="moreMenuRef" class="relative">
          <button
            class="hover:text-primary transition-colors ml-auto"
            @click="showMoreMenu = !showMoreMenu"
          >
            <MoreVertical :size="14" />
          </button>
          <div
            v-if="showMoreMenu"
            class="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border border-border bg-card p-1 shadow-lg"
          >
            <button
              v-if="isAuthor && !isReply"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-secondary"
              @click="handlePin"
            >
              <Pin :size="14" />
              {{ isPinned ? '取消置顶' : '置顶' }}
            </button>
            <button
              v-if="isSelf || isAuthor"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--status-danger-ink)] hover:bg-[var(--status-danger-soft)]"
              @click="handleDelete"
            >
              <Trash2 :size="14" />
              删除
            </button>
          </div>
        </div>
      </div>

      <!-- Reply Input -->
      <div v-if="showReplyInput" class="mt-3">
        <CommentInput
          :placeholder="`回复 @${comment.username} :`"
          auto-focus
          @submit="handleReplySubmit"
        />
      </div>

      <!-- Replies Section -->
      <div
        v-if="!isReply && (replies.length > 0 || repliesTotal > 0)"
        class="mt-3 rounded-md bg-secondary px-4 py-3"
      >
        <div v-if="replies.length > 0" class="space-y-1">
          <CommentItem
            v-for="reply in replies"
            :key="reply.id"
            :comment="reply"
            :video-id="videoId"
            :dynamic-id="dynamicId"
            :is-author="isAuthor"
            is-reply
            @deleted="handleReplyDeleted"
            @replied="
              () => {
                repliesPage = 1
                void loadReplies()
              }
            "
          />
        </div>

        <div v-if="repliesTotal > replies.length" class="mt-2 text-[13px] text-muted-foreground/80">
          共 {{ repliesTotal }} 条回复,
          <button
            class="text-primary hover:underline"
            @click="
              () => {
                if (replies.length === 0) {
                  repliesPage = 1
                } else {
                  repliesPage++
                }
                void loadReplies()
              }
            "
          >
            点击查看
          </button>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <ImageViewer v-model="showPreview" :src="previewImageUrl" />
  </div>
</template>
