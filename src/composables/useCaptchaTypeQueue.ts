import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { getCaptchaType, type CaptchaScene, type CaptchaType } from '@/api/captcha'

/** 每个场景保存下一次类型；消费当前结果后由弹窗开启回调补货。 */
export function useCaptchaTypeQueue(scene: () => CaptchaScene) {
  const ready = shallowRef(false)
  let nextType: CaptchaType | null = null
  let pending: Promise<void> | null = null
  let generation = 0

  function reset(): void {
    generation += 1
    nextType = null
    pending = null
    ready.value = false
  }

  function prefetch(): Promise<void> {
    if (nextType !== null) return Promise.resolve()
    if (pending) return pending
    const current = generation
    const request = getCaptchaType(scene())
      .then(({ type }) => {
        if (current !== generation) return
        if (!['none', 'click', 'slide'].includes(type)) throw new Error('验证码类型无效，请重试')
        nextType = type
        ready.value = true
      })
      .finally(() => {
        if (current === generation) pending = null
      })
    pending = request
    return request
  }

  function warmup(): void {
    void prefetch().catch(() => {
      /* 首次操作可重试；后台预取失败不打断当前验证。 */
    })
  }

  async function take(): Promise<CaptchaType> {
    const current = generation
    await prefetch()
    if (current !== generation || nextType === null) throw new Error('验证码已切换，请重试')
    const result = nextType
    nextType = null
    ready.value = false
    return result
  }

  watch(scene, reset)
  onBeforeUnmount(reset)
  return { ready, take, warmup, reset }
}
