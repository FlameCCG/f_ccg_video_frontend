import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

// Graphics Text Captcha Types
export interface GraphicsTextCaptcha {
  captchaID: string
  captchaB64: string
}

export interface GetGraphicsTextCaptchaParams {
  type?: 1 | 2 | 3 | 4 // 1=算术运算 2=数字字母混合 3=纯数字 4=纯字母
}

// Click Captcha Types
export interface ClickCaptcha {
  masterImage: string
  thumbImage: string
  token: string
}

// Slide Captcha Types
export interface SlideCaptcha {
  masterImage: string
  tileImage: string
  token: string
  thumbY: number
}

// Email Captcha Types
export interface SendEmailCaptchaParams {
  type: 1 | 2 | 3 // 1=注册 2=重置密码 3=绑定邮箱
  email: string
  captchaID?: string
  captchaCode?: string
  slideCaptchaToken?: string
  slideCaptchaX?: number
  slideCaptchaY?: number
}

export interface EmailCaptchaResult {
  emailID: string
}

// ============================================================================
// 4.1 验证码 API
// ============================================================================

/**
 * 获取图形验证码
 * GET /common/captcha/graphics-text
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取图形文字验证码
 */
export const getGraphicsTextCaptcha = (
  params?: GetGraphicsTextCaptchaParams
): Promise<GraphicsTextCaptcha> => {
  return request.get('/common/captcha/graphics-text', { params })
}

/**
 * 获取点击验证码
 * GET /common/captcha/click
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取点击式验证码（用于登录）
 */
export const getClickCaptcha = (): Promise<ClickCaptcha> => {
  return request.get('/common/captcha/click')
}

/**
 * 获取滑块验证码
 * GET /common/captcha/slide
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取滑块式验证码（用于注册）
 */
export const getSlideCaptcha = (): Promise<SlideCaptcha> => {
  return request.get('/common/captcha/slide')
}

/**
 * 发送邮箱验证码
 * POST /common/captcha/email
 * 认证: 无需登录
 * 依赖接口: 图形验证码接口、滑块验证码接口（启用时）
 * 接口说明: 发送邮箱验证码，用于注册、重置密码、绑定邮箱
 * 重要说明:
 * - 是否需要提交 captchaID/captchaCode，应根据 GET /common/site/config 返回的 data.site.register.textGraphicCaptcha 判断
 * - 是否需要提交 slideCaptchaToken/slideCaptchaX/slideCaptchaY，应根据 GET /common/site/config 返回的 data.site.register.slideCaptcha 判断
 */
export const sendEmailCaptcha = (params: SendEmailCaptchaParams): Promise<EmailCaptchaResult> => {
  return request.post('/common/captcha/email', params)
}
