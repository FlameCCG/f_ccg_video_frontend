<script setup lang="ts">
import { ref, computed } from 'vue'
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

const router = useRouter()

const props = defineProps<{
  comment: CommentItem
  videoId?: number
  dynamicId?: number
  isAuthor?: boolean
  isReply?: boolean
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

const handleReplySubmit = async (content: string, atUserIds: number[]) => {
  try {
    const { createComment } = await import('@/api/comment')
    const res = await createComment({
      videoId: props.videoId || undefined,
      dynamicId: props.dynamicId || undefined,
      content,
      parentId: props.comment.id,
      atUserIds,
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
  <div class="flex gap-4 py-4" :class="{ 'py-2': isReply }">
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
        <span class="text-[13px] font-medium text-[#61666d]">{{ comment.username }}</span>
        <span
          v-if="isPinned && !isReply"
          class="rounded border border-[#ff6699] px-1 text-[10px] text-[#ff6699]"
          >置顶</span
        >
      </div>

      <p class="mt-1.5 text-[15px] leading-relaxed text-[#18191c] break-words whitespace-pre-wrap">
        <span
          v-if="isReply && comment.replyTo && comment.parentId !== comment.rootId"
          class="text-[#00aeec] mr-1 cursor-pointer hover:underline"
        >
          回复 @{{ comment.replyTo.username }} :
        </span>
        <template v-for="part in parsedContent" :key="part.id">
          <span
            v-if="part.type === 'mention'"
            class="text-[#00aeec] cursor-pointer hover:underline"
            @click.stop="handleMentionClick(part.userId)"
          >
            {{ part.text }}
          </span>
          <template v-else>
            {{ part.text }}
          </template>
        </template>
      </p>

      <!-- Actions -->
      <div class="mt-2 flex items-center gap-4 text-[13px] text-[#9499a0]">
        <span>{{ timeAgo }}</span>

        <button
          class="flex items-center gap-1 hover:text-[#00aeec] transition-colors"
          :class="{ 'text-[#00aeec]': isLiked }"
          @click="handleLike"
        >
          <ThumbsUp :size="14" :class="{ 'fill-current': isLiked }" />
          <span v-if="likeCount > 0">{{ likeCount }}</span>
        </button>

        <button
          class="flex items-center gap-1 hover:text-[#00aeec] transition-colors"
          @click="showReplyInput = !showReplyInput"
        >
          回复
        </button>

        <div v-if="isSelf || isAuthor" ref="moreMenuRef" class="relative">
          <button
            class="hover:text-[#00aeec] transition-colors ml-auto"
            @click="showMoreMenu = !showMoreMenu"
          >
            <MoreVertical :size="14" />
          </button>
          <div
            v-if="showMoreMenu"
            class="absolute right-0 top-full z-50 mt-1 w-32 rounded-md border border-[#e3e5e7] bg-white p-1 shadow-lg"
          >
            <button
              v-if="isAuthor && !isReply"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[#f1f2f3]"
              @click="handlePin"
            >
              <Pin :size="14" />
              {{ isPinned ? '取消置顶' : '置顶' }}
            </button>
            <button
              v-if="isSelf || isAuthor"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-red-500 hover:bg-red-50"
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
        class="mt-3 rounded-md bg-[#f1f2f3] px-4 py-3"
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

        <div v-if="repliesTotal > replies.length" class="mt-2 text-[13px] text-[#9499a0]">
          共 {{ repliesTotal }} 条回复,
          <button
            class="text-[#00aeec] hover:underline"
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
  </div>
</template>
