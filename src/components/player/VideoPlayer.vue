<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import Artplayer, { type Option, type Setting } from 'artplayer'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import type { VideoResourceItem } from '@/api/video'

const props = defineProps<{
  partId?: number
}>()

const emit = defineEmits<{
  ready: [instance: Artplayer]
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
    autoSize: true,
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
  <div
    class="video-player-container relative w-full overflow-hidden rounded-xl bg-black shadow-2xl transition-shadow duration-500 hover:shadow-3xl"
  >
    <div ref="containerRef" class="artplayer-app aspect-video w-full" />
  </div>
</template>

<style scoped>
/* ============================================
   VideoPlayer — Cinematic Experience
   Ambition: Apple TV / Bilibili Pro Max
   Integration: Vue scoped styles for Artplayer
   ============================================ */

.video-player-container {
  /* Core brand color - Bilibili Blue but slightly richer */
  --art-theme: oklch(62% 0.17 230deg);
  --brand-blue: oklch(62% 0.17 230deg);
  --brand-pink: oklch(65% 0.22 350deg);

  /* Motion tokens */
  --duration-fast: 180ms;
  --duration-normal: 280ms;
  --duration-slow: 400ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);

  /* Shadows */
  --shadow-overlay: 0 8px 24px oklch(0% 0 0deg / 0.4), 0 2px 8px oklch(0% 0 0deg / 0.2);
  --shadow-cinematic: 0 16px 48px oklch(0% 0 0deg / 0.5), 0 48px 96px -24px oklch(0% 0 0deg / 0.4);
}

/* Base Player & Fullscreen Transition */
.art-video-player {
  transition:
    border-radius var(--duration-normal) var(--ease-smooth),
    box-shadow var(--duration-normal) var(--ease-smooth);
}

.art-video-player[data-fullscreen='true'] {
  border-radius: 0 !important;
  background: black;
}

/* --- Control Bar Glassmorphism --- */
:deep(.art-bottom) {
  background: linear-gradient(
    to top,
    oklch(0% 0 0deg / 0.8) 0%,
    oklch(0% 0 0deg / 0.4) 50%,
    oklch(0% 0 0deg / 0) 100%
  ) !important;
  backdrop-filter: blur(12px) saturate(1.5);
  border-top: 1px solid oklch(100% 1 1deg / 0.05);
  padding-bottom: 8px;
  transition:
    opacity var(--duration-normal) var(--ease-smooth),
    transform var(--duration-normal) var(--ease-smooth);
}

/* --- Progress Bar Hover Enlarge --- */
:deep(.art-control-progress) {
  --progress-height: 4px;
  --progress-height-hover: 8px;

  height: var(--progress-height) !important;
  transition:
    height var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-expo) !important;
  bottom: 12px !important;
  border-radius: 4px;
}

:deep(.art-control-progress:hover),
:deep(.art-video-player:hover .art-control-progress) {
  height: var(--progress-height-hover) !important;
}

:deep(.art-control-progress-inner) {
  background: linear-gradient(90deg, var(--brand-blue), var(--brand-pink)) !important;
  border-radius: 4px !important;
  box-shadow: 0 0 12px oklch(62% 0.17 230deg / 0.5);
}

/* Glowing Thumb Indicator */
:deep(.art-control-progress .art-progress-indicator) {
  width: 16px !important;
  height: 16px !important;
  background: var(--brand-pink) !important;
  border: 2px solid white !important;
  border-radius: 50% !important;
  box-shadow: 0 0 10px oklch(65% 0.22 350deg / 0.6) !important;
  transform: scale(0) translateY(-50%);
  transform-origin: center;
  transition: transform var(--duration-fast) var(--ease-out-back) !important;
  top: 50% !important;
}

:deep(.art-control-progress:hover .art-progress-indicator) {
  transform: scale(1) translateY(-50%);
}

/* --- Volume & Quality Panels (Rounded Corners & Shadows) --- */
:deep(.art-setting-panel),
:deep(.art-volume-panel) {
  background: oklch(15% 0.01 260deg / 0.85) !important;
  backdrop-filter: blur(16px) saturate(1.5) !important;
  border: 1px solid oklch(100% 1 1deg / 0.1) !important;
  border-radius: 12px !important;
  box-shadow: var(--shadow-overlay) !important;
  overflow: hidden;
  transform-origin: bottom center;
  animation: panel-enter var(--duration-fast) var(--ease-out-expo) forwards;
}

@keyframes panel-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* Panel Items Hover */
:deep(.art-setting-item:hover) {
  background: oklch(100% 1 1deg / 0.1) !important;
  transition: background var(--duration-fast) ease;
}

:deep(.art-setting-item.art-current) {
  color: var(--brand-blue) !important;
  font-weight: 600;
}

/* --- Icons & Buttons --- */
:deep(.art-control) {
  transition:
    transform var(--duration-fast) var(--ease-out-expo),
    opacity var(--duration-fast) ease;
}

:deep(.art-control:hover) {
  transform: scale(1.1);
  opacity: 1 !important;
}

:deep(.art-control:active) {
  transform: scale(0.95);
}

/* Hide default ugly tooltips, or style them if possible */
:deep(.art-tooltip) {
  background: oklch(15% 0.01 260deg / 0.9) !important;
  backdrop-filter: blur(8px) !important;
  border: 1px solid oklch(100% 1 1deg / 0.1) !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 12px oklch(0% 0 0deg / 0.3) !important;
  font-weight: 500 !important;
  padding: 4px 8px !important;
}
</style>
