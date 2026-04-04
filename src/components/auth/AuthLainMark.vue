<script setup lang="ts">
/**
 * Lain 品牌锚点：视觉完全对齐历史实现（svg + foreignObject + scale 3.5 + mask），
 * 仅优化生命周期：active 时挂载/播放，关闭时卸载解码。
 * 不改动 public/lain.webm。
 */
import { shallowRef, watch, onUnmounted, nextTick } from 'vue'

const props = defineProps<{
  /** Dialog 打开时为 true */
  active: boolean
}>()

const LOOP_START = 5
const LOOP_END = 15
const LAIN_SRC = '/lain.webm'

/** 与历史实现一致的 mask（像素 / 01 纹理） */
const LAIN_MASK =
  "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221.3%22 height=%221.1%22%3E%3Crect width=%221.3%22 height=%221.1%22 fill=%22black%22 fill-opacity=%220.35%22/%3E%3Ctext x=%22-0.1%22 y=%220.9%22 font-family=%22monospace%22 font-size=%221%22 font-weight=%22900%22 fill=%22black%22%3E01%3C/text%3E%3C/svg%3E')"

const videoStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover' as const,
  transform: 'scale(3.5)',
  transformOrigin: 'center center',
  maskImage: LAIN_MASK,
  maskSize: '1.3px 1.1px',
}

const videoRef = shallowRef<HTMLVideoElement | null>(null)
const mediaMounted = shallowRef(false)
const reduceMotion = shallowRef(false)

let motionQuery: MediaQueryList | null = null
let onMotionChange: ((e: MediaQueryListEvent) => void) | null = null

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const releaseVideo = (el: HTMLVideoElement | null) => {
  if (!el) return
  el.pause()
  el.removeAttribute('src')
  el.load()
}

const handleTimeUpdate = (event: Event) => {
  const el = event.target as HTMLVideoElement
  // 与历史逻辑一致：播到 15s 回到 5s
  if (el.currentTime >= LOOP_END) {
    el.currentTime = LOOP_START
  }
}

const startPlayback = async () => {
  await nextTick()
  const el = videoRef.value
  if (!el || !props.active) return

  if (el.getAttribute('src') !== LAIN_SRC) {
    el.src = LAIN_SRC
  }

  try {
    el.currentTime = LOOP_START
  } catch {
    // metadata 未就绪时忽略
  }

  if (reduceMotion.value) {
    el.pause()
    return
  }

  try {
    await el.play()
  } catch {
    // autoplay 策略拦截时静默
  }
}

const stopPlayback = () => {
  releaseVideo(videoRef.value)
  mediaMounted.value = false
}

watch(
  () => props.active,
  async (active) => {
    if (active) {
      reduceMotion.value = prefersReducedMotion()
      mediaMounted.value = true
      await startPlayback()
    } else {
      stopPlayback()
    }
  },
  { immediate: true }
)

if (typeof window !== 'undefined' && window.matchMedia) {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMotionChange = (e: MediaQueryListEvent) => {
    reduceMotion.value = e.matches
    const el = videoRef.value
    if (!el || !props.active) return
    if (e.matches) {
      el.pause()
    } else {
      void el.play().catch(() => {})
    }
  }
  motionQuery.addEventListener('change', onMotionChange)
}

onUnmounted(() => {
  if (motionQuery && onMotionChange) {
    motionQuery.removeEventListener('change', onMotionChange)
  }
  releaseVideo(videoRef.value)
})
</script>

<template>
  <!-- 尺寸 / overflow / 层级与历史 AuthDialog 完全一致，禁止圆形裁切或额外装饰 -->
  <div
    class="pointer-events-none mb-4 flex h-24 w-24 items-center justify-center"
    aria-hidden="true"
  >
    <svg
      v-if="mediaMounted"
      class="h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      <foreignObject width="100%" height="100%" style="overflow: visible">
        <video
          ref="videoRef"
          muted
          playsinline
          loop
          preload="none"
          :style="videoStyle"
          @timeupdate="handleTimeUpdate"
          @loadedmetadata="($event.target as HTMLVideoElement).currentTime = LOOP_START"
        />
      </foreignObject>
    </svg>
  </div>
</template>
