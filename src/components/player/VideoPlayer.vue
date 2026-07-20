<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, toRaw } from 'vue'
import Artplayer, { type Option, type Setting } from 'artplayer'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import {
  danmuMillisecondsToSeconds,
  getDanmuList,
  type DanmuItem,
  type PlayerDanmuPayload,
} from '@/api/danmu'
import type { VideoResourceItem } from '@/api/video'
import {
  isDashResource,
  isDashSupported,
  createMpdLoader,
  destroyDash,
  setupDashQualityMenu,
} from '@/utils/dash'
import type { ArtWithDash } from '@/utils/dash'
import { toast } from 'vue-sonner'

const props = withDefaults(
  defineProps<{
    partId?: number
    enableDanmu?: boolean
  }>(),
  {
    enableDanmu: true,
  }
)

const emit = defineEmits<{
  ready: [instance: Artplayer]
  danmuPlugin: [plugin: ReturnType<ReturnType<typeof artplayerPluginDanmuku>>]
  danmuHover: [
    payload: {
      el: HTMLElement
      e?: MouseEvent
      text: string
      danmuId?: number
      likeCount: number
      isLiked: boolean
      createdAt?: string
      mode: 0 | 1 | 2
    },
  ]
  danmuLeave: []
  danmuHoldEnd: []
}>()

const videoStore = useVideoStore()
const authStore = useAuthStore()

const containerRef = ref<HTMLDivElement | null>(null)
const artRef = ref<Artplayer | null>(null)

type DanmuPluginInstance = ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
type DanmuQueueState = 'wait' | 'ready' | 'emit' | 'stop'
type DanmuQueueItem = {
  time?: number
  $state: DanmuQueueState
}
type PreciseDanmuPluginInstance = DanmuPluginInstance & {
  states?: Partial<Record<DanmuQueueState, DanmuQueueItem[]>>
  __preciseTimeOffsetSchedulerInstalled?: boolean
}

const VOLUME_STORAGE_KEY = 'artplayer_volume'
const DEFAULT_DANMU_FONT_SIZE = 24
const DANMU_FONT_SIZE_MIN = 12
const DANMU_FONT_SIZE_MAX = 120
const DANMU_TIME_EPSILON_SECONDS = 0.001
const DANMU_MAX_CATCH_UP_SECONDS = 0.25

const resources = computed((): VideoResourceItem[] => {
  const video = videoStore.currentVideo
  if (!video) return []

  if (props.partId && video.parts?.length) {
    const part = video.parts.find((p) => p.id === props.partId)
    return part?.resources ?? video.resources ?? []
  }
  return video.resources ?? []
})

// 是否 VIP 用户。后端用户模型暂无 VIP 字段，这里作为单点开关：
// 一旦后端在用户信息上暴露 isVip/vip，即自动生效；当前默认按非 VIP 处理。
const isVipUser = computed<boolean>(() => {
  const user = authStore.user as
    | (NonNullable<typeof authStore.user> & { isVip?: boolean; vip?: boolean })
    | null
  return !!(user?.isVip ?? user?.vip ?? false)
})

// 该资源当前用户是否可播放（VIP 档仅 VIP 可见/可选）。
const canPlayResource = (resource: VideoResourceItem): boolean => !resource.isVip || isVipUser.value

// DASH 清单条目：用 format 判断，不依赖后端返回顺序。
const dashResource = computed(() => resources.value.find(isDashResource))

// 各清晰度直链 MP4（混合模式仍保留）：用于不支持 DASH 时兜底、下载、手动清晰度菜单。
const mp4Resources = computed(() => resources.value.filter((r) => !isDashResource(r)))

// 当前用户可见的 MP4 档（过滤掉不可选的 VIP 档）。
const playableMp4Resources = computed(() => mp4Resources.value.filter(canPlayResource))

const pickDefaultResource = (list: VideoResourceItem[]): VideoResourceItem | undefined => {
  if (!list.length) return undefined

  const preferredPatterns = [/720p/i, /1080p(?!.*高码率)/i, /480p/i, /360p/i]
  for (const pattern of preferredPatterns) {
    const matched = list.find((resource) => pattern.test(resource.resolution || ''))
    if (matched) return matched
  }

  const bitrateTarget = 2000
  const bitrateSorted = [...list]
    .filter((resource) => resource.bitrate > 0)
    .sort((left, right) => {
      return Math.abs(left.bitrate - bitrateTarget) - Math.abs(right.bitrate - bitrateTarget)
    })

  return bitrateSorted[0] ?? list[0]
}

// 取「最佳」MP4：用于 DASH 致命错误兜底（优先源视频，否则最高码率）。
const pickBestResource = (list: VideoResourceItem[]): VideoResourceItem | undefined => {
  if (!list.length) return undefined
  const source = list.find((resource) => resource.isSource)
  if (source) return source
  return [...list].sort((left, right) => (right.bitrate || 0) - (left.bitrate || 0))[0]
}

// MP4 模式默认清晰度（优先可播放档，全不可播放时退回原始 MP4 列表）。
const defaultMp4 = computed(
  () => pickDefaultResource(playableMp4Resources.value) ?? pickDefaultResource(mp4Resources.value)
)

// DASH 致命失败时的兜底直链（优先可播放档，确保用户真能播）。
const bestMp4 = computed(
  () => pickBestResource(playableMp4Resources.value) ?? pickBestResource(mp4Resources.value)
)

// 下载资源：优先源视频（一般最高画质 MP4），其次最高码率直链。
const downloadResource = computed(
  () => mp4Resources.value.find((r) => r.isSource) ?? pickBestResource(mp4Resources.value)
)

// MP4 模式的 Artplayer quality 菜单（不含 DASH，且尊重 VIP 可见性）。
const qualityList = computed(() => {
  const list = playableMp4Resources.value
  if (!list.length) return undefined
  const preferred = defaultMp4.value

  return list.map((r, i) => ({
    default: preferred ? r.id === preferred.id : i === 0,
    html: r.resolution || `清晰度${i + 1}`,
    url: r.fileUrl,
  }))
})

// 是否有可播放的媒体（DASH 清单 或 任一 MP4 直链）。
const hasPlayableMedia = computed(() => !!dashResource.value || mp4Resources.value.length > 0)

