import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 社交用户信息
 */
export interface SocialUserInfo {
  id: number
  username: string
  avatar: string
  description: string
  level: number
}

/**
 * 关注/粉丝列表结果
 */
export interface SocialListResult {
  list: SocialUserInfo[]
  total: number
}

/**
 * 关注关系
 */
export interface RelationInfo {
  isFocus: boolean
  isFans: boolean
  isMutualFollow: boolean
}

/**
 * 分页参数
 */
export interface SocialPaginationParams {
  page?: number
  pageSize?: number
  keyword?: string
}

/**
 * 关注/取消关注参数
 */
export interface FocusParams {
  focusUserId: number
}

// ============================================================================
// 7.1 社交 API
// ============================================================================

/**
 * 关注用户
 * POST /common/social/focus
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 关注指定用户（需登录）
 */
export const followUser = (params: FocusParams): Promise<void> => {
  return request.post('/common/social/focus', params)
}

/**
 * 取消关注
 * DELETE /common/social/focus
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 取消关注指定用户（需登录）
 */
export const unfollowUser = (params: FocusParams): Promise<void> => {
  return request.delete('/common/social/focus', { data: params })
}

/**
 * 获取关注列表
 * GET /common/social/{id}/focus
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定用户的关注列表（需登录）
 */
export const getFollowingList = (
  id: number,
  params?: SocialPaginationParams
): Promise<SocialListResult> => {
  return request.get(`/common/social/${id}/focus`, { params })
}

/**
 * 获取粉丝列表
 * GET /common/social/{id}/fans
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定用户的粉丝列表（需登录）
 */
export const getFansList = (
  id: number,
  params?: SocialPaginationParams
): Promise<SocialListResult> => {
  return request.get(`/common/social/${id}/fans`, { params })
}

/**
 * 查询关注关系
 * GET /common/social/{id}/relation
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 查询与指定用户的关注关系（需登录）
 */
export const getRelation = (id: number): Promise<RelationInfo> => {
  return request.get(`/common/social/${id}/relation`)
}
