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
 */
export const followUser = (params: FocusParams): Promise<void> => {
  return request.post('/common/social/focus', params)
}

/**
 * 取消关注
 * DELETE /common/social/focus
 */
export const unfollowUser = (params: FocusParams): Promise<void> => {
  return request.delete('/common/social/focus', { data: params })
}

/**
 * 获取关注列表
 * GET /common/social/{id}/focus
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
 */
export const getRelation = (id: number): Promise<RelationInfo> => {
  return request.get(`/common/social/${id}/relation`)
}