// ---- DASH / 选流运行时状态 ----
// 运行期是否禁用 DASH：致命错误后在「本视频内」降级到 MP4。
// 用普通变量而非 ref，避免参与响应式而触发额外重建级联。
let dashDisabled = false
// 跨「DASH→MP4 兜底重建」保留的续播位置。
let pendingSeekTime: number | null = null
// DASH 手动码率菜单的清理函数。
let cleanupDashMenu: (() => void) | null = null

// 本次加载是否走 DASH：有 DASH 清单 + 浏览器支持 + 未被运行期禁用。
const shouldUseDash = (): boolean => !!dashResource.value && isDashSupported() && !dashDisabled

// DASH 致命失败兜底：切到最佳 MP4 直链并重建实例，保留播放进度。
const handleDashFatal = (art: ArtWithDash): void => {
  if (!bestMp4.value) {
    art.notice.show = 'DASH 播放失败，且没有可用的 MP4 备用源'
    return
  }
  pendingSeekTime = getCurrentTime(art)
  dashDisabled = true
  toast.warning('DASH 自适应播放异常，已切换为 MP4 兜底')
  // 脱离 dash.js 的错误回调栈后再拆/重建，避免重入。
  window.setTimeout(() => {
    destroyPlayer()
    if (hasPlayableMedia.value) initPlayer()
  }, 0)
}

let progressSaveTimer: ReturnType<typeof setTimeout> | null = null
const PROGRESS_SAVE_INTERVAL = 15000

let qualitySwitchTime = 0
let qualitySwitchTimer: ReturnType<typeof setTimeout> | null = null
const isSwitchingQuality = ref(false)
const switchingQualityLabel = ref('')

const danmuVisible = ref(true)
const danmuOpacity = ref(1)
const danmuFontSize = ref(DEFAULT_DANMU_FONT_SIZE)
let cleanupDanmuFontSizeLiveControl: (() => void) | null = null

// ---- Danmu metadata store (id -> extra info) ----
interface DanmuMeta {
  id?: number
  likeCount: number
  isLiked: boolean
  createdAt?: string
  mode: 0 | 1 | 2
  originalSpeed?: number
  originalTargetX?: number
}
const danmuMetaMap = new Map<HTMLElement, DanmuMeta>()
const danmuIdToEl = new Map<number, HTMLElement>()

// ---- Per-item hover hold state ----
interface HeldDanmu {
  el: HTMLElement
  originalEl: HTMLElement
  mode: 0 | 1 | 2
  targetTranslateX: number
  speedPxPerSec: number
}
let heldDanmu: HeldDanmu | null = null

// Keep a map of danmu id -> metadata for items loaded in batch
const loadedDanmuMeta = new Map<number, DanmuMeta>()

// ---- Segmented Danmu loading ----
const segmentSize = 60000 // 60 seconds
const loadedSegments = new Set<number>()
const loadingSegments = new Set<number>()
const danmuPoolMap = new Map<number, DanmuItem>()
const toastShownSegments = new Set<number>()

const clearDanmuState = () => {
  loadedSegments.clear()
  loadingSegments.clear()
  danmuPoolMap.clear()
  loadedDanmuMeta.clear()
  toastShownSegments.clear()
}

const getDanmuPlugin = (art: Artplayer | null | undefined = artRef.value) => {
  if (!art) return undefined

  return toRaw(art).plugins?.artplayerPluginDanmuku as DanmuPluginInstance | undefined
}

const loadSegment = async (idx: number): Promise<void> => {
  if (loadedSegments.has(idx) || loadingSegments.has(idx)) return
  const vid = videoStore.currentVideo?.id
  if (!vid) return

  loadingSegments.add(idx)
  try {
    const start = idx * segmentSize
    const end = start + segmentSize
    const params: {
      videoId: number
      partId?: number
      start: number
      end: number
      pageSize: number
    } = {
      videoId: vid,
      start,
      end,
      pageSize: 3000,
    }
    if (props.partId) {
      params.partId = props.partId
    }
    const result = await getDanmuList(params)
    const list = result.list ?? []

    if (result.truncated && !toastShownSegments.has(idx)) {
      toastShownSegments.add(idx)
      toast.warning('当前时间段弹幕过多，已自动省略部分弹幕')
    }

    list.forEach((d: DanmuItem) => {
      if (!danmuPoolMap.has(d.id)) {
        danmuPoolMap.set(d.id, d)
        loadedDanmuMeta.set(d.id, {
          id: d.id,
          likeCount: d.likeCount ?? 0,
          isLiked: d.isLiked ?? false,
          createdAt: d.createdAt,
          mode: (d.position ?? 0) as 0 | 1 | 2,
        })
      }
    })

    loadedSegments.add(idx)

    // Convert pool to player format and load to plugin
    const formattedList = Array.from(danmuPoolMap.values())
      .map((d: DanmuItem) => ({
        id: String(d.id),
        text: d.content,
        time: danmuMillisecondsToSeconds(
          d.timeOffset !== undefined
            ? d.timeOffset
            : ((d as unknown as Record<string, unknown>).time_offset as number | undefined)
        ),
        color: d.color || '#ffffff',
        mode: (d.position ?? 0) as 0 | 1 | 2,
      }))
      .sort((a, b) => a.time - b.time)

    const plugin = getDanmuPlugin()
    if (plugin) {
      const queue = (plugin as unknown as { queue?: Array<{ id?: string }> }).queue || []
      const existingIds = new Set(queue.map((item) => item.id))
      const newItems = formattedList.filter((item) => !existingIds.has(item.id))
      if (newItems.length > 0) {
        await plugin.load(newItems)
      }
    }
  } catch (error) {
    console.error(`[Danmu Segment] Failed to load segment index ${idx}:`, error)
  } finally {
    loadingSegments.delete(idx)
  }
}

const ensureSegmentsLoaded = async (currentTimeMs: number): Promise<void> => {
  const segmentIndex = Math.floor(currentTimeMs / segmentSize)
  const currentStart = segmentIndex * segmentSize
  const currentEnd = currentStart + segmentSize
  const timeToNextSegment = currentEnd - currentTimeMs

  const segmentsToLoad: number[] = []

  if (!loadedSegments.has(segmentIndex)) {
    segmentsToLoad.push(segmentIndex)
  }

  const nextSegmentIndex = segmentIndex + 1
  if (timeToNextSegment <= 10000) {
    if (!loadedSegments.has(nextSegmentIndex)) {
      segmentsToLoad.push(nextSegmentIndex)
    }
  }

  if (segmentsToLoad.length > 0) {
    await Promise.all(segmentsToLoad.map((idx) => loadSegment(idx)))
  }
}

