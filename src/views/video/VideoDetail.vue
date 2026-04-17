<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { likeDanmu, reportDanmu, type PlayerDanmuPayload } from '@/api/danmu'
import { useVideoStore } from '@/stores/video'
import { addVideoView } from '@/api/video'
import VideoPlayer from '@/components/player/VideoPlayer.vue'
import DanmuInput from '@/components/player/DanmuInput.vue'
import VideoActions from '@/components/video/VideoActions.vue'
import AuthorCard from '@/components/user/AuthorCard.vue'
import VideoRecommend from '@/components/video/VideoRecommend.vue'
import PartList from '@/components/video/PartList.vue'
import DanmuList from '@/components/player/DanmuList.vue'
import CommentSection from '@/components/comment/CommentSection.vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDanmuWebSocket } from '@/composables/useDanmuWebSocket'
import { toast } from 'vue-sonner'
import {
  Eye,
  MessageSquare,
  Clock,
  ThumbsUp,
  TriangleAlert,
  Copyright,
  Copy,
} from 'lucide-vue-next'

type DanmuHoverPayload = {
  el: HTMLElement
  text: string
  danmuId?: number
  likeCount: number
  isLiked: boolean
  createdAt?: string
  mode: 0 | 1 | 2
}

type DanmuHoverState = Omit<DanmuHoverPayload, 'el'> & {
  el: HTMLElement | null
  show: boolean
  x: number
  y: number
  targetEl: HTMLElement | null
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const videoStore = useVideoStore()
const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null)
const danmuListRef = ref<InstanceType<typeof DanmuList> | null>(null)
const REPORT_REASONS = ['垃圾广告', '剧透刷屏', '人身攻击', '违法违禁', '色情低俗', '其他']

const videoId = computed(() => {
  const id = route.params.id
  return id ? Number(id) : 0
})

const isLoading = computed(() => videoStore.isLoading)
const error = computed(() => videoStore.error)
const video = computed(() => videoStore.currentVideo)
const isPreviewMode = computed(() => Boolean(video.value && video.value.status !== 1))
const previewNotice = computed(() => {
  if (!video.value) return ''
  if (video.value.status === 2) {
    return '当前稿件为私密预览，仅作者可见。已跳过公开弹幕、评论、推荐和播放统计请求。'
  }
  if (video.value.status === 4) {
    return '当前稿件正在审核，仅作者可见。已跳过公开弹幕、评论、推荐和播放统计请求。'
  }
  return '当前稿件暂未公开，仅提供作者预览播放。'
})

const rawRoutePart = computed(() => {
  const routePart = route.params.p
  return Array.isArray(routePart) ? routePart[0] : routePart
})

const requestedPartNumber = computed(() => {
  const routePart = rawRoutePart.value
  if (!routePart) return undefined
  const parsed = Number(routePart)
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined
  return parsed
})

const videoParts = computed(() => video.value?.parts ?? [])
const hasMultiParts = computed(() => videoParts.value.length > 1)
const currentPart = computed(() => {
  const parts = videoParts.value
  if (!parts.length) return undefined

  const requested = requestedPartNumber.value
  if (requested !== undefined) {
    const matched = parts.find((part) => part.sortOrder + 1 === requested)
    if (matched) return matched
  }

  return parts[0]
})

const currentPartId = computed(() => {
  return currentPart.value?.id
})
const currentPartNumber = computed(() => {
  return currentPart.value ? currentPart.value.sortOrder + 1 : undefined
})
const playerInstanceKey = computed(() => `${videoId.value}-${currentPartId.value ?? 0}`)
const descExpanded = ref(false)
const currentPlayerTime = computed(() => videoStore.playerState.currentTime)
const recentLocalDanmuIds = new Set<number>()
const danmuSocketVideoId = computed(() => {
  if (!video.value?.id || isPreviewMode.value) return 0

  const hasParts = (video.value.parts?.length ?? 0) > 0
  if (hasParts && currentPartId.value === undefined) {
    return 0
  }

  return video.value.id
})

