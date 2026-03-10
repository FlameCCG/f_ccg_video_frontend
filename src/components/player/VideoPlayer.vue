<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import Artplayer, { type Option, type Setting } from 'artplayer'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import { getDanmuList, type DanmuItem, type PlayerDanmuPayload } from '@/api/danmu'
import type { VideoResourceItem } from '@/api/video'

const props = defineProps<{
  partId?: number
}>()

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
    }
  ]
  danmuLeave: []
  danmuHoldEnd: []
}>()

const videoStore = useVideoStore()
const authStore = useAuthStore()

const containerRef = ref<HTMLDivElement | null>(null)
const artRef = ref<Artplayer | null>(null)

const VOLUME_STORAGE_KEY = 'artplayer_volume'

const resources = computed((): VideoResourceItem[] => {
  const video = videoStore.currentVideo
  if (!video) return []

  if (props.partId && video.parts?.length) {
    const part = video.parts.find((p) => p.id === props.partId)
    return part?.resources ?? video.resources ?? []
  }
  return video.resources ?? []
})

const qualityList = computed(() => {
  const list = resources.value
  if (!list.length) return undefined

  return list.map((r, i) => ({
    default: i === 0,
    html: r.resolution || `清晰度${i + 1}`,
    url: r.fileUrl,
  }))
})

const primaryUrl = computed(() => {
  const list = resources.value
  return list[0]?.fileUrl ?? ''
})

let progressSaveTimer: ReturnType<typeof setInterval> | null = null
const PROGRESS_SAVE_INTERVAL = 10000

let qualitySwitchTime = 0

const danmuVisible = ref(true)
const danmuOpacity = ref(1)

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

const loadDanmuList = async (): Promise<
  { id?: string; text: string; time: number; color: string; mode: 0 | 1 | 2 }[]
> => {
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
    const isSeconds = list.length > 0 && list.every((d) => d.timeOffset > 0 && d.timeOffset < 10000)

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
      time: isSeconds ? d.timeOffset : d.timeOffset / 1000,
      color: d.color || '#ffffff',
      mode: (d.position ?? 0) as 0 | 1 | 2,
    }))
  } catch {
    return []
  }
}

const emitDanmu = (danmu: PlayerDanmuPayload) => {
  if (!artRef.value) return
  const plugin = artRef.value.plugins?.artplayerPluginDanmuku as
    | ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
    | undefined
  if (plugin) {
    const emitted = {
      text: danmu.text,
      time: danmu.time,
      color: danmu.color,
      mode: danmu.mode ?? 0,
      border: !!danmu.isSelf,
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

const setDanmuVisible = (visible: boolean) => {
  danmuVisible.value = visible
  if (!artRef.value) return
  const plugin = artRef.value.plugins?.artplayerPluginDanmuku as
    | ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
    | undefined
  if (plugin) {
    if (visible) plugin.show()
    else plugin.hide()
  }
}

const setDanmuOpacity = (opacity: number) => {
  danmuOpacity.value = opacity
  if (!artRef.value) return
  const plugin = artRef.value.plugins?.artplayerPluginDanmuku as
    | ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
    | undefined
  if (plugin) {
    plugin.config({ ...plugin.option, opacity })
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
  danmuVisible,
  danmuOpacity,
  artRef,
  holdDanmu: holdDanmuItem,
  releaseHeldDanmu: releaseHeldDanmuItem,
  updateDanmuMeta,
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
          qualitySwitchTime = this.currentTime
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
    plugins: [
      artplayerPluginDanmuku({
        danmuku: loadDanmuList,
        speed: 5,
        opacity: 1,
        fontSize: 18,
        color: '#ffffff',
        mode: 0,
        antiOverlap: true,
        synchronousPlayback: true,
        emitter: false,
        heatmap: true,
        maxLength: 200,
      }),
    ],
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
    videoStore.updatePlayerState({
      currentTime: art.currentTime,
      duration: art.duration,
      playing: art.playing,
    })
  })

  art.on('video:play', () => {
    videoStore.updatePlayerState({ playing: true })
  })

  art.on('video:pause', () => {
    videoStore.updatePlayerState({ playing: false })
  })

  art.on('video:canplay', () => {
    if (qualitySwitchTime > 0) {
      art.currentTime = qualitySwitchTime
      qualitySwitchTime = 0
    }
  })

  artRef.value = art
  emit('ready', art)

  const danmuPlugin = art.plugins?.artplayerPluginDanmuku as
    | ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
    | undefined
  if (danmuPlugin) {
    emit('danmuPlugin', danmuPlugin)
  }

  setupDanmuVisibleObserver()

  const container = containerRef.value
  if (container) {
    setupDanmuHover(container)
  }
}

const setupProgressSave = (art: Artplayer) => {
  if (!authStore.isLoggedIn) return

  progressSaveTimer = setInterval(() => {
    if (videoStore.videoId && art.playing) {
      videoStore.updatePlayerState({
        currentTime: art.currentTime,
        duration: art.duration,
      })
      void videoStore.saveProgress()
    }
  }, PROGRESS_SAVE_INTERVAL)
}

const destroyPlayer = () => {
  if (progressSaveTimer) {
    clearInterval(progressSaveTimer)
    progressSaveTimer = null
  }
  heldDanmu = null
  currentHoverEl = null
  danmuMetaMap.clear()
  danmuIdToEl.clear()
  loadedDanmuMeta.clear()

  if (artRef.value) {
    if (authStore.isLoggedIn && videoStore.videoId) {
      videoStore.updatePlayerState({
        currentTime: artRef.value.currentTime,
        duration: artRef.value.duration,
      })
      void videoStore.saveProgress()
    }
    artRef.value.destroy(false)
    artRef.value = null
  }
}

watch(
  () => [primaryUrl.value, videoStore.currentVideo?.id],
  () => {
    destroyPlayer()
    if (primaryUrl.value) {
      initPlayer()
      if (artRef.value) {
        setupProgressSave(artRef.value)
        artRef.value.on('ready', () => {
          if (artRef.value) setupProgressSave(artRef.value)
        })
      }
    }
  }
)

onMounted(() => {
  if (primaryUrl.value) {
    initPlayer()
    if (artRef.value) {
      setupProgressSave(artRef.value)
      artRef.value.on('ready', () => {
        if (artRef.value) setupProgressSave(artRef.value)
      })
    }
  }
})

onBeforeUnmount(() => {
  destroyPlayer()
})
</script>

<template>
  <div class="video-player-container relative w-full overflow-hidden rounded-lg bg-black">
    <div ref="containerRef" class="artplayer-app aspect-video w-full" />
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
  background: #00a1d6 !important;
  border-radius: inherit !important;
}

:deep(.art-progress-indicator) {
  background: #00a1d6 !important;
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
</style>
