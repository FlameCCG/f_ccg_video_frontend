// Vue 替换静态启动 DOM 时延续同一条时间线，避免循环和入场动画重新播放。
const timeline = new Map<string, { time: number; capturedAt: number }>()

export function captureOpeningMotion() {
  timeline.clear()
  const opening = document.querySelector('#app > .app-boot')
  if (!opening) return

  const capturedAt = performance.now()
  for (const animation of opening.getAnimations({ subtree: true })) {
    if (animation instanceof CSSAnimation && typeof animation.currentTime === 'number') {
      timeline.set(animation.animationName, { time: animation.currentTime, capturedAt })
    }
  }
}

export function resumeOpeningMotion(opening: HTMLElement) {
  const now = performance.now()
  for (const animation of opening.getAnimations({ subtree: true })) {
    if (!(animation instanceof CSSAnimation)) continue
    const previous = timeline.get(animation.animationName)
    if (previous) animation.currentTime = previous.time + now - previous.capturedAt
  }
  timeline.clear()
}