const rememberLocalDanmu = (danmuId?: number) => {
  if (danmuId === undefined) return
  recentLocalDanmuIds.add(danmuId)
  window.setTimeout(() => {
    recentLocalDanmuIds.delete(danmuId)
  }, 5000)
}

const getPlayerCurrentTime = () => {
  const playerTime = playerRef.value?.artRef?.currentTime
  if (typeof playerTime === 'number' && Number.isFinite(playerTime) && playerTime >= 0) {
    return playerTime
  }

  return currentPlayerTime.value
}

const { newDanmu } = useDanmuWebSocket(
  () => danmuSocketVideoId.value,
  () => currentPartId.value
)

watch(newDanmu, (danmu) => {
  if (danmu?.id !== undefined && recentLocalDanmuIds.has(danmu.id)) {
    recentLocalDanmuIds.delete(danmu.id)
    return
  }

  if (danmu && playerRef.value) {
    const payload: PlayerDanmuPayload = {
      id: danmu.id,
      text: danmu.content,
      time: danmu.timeOffset / 1000,
      color: danmu.color || '#ffffff',
      mode: (danmu.position ?? 0) as 0 | 1 | 2,
      likeCount: danmu.likeCount ?? 0,
      isLiked: danmu.isLiked ?? false,
      createdAt: danmu.createdAt,
    }
    playerRef.value.emitDanmu(payload)
    danmuListRef.value?.addDanmu(payload)
  }
})

const handleDanmuSent = (danmu: PlayerDanmuPayload) => {
  rememberLocalDanmu(danmu.id)
  playerRef.value?.emitDanmu({
    ...danmu,
    time: getPlayerCurrentTime(),
  })
  danmuListRef.value?.addDanmu(danmu)
}

const danmuTooltip = ref<DanmuHoverState>({
  el: null,
  show: false,
  x: 0,
  y: 0,
  text: '',
  likeCount: 0,
  isLiked: false,
  mode: 0,
  targetEl: null,
})

let hideTooltipTimer: ReturnType<typeof setTimeout> | null = null
const reportDialogOpen = ref(false)
const reportReason = ref(REPORT_REASONS[0]!)
const reportDetail = ref('')
const submittingReport = ref(false)
const reportingDanmu = ref<{ id: number; text: string } | null>(null)

const hideDanmuTooltip = () => {
  danmuTooltip.value = {
    el: null,
    show: false,
    x: 0,
    y: 0,
    text: '',
    danmuId: undefined,
    likeCount: 0,
    isLiked: false,
    createdAt: undefined,
    mode: 0,
    targetEl: null,
  }
}

const syncDanmuTooltipPosition = (e: MouseEvent, el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  // Pin tooltip just below the exact mouse cursor X but clamp to the element's width
  let hoverX = e.clientX
  if (hoverX < rect.left) hoverX = rect.left + 16
  if (hoverX > rect.right) hoverX = rect.right - 16

  danmuTooltip.value.x = hoverX
  danmuTooltip.value.y = rect.bottom
}

const handleDanmuHover = (payload: DanmuHoverPayload & { e?: MouseEvent }) => {
  if (hideTooltipTimer) {
    clearTimeout(hideTooltipTimer)
    hideTooltipTimer = null
  }

  if (payload.e) {
    syncDanmuTooltipPosition(payload.e, payload.el)
  } else {
    const rect = payload.el.getBoundingClientRect()
    danmuTooltip.value.x = rect.left + rect.width / 2
    danmuTooltip.value.y = rect.bottom
  }

  danmuTooltip.value = {
    el: payload.el,
    show: true,
    x: danmuTooltip.value.x,
    y: danmuTooltip.value.y,
    text: payload.text,
    danmuId: payload.danmuId,
    likeCount: payload.likeCount,
    isLiked: payload.isLiked,
    createdAt: payload.createdAt,
    mode: payload.mode,
    targetEl: payload.el,
  }
}

const handleDanmuLeave = () => {
  hideTooltipTimer = setTimeout(() => {
    playerRef.value?.releaseHeldDanmu('leave')
    hideDanmuTooltip()
  }, 250)
}

