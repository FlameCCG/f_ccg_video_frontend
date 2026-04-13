export type CaptchaFailureType = 'graphic' | 'slide' | 'click' | 'interactive'

/** 优先读取服务端结构化字段，缺失时从 msg 解析。 */
export function getCaptchaFailureType(error: unknown): CaptchaFailureType | null {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data
    if (data && typeof data === 'object' && 'captchaType' in data) {
      const type = data.captchaType
      if (type === 'graphic' || type === 'slide' || type === 'click' || type === 'interactive') {
        return type
      }
    }
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (/图形验证码/.test(message)) return 'graphic'
  if (/滑块验证码/.test(message)) return 'slide'
  if (/文字点选|点选验证码|点击验证码/.test(message)) return 'click'
  return /^(?:交互验证码|验证码(?:错误|验证失败|已过期|已失效)|captcha (?:expired|verification)|invalid captcha payload)/i.test(
    message
  )
    ? 'interactive'
    : null
}

export function isInteractiveCaptchaFailure(error: unknown): boolean {
  const type = getCaptchaFailureType(error)
  return type !== null && type !== 'graphic'
}