const normalizePlayerTime = (time: unknown): number | undefined => {
  return typeof time === 'number' && Number.isFinite(time) && time >= 0 ? time : undefined
}

const getCurrentTime = (art: Artplayer | null | undefined = artRef.value): number => {
  const rawArt = art ? toRaw(art) : null
  return (
    normalizePlayerTime(rawArt?.video?.currentTime) ??
    normalizePlayerTime(rawArt?.currentTime) ??
    normalizePlayerTime(videoStore.playerState.currentTime) ??
    0
  )
}

const getDuration = (art: Artplayer): number => {
  const rawArt = toRaw(art)
  return (
    normalizePlayerTime(rawArt.video?.duration) ??
    normalizePlayerTime(rawArt.duration) ??
    normalizePlayerTime(videoStore.playerState.duration) ??
    0
  )
}

let preciseDanmuReadyCursor = 0

const resetPreciseDanmuReadyCursor = (time = getCurrentTime()) => {
  preciseDanmuReadyCursor = Math.max(0, time - DANMU_TIME_EPSILON_SECONDS)
}

const getDanmuQueueTime = (danmu: DanmuQueueItem): number => {
  return normalizePlayerTime(danmu.time) ?? 0
}

const installPreciseDanmuScheduler = (plugin: DanmuPluginInstance, art: Artplayer) => {
  const precisePlugin = plugin as PreciseDanmuPluginInstance
  if (precisePlugin.__preciseTimeOffsetSchedulerInstalled) return

  const originalReadysDescriptor = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(precisePlugin),
    'readys'
  )

  resetPreciseDanmuReadyCursor(getCurrentTime(art))

  Object.defineProperty(precisePlugin, 'readys', {
    configurable: true,
    get() {
      const states = precisePlugin.states
      if (!states) {
        return originalReadysDescriptor?.get?.call(precisePlugin) ?? []
      }

      const currentTime = getCurrentTime(art)
      const currentCursor = preciseDanmuReadyCursor
      const jumped =
        currentTime + DANMU_TIME_EPSILON_SECONDS < currentCursor ||
        currentTime - currentCursor > DANMU_MAX_CATCH_UP_SECONDS
      const lowerBound = jumped
        ? Math.max(0, currentTime - DANMU_TIME_EPSILON_SECONDS)
        : currentCursor - DANMU_TIME_EPSILON_SECONDS
      const upperBound = currentTime + DANMU_TIME_EPSILON_SECONDS

      preciseDanmuReadyCursor = Math.max(currentCursor, currentTime)

      const readys = [...(states.ready ?? [])]
      ;(states.wait ?? []).forEach((danmu) => {
        const time = getDanmuQueueTime(danmu)
        if (time >= lowerBound && time <= upperBound) {
          readys.push(danmu)
        }
      })

      return readys.sort((left, right) => getDanmuQueueTime(left) - getDanmuQueueTime(right))
    },
  })

  precisePlugin.__preciseTimeOffsetSchedulerInstalled = true
}

const syncPlayerState = (art: Artplayer, playing = art.playing) => {
  videoStore.updatePlayerState({
    currentTime: getCurrentTime(art),
    duration: getDuration(art),
    playing,
  })
}

const loadDanmuList = async (): Promise<
  { id?: string; text: string; time: number; color: string; mode: 0 | 1 | 2 }[]
> => {
  if (!props.enableDanmu) return []
  const vid = videoStore.currentVideo?.id
  if (!vid) return []
  const hasParts = (videoStore.currentVideo?.parts?.length ?? 0) > 0
  if (hasParts && !props.partId) return []
  try {
    clearDanmuState()

    const watchProgress = videoStore.watchProgress || 0
    const initialTimeMs = watchProgress * 1000
    resetPreciseDanmuReadyCursor(watchProgress)

    await ensureSegmentsLoaded(initialTimeMs)

    return Array.from(danmuPoolMap.values())
      .map((d: DanmuItem) => ({
        id: String(d.id),
        text: d.content,
        time: danmuMillisecondsToSeconds(
          d.timeOffset !== undefined
            ? d.timeOffset
            : ((d as unknown as Record<string, unknown>).time_offset as number | undefined)
        ),
        color: d.color || '#ffffff',
        mode: (d.position ?? 0) as 0 | 1 | 2,
      }))
      .sort((a, b) => a.time - b.time)
  } catch {
    return []
  }
}

const emitDanmu = (danmu: PlayerDanmuPayload) => {
  if (!artRef.value) return
  const plugin = getDanmuPlugin()
  if (plugin) {
    const emitted = {
      text: danmu.text,
      time: danmu.time,
      color: danmu.color,
      mode: danmu.mode ?? 0,
      border: !!danmu.isSelf,
      style: danmu.isSelf ? { backgroundColor: 'transparent' } : undefined,
      id: danmu.id != null ? String(danmu.id) : undefined,
    }
    plugin.emit(emitted)

    if (danmu.id != null) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const container = containerRef.value
          if (!container) return
          const items = container.querySelectorAll<HTMLElement>(
            `.art-danmuku [data-id="${danmu.id}"]`
          )
          items.forEach((el) => {
            if (!danmuMetaMap.has(el)) {
              danmuMetaMap.set(el, {
                id: danmu.id,
                likeCount: danmu.likeCount ?? 0,
                isLiked: danmu.isLiked ?? false,
                createdAt: danmu.createdAt,
                mode: danmu.mode ?? 0,
              })
              if (danmu.id != null) danmuIdToEl.set(danmu.id, el)
            }
          })
        })
      })
    }
  }
}

const resetVisibleDanmu = () => {
  const plugin = getDanmuPlugin()
  if (!plugin) return

  heldDanmu = null
  currentHoverEl = null
  emit('danmuHoldEnd')

  activeClones.forEach((clone) => {
    clearCloneRemovalTimer(clone.el)
    if (clone.el.isConnected) clone.el.remove()
  })
  activeClones.clear()
  cloneRemovalTimers.clear()

  danmuMetaMap.clear()
  danmuIdToEl.clear()
  resetPreciseDanmuReadyCursor()
  plugin.reset()
}