const handleTooltipEnter = () => {
  if (hideTooltipTimer) {
    clearTimeout(hideTooltipTimer)
    hideTooltipTimer = null
  }
}

const handleTooltipLeave = () => {
  playerRef.value?.releaseHeldDanmu('leave')
  hideDanmuTooltip()
}

const handleDanmuHoldEnd = () => {
  hideDanmuTooltip()
}

const handleDanmuLike = async () => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录后点赞弹幕')
    return
  }

  if (danmuTooltip.value.danmuId === undefined) {
    toast.warning('当前弹幕暂不支持点赞')
    return
  }

  try {
    const result = await likeDanmu(danmuTooltip.value.danmuId)
    danmuTooltip.value.likeCount = result.likeCount
    danmuTooltip.value.isLiked = result.isLiked
    playerRef.value?.updateDanmuMeta(danmuTooltip.value.danmuId, result)
    toast.success(result.isLiked ? '已点赞弹幕' : '已取消点赞')
  } catch {
    toast.error('弹幕点赞失败')
  }
}

const openDanmuReportDialog = () => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录后举报弹幕')
    return
  }

  if (danmuTooltip.value.danmuId === undefined) {
    toast.warning('当前弹幕暂不支持举报')
    return
  }

  reportReason.value = REPORT_REASONS[0]!
  reportDetail.value = ''
  reportingDanmu.value = {
    id: danmuTooltip.value.danmuId,
    text: danmuTooltip.value.text,
  }
  reportDialogOpen.value = true
}

const submitDanmuReport = async () => {
  if (!reportingDanmu.value || submittingReport.value) return

  submittingReport.value = true
  try {
    await reportDanmu({
      danmuId: reportingDanmu.value.id,
      reason: reportReason.value,
      detail: reportDetail.value.trim() || undefined,
    })
    reportDialogOpen.value = false
    reportingDanmu.value = null
    setTimeout(() => toast.success('举报已提交'), 300)
  } catch {
    setTimeout(() => toast.error('举报弹幕失败'), 300)
  } finally {
    submittingReport.value = false
  }
}

const handleReportKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' || e.isComposing || submittingReport.value) return

  const target = e.target as HTMLElement | null
  const isTextarea = target?.tagName === 'TEXTAREA'
  if (isTextarea && e.shiftKey) return

  e.preventDefault()
  void submitDanmuReport()
}

const handleDanmuCopy = async () => {
  try {
    await navigator.clipboard.writeText(danmuTooltip.value.text)
    toast.success('弹幕已复制')
  } catch {
    toast.error('复制失败')
  }
  playerRef.value?.releaseHeldDanmu('leave')
  hideDanmuTooltip()
}

