import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

// Login Config
export interface LoginConfig {
  qqLogin: boolean
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
 * 无需登录
 */
export const getQQLoginUrl = (): Promise<string> => {
  return request.get('/common/site/qq-url')
}

/**
 * 获取站点配置
 * GET /common/site/config
 * 无需登录
 */
export const getSiteConfig = (): Promise<SiteConfigResult> => {
  return request.get('/common/site/config')
}

/**
 * 站点打点
 * POST /common/site/stat/touch
 * 可选登录（客户端可携带 Token）
 * 增加站点流量（PV）并统计今日 UV（含游客）
 * 若已登录则当日首次打点时发放登录经验
 */
export const touchSiteStat = (): Promise<SiteTouchResult> => {
  return request.post('/common/site/stat/touch')
}

/**
 * 在线心跳
 * POST /common/site/stat/heartbeat
 * 可选登录（客户端可携带 Token）
 * 维护 UV 与在线人数，不增加 PV（支持游客）
 */
export const sendHeartbeat = (): Promise<SiteHeartbeatResult> => {
  return request.post('/common/site/stat/heartbeat')
}