const setDanmuVisible = (visible: boolean) => {
  danmuVisible.value = visible
  if (!artRef.value) return
  const plugin = getDanmuPlugin()
  if (plugin) {
    if (visible) plugin.show()
    else plugin.hide()
  }
}

const setDanmuOpacity = (opacity: number) => {
  const normalizedOpacity = Math.min(1, Math.max(0, opacity))
  danmuOpacity.value = normalizedOpacity
  applyVisibleDanmuOpacity(normalizedOpacity)
  if (!artRef.value) return
  const plugin = getDanmuPlugin()
  if (plugin) {
    plugin.config({ ...plugin.option, opacity: normalizedOpacity })
  }
}

const normalizeDanmuFontSize = (fontSize: unknown): number => {
  if (typeof fontSize === 'number' && Number.isFinite(fontSize)) {
    return Math.round(Math.min(DANMU_FONT_SIZE_MAX, Math.max(DANMU_FONT_SIZE_MIN, fontSize)))
  }

  if (typeof fontSize === 'string' && fontSize.endsWith('%')) {
    const ratio = Number.parseFloat(fontSize) / 100
    if (Number.isFinite(ratio)) {
      const height = containerRef.value?.clientHeight ?? 0
      return normalizeDanmuFontSize(height * ratio)
    }
  }

  return DEFAULT_DANMU_FONT_SIZE
}

const applyVisibleDanmuOpacity = (opacity: number) => {
  const container = containerRef.value
  if (!container) return

  container.querySelectorAll<HTMLElement>('.art-danmuku > *').forEach((el) => {
    const isHiddenOriginal = el.style.opacity === '0' && el.style.pointerEvents === 'none'
    const isActiveDanmu =
      el.dataset.isDanmuClone === 'true' ||
      el.dataset.state === 'emit' ||
      el.dataset.state === 'stop'

    if (isHiddenOriginal || !isActiveDanmu) return
    el.style.opacity = String(opacity)
  })
}

const applyVisibleDanmuFontSize = (fontSize: number) => {
  const container = containerRef.value
  if (!container) return

  container.querySelectorAll<HTMLElement>('.art-danmuku > *').forEach((el) => {
    const isHiddenOriginal = el.style.opacity === '0' && el.style.pointerEvents === 'none'
    const isActiveDanmu =
      el.dataset.isDanmuClone === 'true' ||
      el.dataset.state === 'emit' ||
      el.dataset.state === 'stop'

    if (isHiddenOriginal || !isActiveDanmu) return

    el.style.fontSize = `${fontSize}px`

    if (el.dataset.mode === '1' || el.dataset.mode === '2') {
      el.style.marginLeft = `-${el.clientWidth / 2}px`
    }
  })
}

const updateDanmuFontSizeSlider = (fontSize: number) => {
  const container = containerRef.value
  if (!container) return

  const slider = container.querySelector<HTMLElement>('.apd-config-fontSize .apd-slider')
  const value = container.querySelector<HTMLElement>('.apd-config-fontSize .apd-value')
  if (!slider || !value) return

  const percentage =
    ((fontSize - DANMU_FONT_SIZE_MIN) / (DANMU_FONT_SIZE_MAX - DANMU_FONT_SIZE_MIN)) * 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage))
  const dot = slider.querySelector<HTMLElement>('.apd-slider-dot')
  const progress = slider.querySelector<HTMLElement>('.apd-slider-progress')

  value.textContent = `${fontSize}px`
  if (dot) dot.style.left = `${clampedPercentage}%`
  if (progress) progress.style.width = `${clampedPercentage}%`
}

const setDanmuFontSize = (fontSize: unknown) => {
  const normalizedFontSize = normalizeDanmuFontSize(fontSize)
  danmuFontSize.value = normalizedFontSize

  const plugin = getDanmuPlugin()
  if (plugin) {
    plugin.option.fontSize = normalizedFontSize
  }

  updateDanmuFontSizeSlider(normalizedFontSize)
  applyVisibleDanmuFontSize(normalizedFontSize)
}

const stopDanmuFontSizeEvent = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

const setupDanmuFontSizeLiveControl = (plugin: DanmuPluginInstance) => {
  let disposed = false
  let dragging = false
  let rafId: number | null = null
  const cleanups: Array<() => void> = []

  const addDisposableListener = (
    target: EventTarget,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ) => {
    target.addEventListener(type, listener, options)
    cleanups.push(() => target.removeEventListener(type, listener, options))
  }

  const attach = () => {
    if (disposed) return

    const container = containerRef.value
    const slider = container?.querySelector<HTMLElement>('.apd-config-fontSize .apd-slider')
    if (!container || !slider) {
      rafId = window.requestAnimationFrame(attach)
      return
    }

    const getFontSizeFromEvent = (event: PointerEvent | MouseEvent) => {
      const rect = slider.getBoundingClientRect()
      const rawRatio = toRaw(artRef.value)?.isRotate
        ? (event.clientY - rect.top) / rect.height
        : (event.clientX - rect.left) / rect.width
      const ratio = Math.min(1, Math.max(0, rawRatio))
      return Math.round(ratio * (DANMU_FONT_SIZE_MAX - DANMU_FONT_SIZE_MIN) + DANMU_FONT_SIZE_MIN)
    }

    const commitFromEvent = (event: PointerEvent | MouseEvent) => {
      setDanmuFontSize(getFontSizeFromEvent(event))
    }

    const handleClick: EventListener = (event) => {
      stopDanmuFontSizeEvent(event)
      commitFromEvent(event as MouseEvent)
    }

    const handlePointerDown: EventListener = (event) => {
      const pointerEvent = event as PointerEvent
      if (pointerEvent.button !== 0) return
      stopDanmuFontSizeEvent(event)
      dragging = true
      commitFromEvent(pointerEvent)
    }

    const handlePointerMove: EventListener = (event) => {
      if (!dragging) return
      stopDanmuFontSizeEvent(event)
      commitFromEvent(event as PointerEvent)
    }

    const handlePointerUp: EventListener = (event) => {
      if (!dragging) return
      stopDanmuFontSizeEvent(event)
      dragging = false
      commitFromEvent(event as PointerEvent)
    }

    addDisposableListener(slider, 'click', handleClick, { capture: true })
    addDisposableListener(slider, 'pointerdown', handlePointerDown, { capture: true })
    addDisposableListener(document, 'pointermove', handlePointerMove, { capture: true })
    addDisposableListener(document, 'pointerup', handlePointerUp, { capture: true })

    setDanmuFontSize(plugin.option.fontSize)
  }

  rafId = window.requestAnimationFrame(attach)

  return () => {
    disposed = true
    dragging = false
    if (rafId != null) {
      window.cancelAnimationFrame(rafId)
    }
    cleanups.forEach((cleanup) => cleanup())
    cleanups.length = 0
  }
}

