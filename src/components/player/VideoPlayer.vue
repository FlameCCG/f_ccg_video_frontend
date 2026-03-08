<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import Artplayer, { type Option, type Setting } from 'artplayer'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import { getDanmuList, type DanmuItem } from '@/api/danmu'
import type { VideoResourceItem } from '@/api/video'

const props = defineProps<{
  partId?: number
}>()

const emit = defineEmits<{
  ready: [instance: Artplayer]
  danmuPlugin: [plugin: ReturnType<ReturnType<typeof artplayerPluginDanmuku>>]
  danmuClick: [event: MouseEvent, text: string]
}>()

const videoStore = useVideoStore()
const authStore = useAuthStore()

const containerRef = ref<HTMLDivElement | null>(null)
const artRef = ref<Artplayer | null>(null)

// Volume persistence key (Requirements: 音量持久化)
const VOLUME_STORAGE_KEY = 'artplayer_volume'

// Get resources for current part (single video uses top-level resources)
const resources = computed((): VideoResourceItem[] => {
  const video = videoStore.currentVideo
  if (!video) return []

  if (props.partId && video.parts?.length) {
    const part = video.parts.find((p) => p.id === props.partId)
    return part?.resources ?? video.resources ?? []
  }
  return video.resources ?? []
})

// Build quality list for ArtPlayer (Requirements: 多清晰度切换)
const qualityList = computed(() => {
  const list = resources.value
  if (!list.length) return undefined

  return list.map((r, i) => ({
    default: i === 0,
    html: r.resolution || `清晰度${i + 1}`,
    url: r.fileUrl,
  }))
})

// Primary video URL (first resource)
const primaryUrl = computed(() => {
  const list = resources.value
  return list[0]?.fileUrl ?? ''
})

// Progress save interval (every 10 seconds)
let progressSaveTimer: ReturnType<typeof setInterval> | null = null
const PROGRESS_SAVE_INTERVAL = 10000

let qualitySwitchTime = 0

const danmuVisible = ref(true)
const danmuOpacity = ref(1)

const loadDanmuList = async (): Promise<
  { text: string; time: number; color: string; mode: 0 | 1 | 2 }[]
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

    return list.map((d: DanmuItem) => ({
      text: d.content,
      time: isSeconds ? d.timeOffset : d.timeOffset / 1000,
      color: d.color || '#ffffff',
      mode: (d.position ?? 0) as 0 | 1 | 2,
    }))
  } catch {
    return []
  }
}

const emitDanmu = (danmu: { text: string; time: number; color?: string; mode?: 0 | 1 | 2 }) => {
  if (!artRef.value) return
  const plugin = artRef.value.plugins?.artplayerPluginDanmuku as
    | ReturnType<ReturnType<typeof artplayerPluginDanmuku>>
    | undefined
  if (plugin) {
    plugin.emit({
      text: danmu.text,
      time: danmu.time,
      color: danmu.color,
      mode: danmu.mode ?? 0,
    })
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

defineExpose({
  emitDanmu,
  setDanmuVisible,
  setDanmuOpacity,
  danmuVisible,
  danmuOpacity,
  artRef,
})

const initPlayer = () => {
  if (!containerRef.value || !primaryUrl.value) return

  const savedVolume = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY) ?? '0.7')
  const watchProgress = videoStore.watchProgress || 0

  const settings: Setting[] = []

  // Add quality selector if multiple resources (Requirements: 清晰度切换保持进度)
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

  // Restore watch progress (Requirements: 播放进度记忆)
  if (watchProgress > 0) {
    art.on('ready', () => {
      art.currentTime = watchProgress
    })
  }

  // Volume change -> persist to localStorage (Requirements: 音量持久化)
  art.on('video:volumechange', () => {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(art.volume))
  })

  // Sync player state to store
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

  // Restore progress after quality switch (Requirements: 切换清晰度时保持播放进度)
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

  // Danmu click interaction via event delegation (Requirements: 4.7)
  const container = containerRef.value
  if (container) {
    container.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.classList.contains('art-danmuku-item') || target.closest('.art-danmuku-item')) {
        const el = target.classList.contains('art-danmuku-item')
          ? target
          : (target.closest('.art-danmuku-item') as HTMLElement)
        if (el) {
          e.stopPropagation()
          emit('danmuClick', e, el.textContent?.trim() ?? '')
        }
      }
    })
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

// Keyboard shortcuts: Space play/pause, Arrow seek/volume, F fullscreen (ArtPlayer hotkey: true)
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
</style>
