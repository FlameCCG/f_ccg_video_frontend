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
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import { Loader2 } from 'lucide-vue-next'
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
      <h3 class="text-xl font-semibold tracking-cjk text-foreground">评论</h3>
      <span class="tabular text-sm-plus text-muted-foreground/80">{{ total }}</span>

      <div class="flex items-center gap-3 text-sm-plus ml-2">
        <button
          class="t-tint hover:text-primary"
          :class="sortBy === 'hot' ? 'text-foreground font-medium' : 'text-muted-foreground/80'"
          @click="handleSortChange('hot')"
        >
          最热
        </button>
        <div class="h-3 w-[1px] bg-accent"></div>
        <button
          class="t-tint hover:text-primary"
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
      <Transition name="cs-swap" mode="out-in">
        <!-- 首次加载：评论区原来会塌成 0 高度，页面下方内容先上跳再被推下去 -->
        <SkeletonGroup
          v-if="isLoading && comments.length === 0"
          key="skeleton"
          :count="3"
          class="space-y-7 py-2"
        >
          <div class="cs-sk-row flex gap-3">
            <div class="skeleton-shimmer h-10 w-10 shrink-0 rounded-full"></div>
            <div class="min-w-0 flex-1 space-y-2.5 pt-1">
              <div class="cs-sk-a skeleton-shimmer h-3.5 w-24 rounded"></div>
              <div class="cs-sk-b skeleton-shimmer h-4 w-full rounded"></div>
              <div class="cs-sk-c skeleton-shimmer h-4 w-4/5 rounded"></div>
              <div class="cs-sk-d skeleton-shimmer h-3 w-32 rounded"></div>
            </div>
          </div>
        </SkeletonGroup>

        <div v-else-if="comments.length > 0" key="list">
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
        </div>

        <EmptyState
          v-else
          key="empty"
          icon="comment"
          title="还没有人评论"
          description="说说你的看法，第一条评论往往最容易被看到"
        />
      </Transition>

      <!-- Load More -->
      <div v-if="comments.length > 0 && comments.length < total" class="pt-4 text-center">
        <button
          class="ui-button inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm-plus text-muted-foreground/80 hover:text-primary"
          :disabled="isLoading"
          @click="
            () => {
              page++
              void loadComments()
            }
          "
        >
          <Loader2 v-if="isLoading" class="h-3.5 w-3.5 animate-spin" />
          {{ isLoading ? '正在加载…' : '加载更多评论' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* 卡内二级错峰：--skeleton-phase 定义在行容器上，子块基于它偏移
   （同一元素上既读又写 --skeleton-index 是 CSS 循环，会静默失效）。 */
.cs-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.cs-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.25);
}

.cs-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.4);
}

.cs-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.55);
}

.cs-sk-d {
  --skeleton-index: calc(var(--skeleton-phase) + 0.7);
}

/* 骨架 → 评论列表交叉淡出 */
.cs-swap-leave-active {
  transition: opacity var(--duration-fast) linear;
}

.cs-swap-enter-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.cs-swap-enter-from,
.cs-swap-leave-to {
  opacity: 0;
}
</style>
