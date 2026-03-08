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
import { toast } from 'vue-sonner'
import {
  Eye,
  MessageSquare,
  Clock,
  Tag as TagIcon,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  Flag,
  Copyright,
} from 'lucide-vue-next'

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

const danmuMenu = ref<{ show: boolean; x: number; y: number; text: string }>({
  show: false,
  x: 0,
  y: 0,
  text: '',
})

const handleDanmuClick = (event: MouseEvent, text: string) => {
  danmuMenu.value = { show: true, x: event.clientX, y: event.clientY, text }
}

const closeDanmuMenu = () => {
  danmuMenu.value.show = false
}

const handleDanmuLike = () => {
  toast.info('弹幕点赞需要弹幕ID，当前暂不支持')
  closeDanmuMenu()
}

const handleDanmuReport = () => {
  toast.info('举报功能即将上线')
  closeDanmuMenu()
}

const handleDanmuLoadHistory = (
  danmuList: { text: string; time: number; color: string; mode: 0 | 1 | 2 }[]
) => {
  if (!playerRef.value?.artRef) return
  const plugin = playerRef.value.artRef.plugins?.artplayerPluginDanmuku as
    | { load: (data: unknown) => Promise<unknown> }
    | undefined
  if (plugin) {
    void plugin.load(
      danmuList.map((d) => ({ text: d.text, time: d.time, color: d.color, mode: d.mode }))
    )
  }
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
  <div class="mx-auto mt-4 mb-10 max-w-[1400px] px-4 sm:px-5 lg:px-6">
    <!-- Loading -->
    <div v-if="isLoading" class="flex min-h-[500px] items-center justify-center">
      <div
        class="h-10 w-10 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary"
      ></div>
    </div>

    <!-- Error -->
    <div
      v-else-if="error"
      class="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-destructive"
    >
      {{ error }}
    </div>

    <!-- Video Detail Content (Bilibili Layout) -->
    <div v-else-if="video">
      <!-- Title (above player, bilibili style) -->
      <h1 class="text-xl font-bold leading-snug text-foreground">
        {{ video.title }}
      </h1>

      <!-- Stats Row (below title, above player) -->
      <div
        class="mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground"
      >
        <span class="flex items-center gap-1">
          <Eye :size="14" />
          {{ formatCount(video.views) }}
        </span>
        <span class="text-muted-foreground/40">·</span>
        <span class="flex items-center gap-1">
          <MessageSquare :size="14" />
          {{ formatCount(video.danmuCount) }}弹幕
        </span>
        <span class="text-muted-foreground/40">·</span>
        <span class="flex items-center gap-1">
          <Clock :size="14" />
          {{ formatDate(video.createdAt) }}
        </span>
        <span v-if="video.isOriginal" class="flex items-center gap-1 text-muted-foreground/60">
          <span class="text-muted-foreground/40">·</span>
          <Copyright :size="12" />
          未经作者授权，禁止转载
        </span>
      </div>

      <!-- Two Column Layout -->
      <div class="flex gap-5">
        <!-- Left Column: Player + DanmuInput + Actions + Description -->
        <div class="min-w-0 flex-1">
          <!-- Video Player -->
          <VideoPlayer
            ref="playerRef"
            :part-id="currentPartId"
            class="overflow-hidden rounded-lg bg-black"
            @danmu-click="handleDanmuClick"
          />

          <!-- Danmu Input Bar (directly below player, bilibili style) -->
          <DanmuInput
            :video-id="video.id"
            :part-id="currentPartId"
            :current-time="currentPlayerTime"
            @sent="handleDanmuSent"
            @toggle-visible="handleDanmuToggleVisible"
            @load-history="handleDanmuLoadHistory"
          />

          <!-- Interaction Buttons (like bilibili: 点赞 投 收藏 分享) -->
          <div class="mt-3 border-b border-border/60 pb-3">
            <VideoActions />
          </div>

          <!-- Tags -->
          <div v-if="video.tags?.length" class="mt-3 flex flex-wrap items-center gap-1.5">
            <TagIcon :size="14" class="text-muted-foreground/50" />
            <span
              v-for="tag in video.tags"
              :key="tag.id"
              class="cursor-pointer rounded bg-[#f1f2f3] px-2 py-0.5 text-xs text-[#9499a0] transition-colors hover:bg-[#e3e5e7] hover:text-[#18191c]"
            >
              {{ tag.name }}
            </span>
          </div>

          <!-- Description -->
          <div v-if="video.description" class="mt-3 rounded-lg bg-[#f1f2f3] p-3">
            <p
              class="whitespace-pre-wrap text-[13px] leading-relaxed text-[#61666d]"
              :class="{ 'line-clamp-2': !descExpanded }"
            >
              {{ video.description }}
            </p>
            <button
              v-if="video.description.length > 80"
              class="mt-1 flex items-center gap-0.5 text-xs text-primary hover:underline"
              @click="descExpanded = !descExpanded"
            >
              {{ descExpanded ? '收起' : '展开' }}
              <component :is="descExpanded ? ChevronUp : ChevronDown" :size="14" />
            </button>
          </div>

          <!-- Partition Badge -->
          <div v-if="video.partition" class="mt-3">
            <span class="rounded bg-[#f1f2f3] px-2 py-1 text-xs text-[#9499a0]">
              {{ video.partition.name }}
            </span>
          </div>
        </div>

        <!-- Right Column: Author + PartList + Recommend -->
        <div class="hidden w-[350px] shrink-0 space-y-4 lg:block">
          <!-- Author Card (top of right column, bilibili style) -->
          <AuthorCard v-if="video.author" :author="video.author" />

          <!-- Part List -->
          <PartList
            v-if="video.parts && video.parts.length > 1"
            :parts="video.parts"
            :current-part-id="currentPartId"
            @select="handlePartSelect"
          />

          <!-- Recommendations -->
          <VideoRecommend :video-id="video.id" />
        </div>
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="flex min-h-[400px] items-center justify-center">
      <div class="text-center">
        <div class="text-5xl">🎬</div>
        <p class="mt-3 text-muted-foreground">视频不存在或已删除</p>
      </div>
    </div>

    <!-- Danmu Context Menu -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="danmuMenu.show" class="fixed inset-0 z-[9999]" @click="closeDanmuMenu">
          <div
            class="absolute min-w-[140px] rounded-lg border border-border bg-popover p-1 shadow-lg"
            :style="{
              left: danmuMenu.x + 'px',
              top: danmuMenu.y + 'px',
              transform: 'translate(-50%, 8px)',
            }"
            @click.stop
          >
            <p class="mb-1 truncate px-2 py-1 text-xs text-muted-foreground">
              {{ danmuMenu.text }}
            </p>
            <button
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              @click="handleDanmuLike"
            >
              <ThumbsUp :size="14" />
              <span>点赞弹幕</span>
            </button>
            <button
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
              @click="handleDanmuReport"
            >
              <Flag :size="14" />
              <span>举报弹幕</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
