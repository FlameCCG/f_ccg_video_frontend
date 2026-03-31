import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

// Login Config
export interface LoginConfig {
  qqLogin: boolean
  googleLogin?: boolean
  usernamePwdLogin: boolean
  textGraphicCaptcha: boolean
  textClickCaptcha: boolean
  textClickCaptchaTTL: number
  textClickCaptchaPadding: number
}

// Register Config
export interface RegisterConfig {
  emailCaptcha: boolean
  textGraphicCaptcha: boolean
  slideCaptcha: boolean
  slideCaptchaTTL: number
  slideCaptchaPadding: number
}

// Storage Config
export interface StorageConfig {
  maxChunkSize: number
  chunkSize: number
  maxFileSize: number
  maxUploadNum: number
}

// Content Review Config
export interface ContentReviewConfig {
  enable: boolean
}

// Site Config
export interface SiteConfig {
  login: LoginConfig
  register: RegisterConfig
  storage: StorageConfig
  contentReview: ContentReviewConfig
}

// Site Config Response
export interface SiteConfigResult {
  site: SiteConfig
}

// Site Touch Result (打点结果)
export interface SiteTouchResult {
  pv: number
  uv: number
  online: number
}

// Site Heartbeat Result (心跳结果)
export interface SiteHeartbeatResult {
  uv: number
  online: number
}

// ============================================================================
// Site API
// ============================================================================

/**
 * 获取QQ登录URL
 * GET /common/site/qq-url
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取 QQ OAuth 登录跳转 URL
 */
export const getQQLoginUrl = (): Promise<string> => {
  return request.get('/common/site/qq-url')
}

/**
 * 获取Google登录URL
 * GET /common/site/google-url
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取 Google OAuth 登录跳转 URL
 */
export const getGoogleLoginUrl = (): Promise<string> => {
  return request.get('/common/site/google-url')
}

/**
 * 获取站点配置
 * GET /common/site/config
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 获取站点公开配置（不返回存储敏感信息）
 * 重要说明:
 * - 前端应以本接口返回的配置决定是否展示验证码组件，以及后续请求是否需要提交验证码字段
 * - 注册相关开关查看 data.site.register.*
 * - 登录相关开关查看 data.site.login.*
 */
export const getSiteConfig = (): Promise<SiteConfigResult> => {
  return request.get('/common/site/config', { silent: true })
}

/**
 * 站点打点
 * POST /common/site/stat/touch
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 增加站点流量（PV）并统计今日 UV（含游客）；若已登录则当日首次打点时发放登录经验
 */
export const touchSiteStat = (): Promise<SiteTouchResult> => {
  return request.post('/common/site/stat/touch', undefined, { silent: true })
}

/**
 * 在线心跳
 * POST /common/site/stat/heartbeat
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 维护 UV 与在线人数，不增加 PV（支持游客）
 */
export const sendHeartbeat = (): Promise<SiteHeartbeatResult> => {
  return request.post('/common/site/stat/heartbeat', undefined, { silent: true })
}
