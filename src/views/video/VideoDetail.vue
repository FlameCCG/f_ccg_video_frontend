<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useVideoStore } from '@/stores/video'
import { addVideoView } from '@/api/video'
import VideoPlayer from '@/components/player/VideoPlayer.vue'
import DanmuInput from '@/components/player/DanmuInput.vue'
import VideoActions from '@/components/video/VideoActions.vue'
import AuthorCard from '@/components/user/AuthorCard.vue'
import VideoRecommend from '@/components/video/VideoRecommend.vue'
import PartList from '@/components/video/PartList.vue'
import { useDanmuWebSocket } from '@/composables/useDanmuWebSocket'
import { Eye, MessageSquare, Clock, Tag as TagIcon, ChevronDown, ChevronUp } from 'lucide-vue-next'

const route = useRoute()
const videoStore = useVideoStore()
const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null)

const videoId = computed(() => {
  const id = route.params.id
  return id ? Number(id) : 0
})

const isLoading = computed(() => videoStore.isLoading)
const error = computed(() => videoStore.error)
const video = computed(() => videoStore.currentVideo)

const currentPartId = ref<number | undefined>(undefined)
const descExpanded = ref(false)
const currentPlayerTime = computed(() => videoStore.playerState.currentTime)

const { newDanmu } = useDanmuWebSocket(
  () => videoId.value,
  () => currentPartId.value
)

watch(newDanmu, (danmu) => {
  if (danmu && playerRef.value) {
    playerRef.value.emitDanmu({
      text: danmu.content,
      time: danmu.timeOffset / 1000,
      color: danmu.color || '#ffffff',
      mode: (danmu.position ?? 0) as 0 | 1 | 2,
    })
  }
})

const handleDanmuSent = (danmu: { text: string; time: number; color: string; mode: 0 | 1 | 2 }) => {
  playerRef.value?.emitDanmu(danmu)
}

const handleDanmuToggleVisible = (visible: boolean) => {
  playerRef.value?.setDanmuVisible(visible)
}