const syncDanmuConfig = (option: unknown) => {
  if (!option || typeof option !== 'object') return

  const danmuOption = option as { opacity?: unknown; fontSize?: unknown }
  const opacity = danmuOption.opacity
  if (typeof opacity === 'number' && Number.isFinite(opacity)) {
    const normalizedOpacity = Math.min(1, Math.max(0, opacity))
    danmuOpacity.value = normalizedOpacity
    applyVisibleDanmuOpacity(normalizedOpacity)
  }

  if (danmuOption.fontSize !== undefined) {
    const normalizedFontSize = normalizeDanmuFontSize(danmuOption.fontSize)
    danmuFontSize.value = normalizedFontSize
    updateDanmuFontSizeSlider(normalizedFontSize)
    applyVisibleDanmuFontSize(normalizedFontSize)
  }
}

// ---- Hold / Release a single danmu ----

const activeClones = new Set<HeldDanmu>()

// 每个 clone 的"兜底回收"定时器：transitionend 在过渡被打断（transitioncancel）
// 或位移为 0 时不会触发，靠定时器确保 clone 一定会被回收，不会永久残留。
const cloneRemovalTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()

const clearCloneRemovalTimer = (el: HTMLElement) => {
  const timer = cloneRemovalTimers.get(el)
  if (timer !== undefined) {
    clearTimeout(timer)
    cloneRemovalTimers.delete(el)
  }
}

// 读取播放器真实播放状态。videoStore.playerState.playing 由 timeupdate/play/pause
// 事件异步同步，存在滞后；缓冲或 seek 抖动时可能短暂为 false，导致松开 hover 后
// clone 不恢复飘动而永久卡住。直接读 artplayer 的同步状态可避免该问题。
const isPlayerPlaying = (): boolean => {
  const raw = artRef.value ? toRaw(artRef.value) : null
  const rawPlaying = (raw as { playing?: unknown } | null)?.playing
  if (typeof rawPlaying === 'boolean') return rawPlaying
  return videoStore.playerState.playing
}

watch(
  () => videoStore.playerState.playing,
  (isPlaying) => {
    activeClones.forEach((clone) => {
      // Don't modify the currently hovered danmaku
      if (heldDanmu && heldDanmu.el === clone.el) return

      if (isPlaying) {
        resumeCloneAnimation(clone)
      } else {
        // 暂停时冻结 clone，并清掉兜底回收定时器，避免暂停期间被误删。
        clearCloneRemovalTimer(clone.el)
        if (clone.mode === 0) {
          const currentX = getCurrentTranslateX(clone.el)
          clone.el.style.transform = `translateX(${currentX}px)`
          clone.el.style.transition = 'transform 0s linear 0s'
        }
      }
    })
  }
)

const removeClone = (clone: HeldDanmu) => {
  clearCloneRemovalTimer(clone.el)
  if (clone.el.isConnected) clone.el.remove()
  activeClones.delete(clone)
}

const resumeCloneAnimation = (clone: HeldDanmu) => {
  if (!clone.el.isConnected) {
    return removeClone(clone)
  }

  clearCloneRemovalTimer(clone.el)

  if (clone.mode === 0 && clone.speedPxPerSec > 0) {
    const currentX = getCurrentTranslateX(clone.el)
    const remainingDistance = Math.abs(clone.targetTranslateX - currentX)
    const remainingTime = Math.max(remainingDistance / clone.speedPxPerSec, 0.1)

    clone.el.style.transform = `translateX(${clone.targetTranslateX}px)`
    clone.el.style.transition = `transform ${remainingTime}s linear 0s`

    // transitionend 在过渡被打断（transitioncancel）或剩余位移为 0（无过渡）时不会触发，
    // 仅靠它回收会让 clone 永久残留。用一个略超过预期时长的定时器兜底回收。
    clone.el.addEventListener('transitionend', () => removeClone(clone), { once: true })
    const fallbackTimer = setTimeout(() => removeClone(clone), remainingTime * 1000 + 200)
    cloneRemovalTimers.set(clone.el, fallbackTimer)
  } else {
    clone.el.style.opacity = '0'
    clone.el.style.transition = 'opacity 0.5s ease'
    const fallbackTimer = setTimeout(() => removeClone(clone), 500)
    cloneRemovalTimers.set(clone.el, fallbackTimer)
  }
}

const getCurrentTranslateX = (el: HTMLElement): number => {
  const style = getComputedStyle(el)
  const matrix = new DOMMatrix(style.transform)
  return matrix.m41
}

const holdDanmuItem = (el: HTMLElement, mode: 0 | 1 | 2) => {
  if (heldDanmu && (heldDanmu.originalEl === el || heldDanmu.el === el)) return
  if (heldDanmu) releaseHeldDanmuItem('leave')

  const isAlreadyClone = el.dataset.isDanmuClone === 'true'
  const originalEl = isAlreadyClone && heldDanmu ? heldDanmu.originalEl : el

  const currentX = getCurrentTranslateX(el)
  const meta = danmuMetaMap.get(el)

  let speedPxPerSec = meta?.originalSpeed
  let targetX = meta?.originalTargetX

  if (speedPxPerSec === undefined || targetX === undefined) {
    const targetMatch = el.style.transform.match(/translateX\(([-\d.]+)px\)/)
    targetX = targetMatch ? parseFloat(targetMatch[1]!) : currentX
    const transMatch = el.style.transition.match(/transform\s+([\d.]+)s/)
    const totalDuration = transMatch ? parseFloat(transMatch[1]!) : 5

    const totalTravelDistance = Math.abs(targetX)
    speedPxPerSec = totalDuration > 0 ? totalTravelDistance / totalDuration : 200

    if (meta) {
      meta.originalSpeed = speedPxPerSec
      meta.originalTargetX = targetX
    }
  }

  let clone: HTMLElement
  if (isAlreadyClone) {
    clone = el
    // 再次 hover 同一 clone：取消其恢复飘动时登记的兜底回收定时器，
    // 否则旧定时器会在 hover 期间把正在查看的 clone 删掉。
    clearCloneRemovalTimer(clone)
    clone.style.transform = `translateX(${currentX}px)`
    clone.style.transition = 'transform 0s linear 0s'
  } else {
    clone = el.cloneNode(true) as HTMLElement
    clone.dataset.isDanmuClone = 'true'
    clone.style.transform = `translateX(${currentX}px)`
    clone.style.transition = 'transform 0s linear 0s'
    clone.style.zIndex = '9999'
    clone.style.pointerEvents = 'auto'

    el.style.opacity = '0'
    el.style.pointerEvents = 'none'

    if (meta) {
      danmuMetaMap.set(clone, meta)
    }

    el.parentElement?.appendChild(clone)
  }

  const cloneData = {
    el: clone,
    originalEl,
    mode,
    targetTranslateX: targetX,
    speedPxPerSec,
  }

  if (!isAlreadyClone) {
    activeClones.add(cloneData)
  }

  heldDanmu = cloneData
}

