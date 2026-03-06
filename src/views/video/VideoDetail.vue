<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useVideoStore } from '@/stores/video'
import { addVideoView } from '@/api/video'
import VideoPlayer from '@/components/player/VideoPlayer.vue'

const route = useRoute()
const videoStore = useVideoStore()

const videoId = computed(() => {
  const id = route.params.id
  return id ? Number(id) : 0
})

const isLoading = computed(() => videoStore.isLoading)
const error = computed(() => videoStore.error)
const video = computed(() => videoStore.currentVideo)

onMounted(async () => {
  if (videoId.value) {
    const ok = await videoStore.fetchVideoDetail(videoId.value)
    if (ok) {
      try {
        await addVideoView(videoId.value)
        videoStore.updateStats({ views: (video.value?.views ?? 0) + 1 })
      } catch {
        // Ignore view count errors
      }
    }
  }
})

watch(videoId, async (id) => {
  if (id) {
    videoStore.clearVideo()
    await videoStore.fetchVideoDetail(id)
    if (video.value) {
      try {
        await addVideoView(id)
        videoStore.updateStats({ views: (video.value?.views ?? 0) + 1 })
      } catch {
        // Ignore
      }
    }
  }
})

onBeforeUnmount(() => {
  videoStore.clearVideo()
})
</script>

<template>
  <div class="mx-auto max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8">
    <div v-if="isLoading" class="flex min-h-[400px] items-center justify-center">
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
      ></div>
    </div>

    <div v-else-if="error" class="rounded-lg bg-destructive/10 p-4 text-destructive">
      {{ error }}
    </div>

    <div v-else-if="video" class="space-y-4">
      <!-- Video Player -->
      <VideoPlayer />

      <!-- Video Info (minimal for Task 20, full UI in Task 23) -->
      <div class="rounded-lg bg-card p-4">
        <h1 class="text-xl font-semibold">{{ video.title }}</h1>
        <p v-if="video.description" class="mt-2 text-muted-foreground line-clamp-2">
          {{ video.description }}
        </p>
        <div class="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>播放 {{ video.views }}</span>
          <span>弹幕 {{ video.danmuCount }}</span>
          <span>点赞 {{ video.likes }}</span>
          <span>投币 {{ video.coinCount }}</span>
          <span>收藏 {{ video.favoriteCount }}</span>
        </div>
      </div>
    </div>

    <div v-else class="rounded-lg bg-muted p-8 text-center text-muted-foreground">
      视频不存在或已删除
    </div>
  </div>
</template>
