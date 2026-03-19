import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 作品类型常量
 */
export const WorkType = {
  VIDEO: 1,
  DYNAMIC: 2,
} as const

export type WorkTypeValue = (typeof WorkType)[keyof typeof WorkType]

/**
 * 作者简要信息
 */
export interface AuthorBrief {
  id: number
  username: string
  avatar: string
}

/**
 * 视频简要信息
 */
export interface VideoBrief {
  id: number
  title: string
  cover: string
  duration: number
  isPinned: boolean
  pinnedAt: string | null
}

/**
 * 动态简要信息
 */
export interface DynamicBrief {
  id: number
  content: string
  imageUrl: string
  isPinned: boolean
  pinnedAt: string | null
}

/**
 * 动态项（完整信息）
 */
export interface DynamicItem {
  id: number
  userId: number
  content: string
  imageUrl: string
  isPinned: boolean
  createdAt: string
}

/**
 * 作品流项（视频或动态）
 */
export interface WorkFeedItem {
  workType: WorkTypeValue
  workId: number
  createdAt: string
  author: AuthorBrief
  video: VideoBrief | null
  dynamic: DynamicBrief | null
}

/**
 * 关注用户动态项
 */
export interface FollowUserItem {
  userId: number
  username: string
  avatar: string
  followedAt: string
  latestWorkAt: string
  latestWorkType: WorkTypeValue
  isUnread: boolean
}

/**
 * 发布动态请求参数
 */
export interface CreateDynamicParams {
  content: string
  imageUrl?: string
}

/**
 * 删除动态请求参数
 */
export interface DeleteDynamicParams {
  dynamicId: number
}

/**
 * 置顶动态请求参数
 */
export interface PinDynamicParams {
  dynamicId?: number
  videoId?: number
  pinned: boolean
}

/**
 * 动态列表请求参数
 */
export interface DynamicListParams {
  userId?: number
  type?: 0 | 1 | 2
  page?: number
  pageSize?: number
}

/**
 * 动态列表响应
 */
export interface DynamicListResult {
  list: WorkFeedItem[]
  total: number
}

/**
 * 关注用户动态请求参数
 */
export interface FollowsDynamicParams {
  page?: number
  pageSize?: number
}

/**
 * 关注用户动态响应
 */
export interface FollowsDynamicResult {
  list: FollowUserItem[]
  total: number
}

/**
 * 未读动态数量响应
 */
export interface DynamicCountsResult {
  unreadCount: number
}

/**
 * 标记动态已读请求参数
 */
export interface MarkDynamicReadParams {
  authorId: number
  page?: number
  pageSize?: number
}

/**
 * 标记动态已读响应
 */
export interface MarkDynamicReadResult {
  list: WorkFeedItem[]
  total: number
}

// ============================================================================
// 10.1 动态 API
// ============================================================================

/**
 * 发布动态
 * POST /common/dynamic/create
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 发布新动态（需登录）
 */
export const createDynamic = (params: CreateDynamicParams): Promise<DynamicItem> => {
  return request.post('/common/dynamic/create', params)
}

/**
 * 删除动态
 * DELETE /common/dynamic/delete
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 删除自己的动态（需登录）
 */
export const deleteDynamic = (params: DeleteDynamicParams): Promise<void> => {
  return request.delete('/common/dynamic/delete', { data: params })
}

/**
 * 置顶/取消置顶动态
 * PUT /common/dynamic/pin
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 置顶/取消置顶动态或视频（需登录）
 * 重要说明: dynamicId 与 videoId 至少传一个，由后端决定置顶的作品类型
 */
export const pinDynamic = (params: PinDynamicParams): Promise<void> => {
  return request.put('/common/dynamic/pin', params)
}

/**
 * 获取动态列表
 * GET /common/dynamic/list
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取动态列表（需登录）
 */
export const getDynamicList = (params?: DynamicListParams): Promise<DynamicListResult> => {
  return request.get('/common/dynamic/list', { params })
}

/**
 * 获取关注用户动态
 * GET /common/dynamic/follows
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取关注用户的动态列表（需登录）
 */
export const getFollowsDynamic = (params?: FollowsDynamicParams): Promise<FollowsDynamicResult> => {
  return request.get('/common/dynamic/follows', { params })
}

/**
 * 获取未读动态数量
 * GET /common/dynamic/counts
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取关注用户的未读动态数量（需登录）
 */
export const getDynamicCounts = (): Promise<DynamicCountsResult> => {
  return request.get('/common/dynamic/counts')
}

/**
 * 标记动态已读
 * POST /common/dynamic/read
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 标记指定作者的动态为已读（需登录）
 */
export const markDynamicRead = (params: MarkDynamicReadParams): Promise<MarkDynamicReadResult> => {
  return request.post('/common/dynamic/read', params)
}