const resumeHeldDanmu = () => {
  if (!heldDanmu) return
  const clone = heldDanmu
  heldDanmu = null
  emit('danmuHoldEnd')

  if (isPlayerPlaying()) {
    resumeCloneAnimation(clone)
  }
  // 暂停状态下松开 hover：保持 clone 冻结在原地（与暂停时整个弹幕层一致），
  // 待播放恢复时由 playing 的 watch 统一接管恢复飘动。
}

const releaseHeldDanmuItem = (reason: 'leave' | 'timeout') => {
  if (!heldDanmu) return
  if (reason === 'leave') {
    resumeHeldDanmu()
  }
}

const updateDanmuMeta = (danmuId: number, partial: { likeCount?: number; isLiked?: boolean }) => {
  const el = danmuIdToEl.get(danmuId)
  if (!el) return
  const meta = danmuMetaMap.get(el)
  if (!meta) return
  if (partial.likeCount !== undefined) meta.likeCount = partial.likeCount
  if (partial.isLiked !== undefined) meta.isLiked = partial.isLiked
}

defineExpose({
  emitDanmu,
  setDanmuVisible,
  setDanmuOpacity,
  setDanmuFontSize,
  danmuVisible,
  danmuOpacity,
  danmuFontSize,
  artRef,
  holdDanmu: holdDanmuItem,
  releaseHeldDanmu: releaseHeldDanmuItem,
  updateDanmuMeta,
  getCurrentTime,
  // MP4 直链下载资源（优先源视频），供下载入口复用；DASH 不参与下载。
  downloadResource,
})

// ---- Hover event delegation ----

let currentHoverEl: HTMLElement | null = null

const setupDanmuHover = (container: HTMLElement) => {
  const danmukuLayer = (): HTMLElement | null => container.querySelector('.art-danmuku')

  container.addEventListener('mouseover', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const layer = danmukuLayer()
    if (!layer || !layer.contains(target)) return

    const el = findDanmuEl(target, layer)
    if (!el || el === currentHoverEl) return

    currentHoverEl = el
    const meta = danmuMetaMap.get(el)
    const mode = Number(el.dataset.mode ?? '0') as 0 | 1 | 2

    holdDanmuItem(el, mode)

    emit('danmuHover', {
      el,
      e,
      text: el.textContent?.trim() ?? '',
      danmuId: meta?.id,
      likeCount: meta?.likeCount ?? 0,
      isLiked: meta?.isLiked ?? false,
      createdAt: meta?.createdAt,
      mode,
    })
  })

  container.addEventListener('mouseout', (e: MouseEvent) => {
    if (!currentHoverEl) return
    const related = e.relatedTarget as HTMLElement | null

    const leavingEl = currentHoverEl

    if (
      related &&
      (leavingEl.contains(related) ||
        (heldDanmu &&
          ((leavingEl === heldDanmu.originalEl && related === heldDanmu.el) ||
            (leavingEl === heldDanmu.el && related === heldDanmu.originalEl))))
    ) {
      return
    }

    currentHoverEl = null

    // We only trigger DanmuLeave if the mouse completely left the clone and didn't enter the tooltip
    if (heldDanmu && (heldDanmu.el === leavingEl || heldDanmu.originalEl === leavingEl)) {
      emit('danmuLeave')
    }
  })
}

const findDanmuEl = (target: HTMLElement, layer: HTMLElement): HTMLElement | null => {
  if (target === layer) return null
  if (target.parentElement === layer) return target
  let current: HTMLElement | null = target
  while (current && current.parentElement !== layer) {
    current = current.parentElement
  }
  return current
}

// ---- Observe art-danmuku for metadata from loaded danmu (visible event) ----

const setupDanmuVisibleObserver = () => {
  if (!artRef.value) return

  type DanmuVisiblePayload = {
    text: string
    mode: number
    color: string
    time: number
    id?: string
    $ref: HTMLElement | null
  }

  const handler = (...args: unknown[]) => {
    const danmu = args[0] as DanmuVisiblePayload
    if (!danmu?.$ref) return
    if (!danmu.id) return
    const numId = Number(danmu.id)
    if (Number.isNaN(numId)) return
    const existing = danmuMetaMap.get(danmu.$ref)
    if (!existing || existing.id !== numId) {
      const cached = loadedDanmuMeta.get(numId)
      danmuMetaMap.set(
        danmu.$ref,
        cached ?? {
          id: numId,
          likeCount: 0,
          isLiked: false,
          mode: danmu.mode as 0 | 1 | 2,
        }
      )
      danmuIdToEl.set(numId, danmu.$ref)
    }
  }

  artRef.value.on('artplayerPluginDanmuku:visible' as 'ready', handler)
}

