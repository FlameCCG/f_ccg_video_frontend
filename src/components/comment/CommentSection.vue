<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getCommentList, createComment, type CommentItem as TCommentItem } from '@/api/comment'
import CommentInput from './CommentInput.vue'
import CommentItem from './CommentItem.vue'
import { toast } from 'vue-sonner'

const props = defineProps<{
  videoId: number
  authorId?: number
}>()

const comments = ref<TCommentItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const sortBy = ref<'time' | 'hot'>('hot')
const isLoading = ref(false)

const loadComments = async (reset = false) => {
  if (isLoading.value) return
  if (reset) {
    page.value = 1
    comments.value = []
  }

  isLoading.value = true
  try {
    const res = await getCommentList({
      videoId: props.videoId,
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
}

const handleSortChange = (sort: 'time' | 'hot') => {
  if (sortBy.value === sort) return
  sortBy.value = sort
  void loadComments(true)
}

const handleCreateComment = async (content: string, atUserIds: number[]) => {
  try {
    const res = await createComment({
      videoId: props.videoId,
      content,
      atUserIds,
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

watch(
  () => props.videoId,
  () => {
    if (props.videoId) {
      void loadComments(true)
    }
  }
)

onMounted(() => {
  if (props.videoId) {
    void loadComments(true)
  }
})
</script>

<template>
  <div class="mt-6">
    <!-- Header -->
    <div class="flex items-center gap-4 mb-6">
      <h3 class="text-xl font-semibold text-[#18191c]">评论</h3>
      <span class="text-[13px] text-[#9499a0]">{{ total }}</span>

      <div class="flex items-center gap-3 text-[13px] ml-2">
        <button
          class="transition-colors hover:text-[#00aeec]"
          :class="sortBy === 'hot' ? 'text-[#18191c] font-medium' : 'text-[#9499a0]'"
          @click="handleSortChange('hot')"
        >
          最热
        </button>
        <div class="h-3 w-[1px] bg-[#e3e5e7]"></div>
        <button
          class="transition-colors hover:text-[#00aeec]"
          :class="sortBy === 'time' ? 'text-[#18191c] font-medium' : 'text-[#9499a0]'"
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
            :is-author="authorId === comment.userId"
            @deleted="handleCommentDeleted"
            @pinned="handleCommentPinned"
          />
          <div v-if="index < comments.length - 1" class="h-[1px] w-full bg-[#e3e5e7] ml-14"></div>
        </div>
      </template>

      <div v-else-if="!isLoading" class="py-12 text-center text-[#9499a0]">
        还没有评论，快来抢沙发吧~
      </div>

      <!-- Load More -->
      <div v-if="comments.length < total" class="pt-4 text-center">
        <button
          class="text-[13px] text-[#9499a0] hover:text-[#00aeec] transition-colors"
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
