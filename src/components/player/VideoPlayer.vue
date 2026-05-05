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

const VOLUME_STORAGE_KEY = 'artplayer_volume'
const DEFAULT_DANMU_FONT_SIZE = 18
const DANMU_FONT_SIZE_MIN = 12
const DANMU_FONT_SIZE_MAX = 120

const resources = computed((): VideoResourceItem[] => {
  const video = videoStore.currentVideo
  if (!video) return []

  if (props.partId && video.parts?.length) {
    const part = video.parts.find((p) => p.id === props.partId)
    return part?.resources ?? video.resources ?? []
  }
  return video.resources ?? []
})

const pickDefaultResource = (list: VideoResourceItem[]): VideoResourceItem | undefined => {
  if (!list.length) return undefined

  const publicResources = list.filter((resource) => !resource.isVip)
  const candidates = publicResources.length ? publicResources : list

  const preferredPatterns = [/720p/i, /1080p(?!.*高码率)/i, /480p/i, /360p/i]
  for (const pattern of preferredPatterns) {
    const matched = candidates.find((resource) => pattern.test(resource.resolution || ''))
    if (matched) return matched
  }

  const bitrateTarget = 2000
  const bitrateSorted = [...candidates]
    .filter((resource) => resource.bitrate > 0)
    .sort((left, right) => {
      return Math.abs(left.bitrate - bitrateTarget) - Math.abs(right.bitrate - bitrateTarget)
    })

  return bitrateSorted[0] ?? candidates[0] ?? list[0]
}

const defaultResource = computed(() => pickDefaultResource(resources.value))

const qualityList = computed(() => {
  const list = resources.value
  if (!list.length) return undefined
  const preferred = defaultResource.value

  return list.map((r, i) => ({
    default: preferred ? r.id === preferred.id : i === 0,
    html: r.resolution || `清晰度${i + 1}`,
    url: r.fileUrl,
  }))
})

const primaryUrl = computed(() => {
  return defaultResource.value?.fileUrl ?? resources.value[0]?.fileUrl ?? ''
})

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

const getDanmuPlugin = (art: Artplayer | null | undefined = artRef.value) => {
  if (!art) return undefined

  return toRaw(art).plugins?.artplayerPluginDanmuku as DanmuPluginInstance | undefined
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
    const params: { videoId: number; partId?: number; pageSize: number } = {
      videoId: vid,
      pageSize: 200,
    }
    if (props.partId) params.partId = props.partId
    const result = await getDanmuList(params)
    const list = result.list ?? []

    list.forEach((d: DanmuItem) => {
      loadedDanmuMeta.set(d.id, {
        id: d.id,
        likeCount: d.likeCount ?? 0,
        isLiked: d.isLiked ?? false,
        createdAt: d.createdAt,
        mode: (d.position ?? 0) as 0 | 1 | 2,
      })
    })

    return list.map((d: DanmuItem) => ({
      id: String(d.id),
      text: d.content,
      time: danmuMillisecondsToSeconds(d.timeOffset),
      color: d.color || '#ffffff',
      mode: (d.position ?? 0) as 0 | 1 | 2,
    }))
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
    if (clone.el.isConnected) clone.el.remove()
  })
  activeClones.clear()

  danmuMetaMap.clear()
  danmuIdToEl.clear()
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

watch(
  () => videoStore.playerState.playing,
  (isPlaying) => {
    activeClones.forEach((clone) => {
      // Don't modify the currently hovered danmaku
      if (heldDanmu && heldDanmu.el === clone.el) return

      if (isPlaying) {
        resumeCloneAnimation(clone)
      } else {
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
  if (clone.el.isConnected) clone.el.remove()
  activeClones.delete(clone)
}

const resumeCloneAnimation = (clone: HeldDanmu) => {
  if (!clone.el.isConnected) {
    return removeClone(clone)
  }

  if (clone.mode === 0 && clone.speedPxPerSec > 0) {
    const currentX = getCurrentTranslateX(clone.el)
    const remainingDistance = Math.abs(clone.targetTranslateX - currentX)
    const remainingTime = Math.max(remainingDistance / clone.speedPxPerSec, 0.1)

    clone.el.style.transform = `translateX(${clone.targetTranslateX}px)`
    clone.el.style.transition = `transform ${remainingTime}s linear 0s`

    clone.el.addEventListener('transitionend', () => removeClone(clone), { once: true })
  } else {
    clone.el.style.opacity = '0'
    clone.el.style.transition = 'opacity 0.5s ease'
    setTimeout(() => removeClone(clone), 500)
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

  if (videoStore.playerState.playing) {
    resumeCloneAnimation(clone)
  }
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
  if (!containerRef.value || !primaryUrl.value) return

  const savedVolume = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '0.7')
  const watchProgress = videoStore.watchProgress || 0

  const settings: Setting[] = []

  if (qualityList.value && qualityList.value.length > 1) {
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

  const option: Option = {
    container: containerRef.value,
    url: primaryUrl.value,
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
            antiOverlap: true,
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

  const art = new Artplayer(option)

  if (watchProgress > 0) {
    art.on('ready', () => {
      art.currentTime = watchProgress
    })
  }

  art.on('video:volumechange', () => {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(art.volume))
  })

  art.on('video:timeupdate', () => {
    syncPlayerState(art)
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
  })

  art.on('video:canplay', () => {
    if (qualitySwitchTime > 0) {
      art.currentTime = qualitySwitchTime
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
  heldDanmu = null
  currentHoverEl = null
  danmuMetaMap.clear()
  danmuIdToEl.clear()
  loadedDanmuMeta.clear()

  if (artRef.value) {
    if (authStore.isLoggedIn && videoStore.videoId) {
      videoStore.updatePlayerState({
        currentTime: getCurrentTime(artRef.value),
        duration: getDuration(artRef.value),
      })
      void videoStore.saveProgress()
    }
    artRef.value.destroy(false)
    artRef.value = null
  }
}

watch(
  () => [primaryUrl.value, videoStore.currentVideo?.id, props.partId, props.enableDanmu],
  () => {
    destroyPlayer()
    if (primaryUrl.value) {
      initPlayer()
    }
  }
)

onMounted(() => {
  if (primaryUrl.value) {
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

<style scoped>
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

/* Progress bar styling to match Bilibili */
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

/* Enable pointer events on danmu items for hover interaction */
:deep(.art-danmuku) {
  pointer-events: none !important;
}

:deep(.art-danmuku > *) {
  pointer-events: auto !important;
  cursor: pointer;
}

/* Quality switch overlay */
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

@keyframes quality-spin {
  to {
    transform: rotate(360deg);
  }
}

.quality-switch-text {
  color: rgb(255 255 255 / 0.9);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.5);
}

/* Overlay transition */
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
</style>