const initPlayer = () => {
  if (!containerRef.value || !hasPlayableMedia.value) return

  const useDash = shouldUseDash()
  // DASH 原样传清单 URL（含查询串，切勿改写）；MP4 取默认清晰度直链。
  const startUrl = useDash ? dashResource.value?.fileUrl : defaultMp4.value?.fileUrl
  if (!startUrl) return

  const savedVolume = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '0.7')
  // 续播：DASH→MP4 兜底重建优先用保留位置，否则用后端 watchProgress。
  const startAt = pendingSeekTime ?? videoStore.watchProgress ?? 0
  pendingSeekTime = null

  const settings: Setting[] = []

  // 仅 MP4 模式才用 Artplayer 原生 quality 菜单；DASH 清晰度交给 dash.js ABR，
  // 手动码率见 setupDashQualityMenu —— 不用 quality 数组混搭 dash/mp4，避免串味。
  if (!useDash && qualityList.value && qualityList.value.length > 1) {
    settings.push({
      html: '清晰度',
      width: 150,
      tooltip: qualityList.value.find((q) => q.default)?.html ?? '清晰度',
      selector: qualityList.value.map((q) => ({ default: q.default, html: q.html, url: q.url })),
      onSelect(item, _dom, event) {
        event.preventDefault()
        const url = (item as { url?: string }).url
        const html = (item as { html?: string }).html ?? ''
        if (url) {
          // If URL is the same as current, no real switch needed
          if (this.url === url) {
            toast.success(`已切换至 ${html}`)
            return html
          }
          qualitySwitchTime = this.currentTime
          isSwitchingQuality.value = true
          switchingQualityLabel.value = html
          // Safety timeout: dismiss overlay if canplay doesn't fire within 8s
          if (qualitySwitchTimer) clearTimeout(qualitySwitchTimer)
          qualitySwitchTimer = setTimeout(() => {
            if (isSwitchingQuality.value) {
              isSwitchingQuality.value = false
              switchingQualityLabel.value = ''
              toast.warning('清晰度切换超时')
            }
          }, 8000)
          void this.switchQuality(url)
        }
        return html
      },
    })
  }

  // DASH 自定义播放类型：dash.js 接管拉流/ABR，失败兜底到 MP4，并注入手动码率菜单。
  const mpdLoader = useDash
    ? createMpdLoader({
        onFatalError: handleDashFatal,
        onDashCreated: (artInstance, dash) => {
          cleanupDashMenu = setupDashQualityMenu(artInstance, dash, {
            labels: mp4Resources.value.map((r) => ({
              resolution: r.resolution ?? '',
              bitrate: r.bitrate,
              fileUrl: r.fileUrl,
            })),
          })
        },
      })
    : undefined

  const option: Option = {
    container: containerRef.value,
    url: startUrl,
    theme: '#00a1d6',
    volume: savedVolume,
    setting: true,
    flip: true,
    playbackRate: true,
    aspectRatio: true,
    subtitleOffset: true,
    hotkey: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    autoPlayback: true,
    autoSize: false,
    autoMini: true,
    loop: false,
    screenshot: true,
    lock: true,
    fastForward: true,
    miniProgressBar: true,
    mutex: true,
    playsInline: true,
    layers: [],
    settings,
    plugins: props.enableDanmu
      ? [
          artplayerPluginDanmuku({
            danmuku: loadDanmuList,
            speed: 5,
            opacity: 1,
            fontSize: DEFAULT_DANMU_FONT_SIZE,
            color: '#ffffff',
            mode: 0,
            // 弹幕显示区域上下边距：默认底部留 25%，会浪费下半屏且看着不均匀。
            // 改成上下各 10px，让弹幕铺满整个播放器高度，轨道更多、分布更均匀。
            margin: [10, 10],
            // 关闭防重叠：插件的轨道分配本身是"先逐条填满空轨道，满了才挑最空的一行叠加"。
            // antiOverlap=true 在轨道满时会把弹幕退回队列下一帧重试（延迟/丢弃），
            // 这会破坏我们自定义的精准 timeOffset 调度。设为 false 后弹幕永远在
            // 对应时间点立即出现：先均匀铺满，密集到放不下时才重叠，既不延迟也不丢弃。
            antiOverlap: false,
            synchronousPlayback: true,
            emitter: false,
            heatmap: true,
            maxLength: 200,
            FONT_SIZE: {
              min: DANMU_FONT_SIZE_MIN,
              max: DANMU_FONT_SIZE_MAX,
            },
          }),
        ]
      : [],
  }

  if (useDash && mpdLoader) {
    option.type = 'mpd'
    option.customType = { mpd: mpdLoader }
  }

  const art = new Artplayer(option)

  if (startAt > 0) {
    art.on('ready', () => {
      art.currentTime = startAt
      resetPreciseDanmuReadyCursor(startAt)
    })
  }

  art.on('video:volumechange', () => {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(art.volume))
  })

  art.on('video:timeupdate', () => {
    syncPlayerState(art)
    if (props.enableDanmu) {
      void ensureSegmentsLoaded(art.currentTime * 1000)
    }
  })

  art.on('video:play', () => {
    syncPlayerState(art, true)
    resetProgressSaveCycle(art, { immediate: true })
  })

  art.on('video:pause', () => {
    syncPlayerState(art, false)
    resetProgressSaveCycle(art, { immediate: true })
  })

  art.on('video:ended', () => {
    syncPlayerState(art, false)
    resetProgressSaveCycle(art, { immediate: true })
  })

  art.on('seek', (_currentTime, time) => {
    if (Number.isFinite(time) && time >= 0) {
      videoStore.updatePlayerState({
        currentTime: time,
        duration: getDuration(art),
        playing: art.playing,
      })
    }
  })

  art.on('video:seeking', () => {
    syncPlayerState(art)
    resetVisibleDanmu()
  })

  art.on('video:seeked', () => {
    syncPlayerState(art)
    resetVisibleDanmu()
    if (props.enableDanmu) {
      void ensureSegmentsLoaded(art.currentTime * 1000)
    }
  })

  art.on('video:canplay', () => {
    if (qualitySwitchTime > 0) {
      art.currentTime = qualitySwitchTime
      resetPreciseDanmuReadyCursor(qualitySwitchTime)
      qualitySwitchTime = 0
    }
    if (isSwitchingQuality.value) {
      isSwitchingQuality.value = false
      if (qualitySwitchTimer) {
        clearTimeout(qualitySwitchTimer)
        qualitySwitchTimer = null
      }
      toast.success(`已切换至 ${switchingQualityLabel.value}`)
      switchingQualityLabel.value = ''
    }
  })

  art.on('artplayerPluginDanmuku:config', syncDanmuConfig)

  artRef.value = art
  emit('ready', art)

  const danmuPlugin = getDanmuPlugin(art)
  if (danmuPlugin) {
    installPreciseDanmuScheduler(danmuPlugin, art)
    cleanupDanmuFontSizeLiveControl = setupDanmuFontSizeLiveControl(danmuPlugin)
    emit('danmuPlugin', danmuPlugin)
  }

  if (props.enableDanmu) {
    setupDanmuVisibleObserver()

    const container = containerRef.value
    if (container) {
      setupDanmuHover(container)
    }
  }
}

