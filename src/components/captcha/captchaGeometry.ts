/**
 * 验证码的坐标换算与「热路径」写入器
 *
 * 拖拽 / 指针跟随是每秒 100~200 次的路径，走响应式意味着每次都跑一遍 computed 链、
 * 重建 style 对象、patch 一堆 DOM 属性。这里提供两件事：
 * 1. toNaturalPoint —— 视觉坐标 → 原图坐标（后端只认原图坐标）；
 * 2. useFrameWriter —— rAF 合并的写入器，把裸值直接写成 CSS 变量，绕开组件 patch。
 */
import { onBeforeUnmount } from 'vue'

export interface NaturalPoint {
  x: number
  y: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 把一次点击换算成原图坐标。
 * rect 可从外部传入（pointerenter / resize 时缓存好的），避免每次点击都强制同步布局。
 */
export function toNaturalPoint(
  image: HTMLImageElement,
  clientX: number,
  clientY: number,
  rect?: DOMRect
): NaturalPoint | null {
  const box = rect ?? image.getBoundingClientRect()
  if (!box.width || !box.height || !image.naturalWidth || !image.naturalHeight) return null

  return {
    x: clamp(
      Math.round(((clientX - box.left) / box.width) * image.naturalWidth),
      0,
      image.naturalWidth
    ),
    y: clamp(
      Math.round(((clientY - box.top) / box.height) * image.naturalHeight),
      0,
      image.naturalHeight
    ),
  }
}

export interface FrameWriter {
  /** 同一帧内多次调用只会执行最后一次 */
  schedule: (job: () => void) => void
  cancel: () => void
}

export function useFrameWriter(): FrameWriter {
  let frame = 0
  let pending: (() => void) | null = null

  const run = (): void => {
    frame = 0
    const job = pending
    pending = null
    job?.()
  }

  const schedule = (job: () => void): void => {
    pending = job
    if (frame) return
    frame = requestAnimationFrame(run)
  }

  const cancel = (): void => {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    pending = null
  }

  onBeforeUnmount(cancel)

  return { schedule, cancel }
}