const formatCount = (count: number): string => {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return count.toString()
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const loadVideo = async (id: number) => {
  if (!id) return
  const ok = await videoStore.fetchVideoDetail(id)
  if (ok) {
    if (video.value?.parts && video.value.parts.length > 0) {
      currentPartId.value = video.value.parts[0]!.id
    }
    try {
      await addVideoView(id)
      videoStore.updateStats({ views: (video.value?.views ?? 0) + 1 })
    } catch {
      // Ignore view count errors
    }
  }
}

const handlePartSelect = (partId: number) => {
  currentPartId.value = partId
}

onMounted(() => {
  if (videoId.value) {
    void loadVideo(videoId.value)
  }
})

watch(videoId, (id) => {
  if (id) {
    videoStore.clearVideo()
    descExpanded.value = false
    currentPartId.value = undefined
    void loadVideo(id)
  }
})

onBeforeUnmount(() => {
  videoStore.clearVideo()
})
</script>

<template>
  <div class="page-enter mx-auto mt-6 mb-12 max-w-[1800px] px-4 sm:px-6 lg:px-8">
    <!-- Loading -->
    <div v-if="isLoading" class="flex min-h-[500px] items-center justify-center">
      <div
        class="h-12 w-12 animate-spin rounded-full border-4 border-primary/20 border-t-primary"
      ></div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center text-destructive shadow-sm"
    >
      {{ error }}
    </div>

    <!-- Video Detail Content -->
    <div v-else-if="video" class="flex gap-6 lg:gap-8">
      <!-- Left Column: Player + Info -->
      <div class="min-w-0 flex-1">
        <!-- Video Player -->
        <VideoPlayer ref="playerRef" :part-id="currentPartId" class="player-container" />

        <!-- Danmu Input -->
        <DanmuInput
          v-if="video"
          :video-id="video.id"
          :part-id="currentPartId"
          :current-time="currentPlayerTime"
          class="mt-2"
          @sent="handleDanmuSent"
          @toggle-visible="handleDanmuToggleVisible"
        />

        <!-- Video Info Section -->
        <div class="info-container mt-5 space-y-4 px-1">
          <!-- Title -->
          <h1 class="text-xl font-bold leading-tight text-foreground sm:text-2xl tracking-tight">
            {{ video.title }}
          </h1>

          <!-- Stats Row -->
          <div
            class="flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground/80 font-medium"
          >
            <span class="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Eye :size="15" stroke-width="2.5" />
              {{ formatCount(video.views) }}播放
            </span>
            <span class="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <MessageSquare :size="15" stroke-width="2.5" />
              {{ formatCount(video.danmuCount) }}弹幕
            </span>
            <span class="flex items-center gap-1.5 transition-colors hover:text-foreground">
              <Clock :size="15" stroke-width="2.5" />
              {{ formatDate(video.createdAt) }}
            </span>
            <span
              v-if="video.partition"
              class="flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-0.5 text-xs text-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            >
              {{ video.partition.name }}
            </span>
            <span
              v-if="video.isOriginal"
              class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/20"
            >
              原创
            </span>
          </div>

          <!-- Tags -->
          <div v-if="video.tags?.length" class="flex flex-wrap items-center gap-2 pt-1">
            <TagIcon :size="15" class="text-muted-foreground/60" stroke-width="2.5" />
            <span
              v-for="tag in video.tags"
              :key="tag.id"
              class="tag-item cursor-pointer rounded-full bg-muted/60 px-3 py-1 text-[13px] font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
            >
              {{ tag.name }}
            </span>
          </div>

          <!-- Interaction Buttons -->
          <div class="py-2">
            <VideoActions />
          </div>

          <!-- Author Card -->
          <AuthorCard v-if="video.author" :author="video.author" />

          <!-- Description -->
          <div v-if="video.description" class="desc-box rounded-xl bg-muted/30 p-4">
            <p
              class="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/80 transition-all duration-300"
              :class="{ 'line-clamp-3': !descExpanded }"
            >
              {{ video.description }}
            </p>
            <button
              v-if="video.description.length > 100"
              class="mt-2 flex items-center gap-1 text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
              @click="descExpanded = !descExpanded"
            >
              {{ descExpanded ? '收起' : '展开更多' }}
              <component
                :is="descExpanded ? ChevronUp : ChevronDown"
                :size="16"
                stroke-width="2.5"
                class="transition-transform duration-300"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column: Part List + Recommend -->
      <div class="right-column hidden w-[350px] shrink-0 space-y-6 lg:block xl:w-[400px]">
        <!-- Part List -->
        <PartList
          v-if="video.parts?.length > 1"
          :parts="video.parts"
          :current-part-id="currentPartId"
          @select="handlePartSelect"
        />

        <!-- Recommendations -->
        <VideoRecommend :video-id="video.id" />
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="flex min-h-[400px] items-center justify-center">
      <div class="text-center animate-in fade-in zoom-in duration-500">
        <div class="text-6xl drop-shadow-md">🎬</div>
        <p class="mt-4 text-lg font-medium text-muted-foreground">视频不存在或已删除</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-enter {
  animation: page-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.player-container {
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    0 16px 48px rgb(0 0 0 / 0.12),
    0 48px 96px -24px rgb(0 0 0 / 0.16);
  background: #000;
  transition: box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

:global(.dark) .player-container {
  box-shadow:
    0 16px 48px rgb(0 0 0 / 0.4),
    0 48px 96px -24px rgb(0 0 0 / 0.5);
}

.info-container {
  animation: page-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: 0.1s;
  opacity: 0;
}

.right-column {
  animation: page-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: 0.2s;
  opacity: 0;
}

.tag-item {
  will-change: transform;
}

.tag-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 161 214 / 0.15);
}

:global(.dark) .tag-item:hover {
  box-shadow: 0 4px 12px rgb(0 161 214 / 0.3);
}

.desc-box {
  border: 1px solid transparent;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.desc-box:hover {
  background: hsl(var(--muted) / 0.6);
  border-color: hsl(var(--border) / 0.6);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.04);
}

:global(.dark) .desc-box:hover {
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.2);
}
</style>