const formatCount = (count: number): string => {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return count.toString()
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

let videoLoadRequestId = 0

const isLatestVideoLoad = (requestId: number, expectedVideoId: number) => {
  return requestId === videoLoadRequestId && video.value?.id === expectedVideoId
}

const syncPartRoute = async (replace = true) => {
  const currentVideo = video.value
  if (!currentVideo) return

  if (hasMultiParts.value) {
    const targetPart = String(currentPartNumber.value ?? 1)
    if (rawRoutePart.value === targetPart) return

    const navigationTarget = {
      name: 'video-detail',
      params: {
        id: String(currentVideo.id),
        p: targetPart,
      },
      query: route.query,
      hash: route.hash,
    }

    if (replace) {
      await router.replace(navigationTarget)
    } else {
      await router.push(navigationTarget)
    }
    return
  }

  if (rawRoutePart.value === undefined) return

  const navigationTarget = {
    name: 'video-detail',
    params: {
      id: String(currentVideo.id),
    },
    query: route.query,
    hash: route.hash,
  }

  if (replace) {
    await router.replace(navigationTarget)
  } else {
    await router.push(navigationTarget)
  }
}

const loadVideo = async (id: number) => {
  if (!id) return
  const requestId = ++videoLoadRequestId
  const ok = await videoStore.fetchVideoDetail(id)
  if (!ok || !isLatestVideoLoad(requestId, id)) return

  await syncPartRoute()
  if (!isLatestVideoLoad(requestId, id)) return

  if (video.value?.status === 1) {
    try {
      await addVideoView(id)
      if (isLatestVideoLoad(requestId, id)) {
        videoStore.updateStats({ views: (video.value?.views ?? 0) + 1 })
      }
    } catch {
      // Ignore view count errors
    }
  }

  if (!isLatestVideoLoad(requestId, id)) return

  if (authStore.isLoggedIn && video.value) {
    videoStore.updatePlayerState({
      currentTime: video.value.watchProgress ?? 0,
      duration: video.value.duration,
    })
    void videoStore.saveProgress()
  }
}

const startVideoLoad = (id: number) => {
  if (!id) return
  videoStore.clearVideo()
  descExpanded.value = false
  void loadVideo(id)
}

const handlePartSelect = (partId: number) => {
  const selectedPart = videoParts.value.find((part) => part.id === partId)
  if (!selectedPart || !video.value) return

  const targetPart = String(selectedPart.sortOrder + 1)
  if (rawRoutePart.value === targetPart) return

  void router.push({
    name: 'video-detail',
    params: {
      id: String(video.value.id),
      p: targetPart,
    },
    query: route.query,
    hash: route.hash,
  })
}

const handleSeek = (time: number) => {
  if (playerRef.value?.artRef) {
    playerRef.value.artRef.currentTime = time
    playerRef.value.artRef.play()
  }
}

const persistVideoHistoryWithoutPlayer = async () => {
  if (!authStore.isLoggedIn || !video.value) return
  await videoStore.saveProgress()
}

onMounted(() => {
  if (videoId.value) {
    startVideoLoad(videoId.value)
  }
})

watch(videoId, (id, previousId) => {
  if (previousId && previousId !== id) {
    void persistVideoHistoryWithoutPlayer()
  }
  if (id) {
    startVideoLoad(id)
  }
})

onBeforeRouteLeave(() => {
  void persistVideoHistoryWithoutPlayer()
})

watch(
  () => [video.value?.id, rawRoutePart.value] as const,
  ([currentVideoId]) => {
    if (!currentVideoId || !video.value) return
    void syncPartRoute()
  }
)

onBeforeUnmount(() => {
  videoLoadRequestId++
  videoStore.clearVideo()
  if (hideTooltipTimer) clearTimeout(hideTooltipTimer)
  document.removeEventListener('keydown', handleReportKeydown)
})
</script>

<template>
  <div class="mx-auto mt-4 pb-10 max-w-[1400px] px-4 sm:px-5 lg:px-6">
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
        class="mt-2 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground/80"
      >
        <span class="flex items-center gap-1">
          <Eye :size="14" />
          {{ formatCount(video.views) }}
        </span>
        <span class="text-muted-foreground/80/40">·</span>
        <span class="flex items-center gap-1">
          <MessageSquare :size="14" />
          {{ formatCount(video.danmuCount) }}弹幕
        </span>
        <span class="text-muted-foreground/80/40">·</span>
        <span class="flex items-center gap-1">
          <Clock :size="14" />
          {{ formatDate(video.createdAt) }}
        </span>
        <span v-if="video.isOriginal" class="flex items-center gap-1 text-muted-foreground/80/60">
          <span class="text-muted-foreground/80/40">·</span>
          <Copyright :size="12" />
          未经作者授权，禁止转载
        </span>
      </div>

      <div
        v-if="isPreviewMode"
        class="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-700 dark:text-amber-200"
      >
        <TriangleAlert :size="18" class="mt-0.5 shrink-0" />
        <p class="leading-6">
          {{ previewNotice }}
        </p>
      </div>

      <!-- Two Column Layout -->
      <div class="flex items-start gap-5">
        <!-- Left Column: Player + DanmuInput + Actions + Description -->
        <div class="min-w-0 flex-1">
          <!-- Video Player -->
          <VideoPlayer
            :key="playerInstanceKey"
            ref="playerRef"
            :part-id="currentPartId"
            :enable-danmu="!isPreviewMode"
            class="overflow-hidden rounded-lg bg-black"
            @danmu-hover="handleDanmuHover"
            @danmu-leave="handleDanmuLeave"
            @danmu-hold-end="handleDanmuHoldEnd"
          />

          <!-- Danmu Input Bar (directly below player, bilibili style) -->
          <DanmuInput
            v-if="!isPreviewMode"
            :key="playerInstanceKey"
            :video-id="video.id"
            :part-id="currentPartId"
            :current-time="currentPlayerTime"
            :get-current-time="getPlayerCurrentTime"
            @sent="handleDanmuSent"
          />

          <!-- Interaction Buttons (like bilibili: 点赞 投 收藏 分享) -->
          <div v-if="!isPreviewMode" class="mt-3 border-b border-border pb-3">
            <VideoActions />
          </div>

          <!-- Description & Tags -->
          <div class="mt-4 border-b border-border pb-4">
            <!-- Description -->
            <div v-if="video.description">
              <p
                class="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground"
                :class="{ 'line-clamp-3': !descExpanded }"
              >
                {{ video.description }}
              </p>
              <button
                v-if="video.description.length > 120"
                class="mt-1 flex items-center gap-0.5 text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer active-scale"
                @click="descExpanded = !descExpanded"
              >
                {{ descExpanded ? '收起' : '展开更多' }}
              </button>
            </div>

            <div v-if="video.tags?.length" class="mt-4 flex flex-wrap items-center gap-2">
              <span
                v-for="tag in video.tags"
                :key="tag.id"
                class="cursor-pointer active-scale rounded-full bg-secondary px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>

          <!-- Comment Section -->
          <CommentSection
            v-if="video.id && !isPreviewMode"
            :video-id="video.id"
            :author-id="video.author?.id"
          />
        </div>

        <!-- Right Column: Author + DanmuList + PartList + Recommend -->
        <div class="hidden w-[350px] shrink-0 space-y-4 lg:block">
          <!-- Author Card (top of right column, bilibili style) -->
          <AuthorCard v-if="video.author" :author="video.author" />

          <!-- Danmu List Panel (bilibili style) -->
          <DanmuList
            v-if="!isPreviewMode"
            :key="playerInstanceKey"
            ref="danmuListRef"
            :video-id="video.id"
            :part-id="currentPartId"
            @seek="handleSeek"
          />

          <!-- Part List -->
          <PartList
            v-if="video.parts && video.parts.length > 1"
            :parts="video.parts"
            :current-part-id="currentPartId"
            @select="handlePartSelect"
          />

          <!-- Recommendations -->
          <VideoRecommend v-if="!isPreviewMode" :video-id="video.id" />
        </div>
      </div>
    </div>

    <!-- Not Found -->
    <div v-else class="flex min-h-[400px] items-center justify-center">
      <div class="text-center">
        <div class="text-5xl">🎬</div>
        <p class="mt-3 text-muted-foreground/80">视频不存在或已删除</p>
      </div>
    </div>

    <!-- Danmu Hover Tooltip (bilibili style: floating icon bar above danmu) -->
    <Teleport to="body">
      <Transition name="danmu-tooltip">
        <div
          v-if="danmuTooltip.show"
          class="danmu-hover-card"
          :style="{
            left: danmuTooltip.x + 'px',
            top: danmuTooltip.y + 12 + 'px',
          }"
          @mouseenter="handleTooltipEnter"
          @mouseleave="handleTooltipLeave"
        >
          <div class="danmu-hover-actions">
            <button
              class="danmu-hover-btn"
              :class="{ 'is-active': danmuTooltip.isLiked }"
              title="点赞"
              @click="handleDanmuLike"
            >
              <ThumbsUp :size="16" />
              <span v-if="danmuTooltip.likeCount > 0" class="count">{{
                danmuTooltip.likeCount
              }}</span>
            </button>
            <div class="danmu-hover-divider"></div>
            <button class="danmu-hover-btn" title="复制" @click="handleDanmuCopy">
              <Copy :size="16" />
            </button>
            <button class="danmu-hover-btn is-danger" title="举报" @click="openDanmuReportDialog">
              <TriangleAlert :size="16" />
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Dialog :open="reportDialogOpen" @update:open="reportDialogOpen = $event">
      <DialogContent class="max-w-md gap-0 border-border bg-card p-0">
        <form @submit.prevent="submitDanmuReport" @keydown.capture="handleReportKeydown">
          <div class="border-b border-border/50 px-5 py-4">
            <DialogTitle class="text-base font-semibold text-foreground">举报弹幕</DialogTitle>
            <DialogDescription class="mt-1 break-all line-clamp-2 text-sm text-muted-foreground">
              {{ reportingDanmu?.text }}
            </DialogDescription>
          </div>

          <div class="space-y-4 px-5 py-4">
            <div>
              <p class="mb-2 text-sm font-medium text-foreground">举报原因</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="reason in REPORT_REASONS"
                  :key="reason"
                  type="button"
                  class="rounded-full border px-3 py-1 text-xs transition-colors"
                  :class="
                    reportReason === reason
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:border-muted-foreground hover:text-foreground'
                  "
                  @click="reportReason = reason"
                >
                  {{ reason }}
                </button>
              </div>
            </div>

            <div>
              <p class="mb-2 text-sm font-medium text-foreground">补充说明</p>
              <textarea
                v-model="reportDetail"
                rows="4"
                maxlength="200"
                class="w-full resize-none rounded-xl border border-border bg-muted px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:bg-card"
                placeholder="选填，补充举报说明"
              />
            </div>
          </div>

          <div class="flex items-center justify-end gap-3 border-t border-border/50 px-5 py-4">
            <button
              type="button"
              class="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
              @click="reportDialogOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="submittingReport"
            >
              {{ submittingReport ? '提交中...' : '提交举报' }}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