const clearProgressSaveTimer = () => {
  if (progressSaveTimer) {
    clearTimeout(progressSaveTimer)
    progressSaveTimer = null
  }
}

const saveCurrentProgress = (art: Artplayer) => {
  if (!authStore.isLoggedIn || !videoStore.videoId) return

  videoStore.updatePlayerState({
    currentTime: art.currentTime,
    duration: art.duration,
    playing: art.playing,
  })
  void videoStore.saveProgress()
}

const scheduleProgressSave = (art: Artplayer) => {
  clearProgressSaveTimer()
  if (!authStore.isLoggedIn || !videoStore.videoId || !art.playing) return

  progressSaveTimer = setTimeout(() => {
    saveCurrentProgress(art)
    scheduleProgressSave(art)
  }, PROGRESS_SAVE_INTERVAL)
}

const resetProgressSaveCycle = (art: Artplayer, options?: { immediate?: boolean }) => {
  clearProgressSaveTimer()

  if (options?.immediate) {
    saveCurrentProgress(art)
  }

  if (art.playing) {
    scheduleProgressSave(art)
  }
}

const destroyPlayer = () => {
  clearProgressSaveTimer()
  cleanupDanmuFontSizeLiveControl?.()
  cleanupDanmuFontSizeLiveControl = null
  cleanupDashMenu?.()
  cleanupDashMenu = null
  heldDanmu = null
  currentHoverEl = null
  cloneRemovalTimers.forEach((timer) => clearTimeout(timer))
  cloneRemovalTimers.clear()
  activeClones.forEach((clone) => {
    if (clone.el.isConnected) clone.el.remove()
  })
  activeClones.clear()
  danmuMetaMap.clear()
  danmuIdToEl.clear()
  loadedDanmuMeta.clear()
  clearDanmuState()

  if (artRef.value) {
    if (authStore.isLoggedIn && videoStore.videoId) {
      videoStore.updatePlayerState({
        currentTime: getCurrentTime(artRef.value),
        duration: getDuration(artRef.value),
      })
      void videoStore.saveProgress()
    }
    // 先释放 dash.js（销毁事件也会兜底释放，这里显式调用保证确定性、无残留请求）。
    destroyDash(artRef.value as ArtWithDash)
    artRef.value.destroy(false)
    artRef.value = null
  }
}

// 视频 / 分P / 弹幕开关 / VIP 可见性 / 资源清单变化时，销毁旧实例并按选流策略重建。
const rebuildKey = computed(() => {
  const dashUrl = dashResource.value?.fileUrl ?? ''
  const mp4Sig = mp4Resources.value.map((r) => `${r.id}:${r.fileUrl}`).join('|')
  return [
    videoStore.currentVideo?.id ?? 0,
    props.partId ?? 0,
    props.enableDanmu ? 1 : 0,
    isVipUser.value ? 1 : 0,
    dashUrl,
    mp4Sig,
  ].join('::')
})

watch(rebuildKey, () => {
  // 真正换源时允许重新尝试 DASH（清除上一个视频的运行期降级标记）。
  dashDisabled = false
  pendingSeekTime = null
  destroyPlayer()
  if (hasPlayableMedia.value) {
    initPlayer()
  }
})

onMounted(() => {
  if (hasPlayableMedia.value) {
    initPlayer()
  }
})

onBeforeUnmount(() => {
  destroyPlayer()
})
</script>

<template>
  <div class="video-player-container relative w-full overflow-hidden rounded-lg bg-black">
    <div ref="containerRef" class="artplayer-app aspect-video w-full" />

    <!-- Quality switch loading overlay -->
    <Transition name="quality-overlay">
      <div v-if="isSwitchingQuality" class="quality-switch-overlay">
        <div class="quality-switch-indicator">
          <div class="quality-spinner" />
          <span class="quality-switch-text">正在切换至 {{ switchingQualityLabel }}</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.video-player-container {
  --art-theme: #00a1d6;
}

:deep(.art-video-player) {
  background: #000 !important;
}

:deep(.art-video-player video) {
  image-rendering: auto !important;
  filter: none !important;
}

:deep(.art-control-progress) {
  height: 14px !important;
  bottom: 0 !important;
}

:deep(.art-control-progress-inner) {
  height: 3px !important;
  background: rgb(255 255 255 / 0.2) !important;
  border-radius: 1.5px !important;
  transition: height 0.2s ease !important;
}

:deep(.art-control-progress:hover .art-control-progress-inner) {
  height: 6px !important;
  border-radius: 3px !important;
}

:deep(.art-progress-loaded) {
  background: rgb(255 255 255 / 0.4) !important;
  border-radius: inherit !important;
}

:deep(.art-progress-played) {
  background-color: var(--color-primary) !important;
  border-radius: inherit !important;
}

:deep(.art-progress-indicator) {
  background-color: var(--color-primary) !important;
  border: 2px solid #fff !important;
  width: 14px !important;
  height: 14px !important;
  border-radius: 50% !important;
  box-shadow: 0 0 4px rgb(0 0 0 / 0.3) !important;
  transform: scale(0) !important;
  transition: transform 0.2s ease !important;
}

:deep(.art-control-progress:hover .art-progress-indicator) {
  transform: scale(1) !important;
}

:deep(.art-setting-panel) {
  border-radius: 8px !important;
}

:deep(.art-danmuku) {
  pointer-events: none !important;
}

:deep(.art-danmuku > *) {
  pointer-events: auto !important;
  cursor: pointer;
}

.quality-switch-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.55);
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.quality-switch-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.quality-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgb(255 255 255 / 0.2);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: quality-spin 0.8s cubic-bezier(0.37, 0, 0.63, 1) infinite;
}

.quality-switch-text {
  color: rgb(255 255 255 / 0.9);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
}

.quality-overlay-enter-active {
  transition: opacity 0.25s ease;
}

.quality-overlay-leave-active {
  transition: opacity 0.4s ease;
}

.quality-overlay-enter-from,
.quality-overlay-leave-to {
  opacity: 0;
}

/* Progress bar styling to match Bilibili */

/* Enable pointer events on danmu items for hover interaction */

/* Quality switch overlay */
@keyframes quality-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Overlay transition */
</style>
