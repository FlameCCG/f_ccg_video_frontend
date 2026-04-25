import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

export const DanmuPosition = {
  SCROLL: 0,
  TOP: 1,
  BOTTOM: 2,
} as const

export type DanmuPositionType = (typeof DanmuPosition)[keyof typeof DanmuPosition]

export interface DanmuItem {
  id: number
  videoId: number
  videoPartId: number
  userId: number
  content: string
  timeOffset: number // milliseconds
  color: string
  fontSize: number
  position: DanmuPositionType
  likeCount: number
  isLiked: boolean
  createdAt: string
}

export interface SendDanmuParams {
  videoId: number
  partId?: number
  content: string
  timeOffset: number // milliseconds
  color?: string
  fontSize?: number
  position?: DanmuPositionType
}

export interface LikeDanmuResult {
  likeCount: number
  isLiked: boolean
}

export interface DeleteDanmuParams {
  danmuId: number
}

export interface DanmuHistoryParams {
  videoId: number
  partId?: number
  start?: number // milliseconds
  end?: number // milliseconds
  limit?: number
}

export interface DanmuListParams {
  videoId: number
  partId?: number
  page?: number
  pageSize?: number
  date?: string // YYYY-MM-DD
}

export interface CreatorDanmuItem {
  id: number
  userId: number
  username: string
  avatar: string
  videoId: number
  videoTitle: string
  videoCover: string
  videoPartId: number
  content: string
  timeOffset: number // seconds (for creator danmaku, the docs say it's seconds, but verify if milliseconds. Docs say '弹幕时间偏移（秒）')
  color: string
  fontSize: number
  position: DanmuPositionType
  likeCount: number
  createdAt: string
}

export interface CreatorDanmuListParams {
  page?: number
  pageSize?: number
  sort?: 0 | 1 // 0: 最近, 1: 点赞最多
  keyword?: string
}

export interface ReportDanmuParams {
  danmuId: number
  reason: string
  detail?: string
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
}

export interface PlayerDanmuPayload {
  id?: number
  text: string
  time: number
  color: string
  mode: 0 | 1 | 2
  likeCount?: number
  isLiked?: boolean
  createdAt?: string
  isSelf?: boolean
}

export const danmuMillisecondsToSeconds = (timeOffset: number): number => {
  if (!Number.isFinite(timeOffset) || timeOffset < 0) return 0
  return timeOffset / 1000
}

export const danmuSecondsToMilliseconds = (time: number): number => {
  if (!Number.isFinite(time) || time < 0) return 0
  return Math.round(time * 1000)
}

// ============================================================================
// 5.8 弹幕 API
// ============================================================================

/**
 * 发送弹幕
 * POST /common/video/danmu/send
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 发送弹幕（需登录）
 */
export const sendDanmu = (params: SendDanmuParams): Promise<DanmuItem> => {
  return request.post('/common/video/danmu/send', params)
}

/**
 * 点赞弹幕
 * POST /common/video/danmu/like
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 点赞/取消点赞弹幕（需登录）
 */
export const likeDanmu = (danmuId: number): Promise<LikeDanmuResult> => {
  return request.post('/common/video/danmu/like', { danmuId })
}

/**
 * 删除弹幕
 * DELETE /common/video/danmu
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 用户删除自己的弹幕（需登录）
 */
export const deleteDanmu = (params: DeleteDanmuParams): Promise<void> => {
  return request.delete('/common/video/danmu', { data: params })
}

/**
 * 历史弹幕
 * GET /common/video/danmu/history
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定时间段的历史弹幕
 */
export const getDanmuHistory = (
  params: DanmuHistoryParams
): Promise<PaginatedResult<DanmuItem>> => {
  return request.get('/common/video/danmu/history', { params })
}

/**
 * 弹幕列表
 * GET /common/video/danmu/room/list
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取房间弹幕列表（按发送时间升序）
 */
export const getDanmuList = (params: DanmuListParams): Promise<PaginatedResult<DanmuItem>> => {
  return request.get('/common/video/danmu/room/list', { params })
}

/**
 * 创作者弹幕列表
 * GET /common/video/danmu/creator/list
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取自己视频下的弹幕列表（需登录）
 */
export const getCreatorDanmuList = (
  params: CreatorDanmuListParams
): Promise<PaginatedResult<CreatorDanmuItem>> => {
  return request.get('/common/video/danmu/creator/list', { params })
}

/**
 * 弹幕WebSocket URL
 * GET /common/video/danmu/ws
 * 认证: 无需登录
 * 依赖接口: 无
 * 接口说明: 弹幕实时推送 WebSocket 连接
 * 重要说明:
 * - 该 helper 返回连接地址，不会发起 HTTP 请求
 * - videoId 为必填；分 P 视频应传 partId；token 为可选登录态透传
 */
export const getDanmuWebSocketUrl = (videoId: number, partId?: number, token?: string): string => {
  const baseUrl = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  let url = `${baseUrl}//${host}/v1/common/video/danmu/ws?videoId=${videoId}`
  if (partId !== undefined) {
    url += `&partId=${partId}`
  }
  if (token) {
    url += `&token=${token}`
  }
  return url
}

/**
 * 举报弹幕
 * POST /common/video/danmu/report
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 举报弹幕（需登录）
 */
export const reportDanmu = (params: ReportDanmuParams): Promise<void> => {
  return request.post('/common/video/danmu/report', params)
}