/* Danmu hover card */
.danmu-hover-card {
  position: fixed;
  z-index: 9999;
  padding: 4px 6px;
  border-radius: 999px; /* Pill shape */
  background: rgb(40 40 40 / 75%); /* transparent like Image 2 */
  backdrop-filter: blur(12px);
  border: 1px solid rgb(255 255 255 / 10%);
  transform: translateX(-50%);
  pointer-events: auto;
  box-shadow: 0 4px 12px rgb(0 0 0 / 20%);
}

/* Small triangle arrow pointing up */
.danmu-hover-card::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgb(40 40 40 / 75%);
}

/* Massive invisible bridge/padding around the entire card to completely eliminate twitching */
.danmu-hover-card::after {
  content: '';
  position: absolute;
  inset: -30px -40px 0;
  background: transparent;
  z-index: -1;
}

.danmu-hover-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.danmu-hover-divider {
  width: 1px;
  height: 16px;
  background: rgb(255 255 255 / 20%);
  margin: 0 2px;
}

.danmu-hover-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  min-width: 32px;
  padding: 0 8px;
  border-radius: 999px;
  color: rgb(255 255 255 / 80%);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  font-weight: 500;
}

.danmu-hover-btn:hover {
  color: var(--color-primary-foreground);
  background: rgb(255 255 255 / 15%);
}

.danmu-hover-btn.is-active {
  color: var(--color-primary); /* Active color */
}

.danmu-hover-btn.is-danger {
  color: rgb(255 255 255 / 80%);
}

.danmu-hover-btn.is-danger:hover {
  color: var(--color-accent);
  background: rgb(251 114 153 / 15%);
}

.danmu-hover-btn:active {
  transform: translateY(1px);
}

/* Tooltip animation */
.danmu-tooltip-enter-active,
.danmu-tooltip-leave-active {
  transition: opacity 0.15s ease;
}

.danmu-tooltip-enter-from,
.danmu-tooltip-leave-to {
  opacity: 0;
}
</style>
