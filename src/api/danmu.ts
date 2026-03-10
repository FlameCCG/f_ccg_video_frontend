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

// ============================================================================
// 5.8 弹幕 API
// ============================================================================

/**
 * 发送弹幕
 * POST /common/video/danmu/send
 */
export const sendDanmu = (params: SendDanmuParams): Promise<DanmuItem> => {
  return request.post('/common/video/danmu/send', params)
}

/**
 * 点赞弹幕
 * POST /common/video/danmu/like
 */
export const likeDanmu = (danmuId: number): Promise<LikeDanmuResult> => {
  return request.post('/common/video/danmu/like', { danmuId })
}

/**
 * 删除弹幕
 * DELETE /common/video/danmu
 */
export const deleteDanmu = (params: DeleteDanmuParams): Promise<void> => {
  return request.delete('/common/video/danmu', { data: params })
}

/**
 * 历史弹幕
 * GET /common/video/danmu/history
 */
export const getDanmuHistory = (
  params: DanmuHistoryParams
): Promise<PaginatedResult<DanmuItem>> => {
  return request.get('/common/video/danmu/history', { params })
}

/**
 * 弹幕列表
 * GET /common/video/danmu/room/list
 */
export const getDanmuList = (params: DanmuListParams): Promise<PaginatedResult<DanmuItem>> => {
  return request.get('/common/video/danmu/room/list', { params })
}

/**
 * 弹幕WebSocket URL
 * GET /common/video/danmu/ws
 * Note: This returns the WebSocket URL for connection, not an actual API call
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
 */
export const reportDanmu = (params: ReportDanmuParams): Promise<void> => {
  return request.post('/common/video/danmu/report', params)
}
