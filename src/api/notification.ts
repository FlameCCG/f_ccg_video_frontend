import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 通知类型常量
 */
export const NotificationType = {
  REPLY: 1,
  LIKE: 2,
  AT: 3,
  SYSTEM: 4,
} as const

export type NotificationTypeValue = (typeof NotificationType)[keyof typeof NotificationType]

/**
 * 通知类别
 */
export type NotificationCategory = 'all' | 'reply' | 'like' | 'at' | 'system'

/**
 * 通知项
 */
export interface NotificationItem {
  id: number
  type: NotificationTypeValue
  receiverID: number
  actionUserID: number
  actionUserAvatar: string
  actionUserName: string
  title: string
  content: string
  link: string
  articleID: number
  articleTitle: string
  commentID: number
  isRead: boolean
}

/**
 * 通知列表请求参数
 */
export interface NotificationListParams {
  page?: number
  pageSize?: number
  category?: NotificationCategory
}

/**
 * 通知列表响应
 */
export interface NotificationListResult {
  list: NotificationItem[]
  total: number
}

/**
 * 通知数量统计
 */
export interface NotificationCounts {
  reply: number
  like: number
  at: number
  system: number
  message: number
}

/**
 * 删除通知请求参数
 */
export interface DeleteNotificationParams {
  ids: number[]
}

/**
 * 标记已读请求参数
 */
export interface MarkReadParams {
  ids: number[]
}

// ============================================================================
// 8.1 通知 API
// ============================================================================

/**
 * 获取通知列表
 * GET /common/notification
 */
export const getNotificationList = (
  params?: NotificationListParams
): Promise<NotificationListResult> => {
  return request.get('/common/notification', { params })
}

/**
 * 删除通知
 * DELETE /common/notification
 */
export const deleteNotifications = (params: DeleteNotificationParams): Promise<void> => {
  return request.delete('/common/notification', { data: params })
}

/**
 * 获取通知数量统计
 * GET /common/notification/counts
 */
export const getNotificationCounts = (): Promise<NotificationCounts> => {
  return request.get('/common/notification/counts')
}

/**
 * 标记通知已读
 * PUT /common/notification/read
 */
export const markNotificationsRead = (params: MarkReadParams): Promise<void> => {
  return request.put('/common/notification/read', params)
}
