import { nextTick } from 'vue'

export interface ThemeTransitionOrigin {
  x: number
  y: number
}

export function getThemeTransitionOrigin(event: MouseEvent): ThemeTransitionOrigin {
  // 键盘触发的 click 没有指针坐标，从控件中心展开。
  if (event.detail === 0 && event.currentTarget instanceof Element) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  return { x: event.clientX, y: event.clientY }
}

/** 手机端只裁剪浏览器快照，不让整页节点在扩散过程中逐帧变色。 */
export async function runThemeTransition(
  update: () => void,
  origin?: ThemeTransitionOrigin
): Promise<void> {
  const root = document.documentElement
  const isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (
    !isMobile ||
    reducedMotion ||
    typeof document.startViewTransition !== 'function' ||
    !CSS.supports('clip-path', 'circle(1px at 1px 1px)')
  ) {
    update()
    return
  }

  const width = window.innerWidth
  const height = window.innerHeight
  const x = Math.min(width, Math.max(0, origin?.x ?? width - 28))
  const y = Math.min(height, Math.max(0, origin?.y ?? 28))
  // 覆盖最远角，并留出抗锯齿余量，避免收尾残留旧主题的细边。
  const radius = Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y))) + 2
  const duration = Math.round(Math.min(1120, Math.max(880, 500 + radius * 0.55)))

  let transition: ViewTransition | undefined
  let reveal: Animation | undefined
  let updated = false
  const applyOnce = () => {
    if (updated) return
    updated = true
    update()
  }

  root.classList.remove('theme-switching')
  root.classList.add('theme-revealing')

  try {
    transition = document.startViewTransition(async () => {
      applyOnce()
      // 等待主题驱动的图标、文案和 Teleport 一起提交，再捕获新画面。
      await nextTick()
    })
    // 浏览器可能因页面隐藏或快照失败而跳过转场，提前接住生命周期拒绝。
    void transition.finished.catch(() => undefined)
    void transition.updateCallbackDone.catch(() => undefined)
    await transition.ready

    reveal = root.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      },
      {
        duration,
        easing: 'cubic-bezier(0.32, 0, 0.18, 1)',
        fill: 'both',
        pseudoElement: '::view-transition-new(root)',
      }
    )

    await reveal.finished
    await transition.finished
  } catch {
    transition?.skipTransition()
    applyOnce()
    await transition?.finished.catch(() => undefined)
  } finally {
    reveal?.cancel()
    root.classList.remove('theme-revealing')
  }
}
