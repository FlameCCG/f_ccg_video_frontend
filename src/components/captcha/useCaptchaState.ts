/**
 * 验证码共享状态机（滑块 / 点选同构）
 *
 * idle →（用户提交：释放滑块 / 点「确定」）verifying →（父组件问过后端）success | fail
 *
 * 关键约定：**任何一方都不能自己宣布成功**。此前点选验证码是 setTimeout(500) 后直接
 * 点亮成功遮罩再去登录，服务端说验证码错了的时候用户已经看完成功动画了。
 * 现在两个验证码都只负责「取证 → 交给父组件 → 等结论 → 演判定」。
 */
import { computed, onBeforeUnmount, ref, type ComputedRef, type Ref } from 'vue'

export type CaptchaStatus = 'idle' | 'verifying' | 'success' | 'fail'

/** 失败后停留多久再自动换一张：够 recoil(140) + 回撤(420) + 一段能读完文案的停顿 */
export const CAPTCHA_FAILURE_RESET_DELAY = 1100

/** 失败第一拍（原地 recoil）的时长，第二拍（回撤）在它之后才开始，两段不叠 */
export const CAPTCHA_RECOIL_DURATION = 180

/** 判定动画的兜底时长：animationend 没来（被打断 / 减动效）时用它收尾 */
export const CAPTCHA_SETTLE_FALLBACK = 900

/** 减动效下判定动画不播，收尾只留一个可感知的最短停顿 */
export const CAPTCHA_SETTLE_FALLBACK_REDUCED = 160

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 两个验证码共用一套文案语气：人称用「你」，省略号用 `…` */
export function captchaTipText(status: CaptchaStatus, idleTip: string): string {
  switch (status) {
    case 'verifying':
      return '正在核验…'
    case 'success':
      return '验证通过'
    case 'fail':
      return '验证未通过，正在换一张…'
    default:
      return idleTip
  }
}

export interface CaptchaStateOptions {
  /** 失败停顿结束后换一张（组件传自己的 fetch） */
  onReset?: () => void
  failureResetDelay?: number
}

export interface CaptchaState {
  status: Ref<CaptchaStatus>
  isIdle: ComputedRef<boolean>
  isVerifying: ComputedRef<boolean>
  isSettled: ComputedRef<boolean>
  toIdle: () => void
  toVerifying: () => void
  toSuccess: () => void
  toFail: () => void
  clearStateTimers: () => void
}

export function useCaptchaState(options: CaptchaStateOptions = {}): CaptchaState {
  const status = ref<CaptchaStatus>('idle')
  let resetTimer: ReturnType<typeof setTimeout> | undefined

  const clearStateTimers = (): void => {
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = undefined
  }

  const toIdle = (): void => {
    clearStateTimers()
    status.value = 'idle'
  }

  const toVerifying = (): void => {
    clearStateTimers()
    status.value = 'verifying'
  }

  const toSuccess = (): void => {
    clearStateTimers()
    status.value = 'success'
  }

  const toFail = (): void => {
    clearStateTimers()
    status.value = 'fail'
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      options.onReset?.()
    }, options.failureResetDelay ?? CAPTCHA_FAILURE_RESET_DELAY)
  }

  onBeforeUnmount(clearStateTimers)

  return {
    status,
    isIdle: computed(() => status.value === 'idle'),
    isVerifying: computed(() => status.value === 'verifying'),
    isSettled: computed(() => status.value === 'success' || status.value === 'fail'),
    toIdle,
    toVerifying,
    toSuccess,
    toFail,
    clearStateTimers,
  }
}

/**
 * 判定动画的收尾计时器：animationend 先到就用 animationend，
 * 没到就用兜底 timer，两条路只会触发一次。
 */
export function useSettleSignal(onSettle: () => void): {
  arm: () => void
  fire: () => void
  disarm: () => void
} {
  let timer: ReturnType<typeof setTimeout> | undefined
  let armed = false

  const disarm = (): void => {
    if (timer) clearTimeout(timer)
    timer = undefined
    armed = false
  }

  const fire = (): void => {
    if (!armed) return
    disarm()
    onSettle()
  }

  const arm = (): void => {
    disarm()
    armed = true
    timer = setTimeout(
      fire,
      prefersReducedMotion() ? CAPTCHA_SETTLE_FALLBACK_REDUCED : CAPTCHA_SETTLE_FALLBACK
    )
  }

  onBeforeUnmount(disarm)

  return { arm, fire, disarm }
}
