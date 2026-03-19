import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
}

// ============================================================================
// Comment Types
// ============================================================================

/**
 * 评论项
 */
export interface CommentItem {
  id: number
  userId: number
  username: string
  avatar: string
  content: string
  likeCount: number
  replyCount: number
  isPinned: boolean
  pinnedAt: string | null
  isLiked: boolean
  createdAt: string
  atUserIds?: number[]
  parentId?: number
  rootId?: number
  replyTo?: {
    userId: number
    username: string
  }
}

/**
 * 评论列表请求参数
 */
export interface CommentListParams extends PaginationParams {
  videoId?: number
  dynamicId?: number
  sortBy?: 'time' | 'hot'
}

/**
 * 回复列表请求参数
 */
export interface ReplyListParams extends PaginationParams {
  rootId: number
}

/**
 * 发表评论请求参数
 */
export interface CreateCommentParams {
  videoId?: number
  dynamicId?: number
  content: string
  parentId?: number
  atUserIds?: number[]
}

/**
 * 删除评论请求参数
 */
export interface DeleteCommentParams {
  commentId: number
}

/**
 * 点赞评论请求参数
 */
export interface LikeCommentParams {
  commentId: number
}

/**
 * 点赞评论响应
 */
export interface LikeCommentResult {
  likeCount: number
  isLiked: boolean
}

/**
 * 置顶评论请求参数
 */
export interface PinCommentParams {
  commentId: number
  pinned?: boolean
}

/**
 * 创作者评论列表请求参数
 */
export interface CreatorCommentListParams extends PaginationParams {
  sort?: 0 | 1 | 2 // 0 最近 1 点赞最多 2 回复最多
  keyword?: string
}

export interface CreatorCommentItem extends CommentItem {
  videoId?: number
  dynamicId?: number
  videoTitle?: string
  videoCover?: string
  commenterAddr?: string
}

// ============================================================================
// Comment API
// ============================================================================

/**
 * 获取评论列表
 * GET /common/comment/list
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取视频或动态的评论列表
 * 重要说明: videoId 与 dynamicId 二选一
 */
export const getCommentList = (
  params: CommentListParams
): Promise<PaginatedResult<CommentItem>> => {
  return request.get('/common/comment/list', { params })
}

/**
 * 获取回复列表
 * GET /common/comment/replies
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取评论的回复列表
 */
export const getReplyList = (params: ReplyListParams): Promise<PaginatedResult<CommentItem>> => {
  return request.get('/common/comment/replies', { params })
}

/**
 * 发表评论
 * POST /common/comment/create
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 发表评论或回复（需登录）
 * 重要说明: videoId 与 dynamicId 二选一；回复时传 parentId
 */
export const createComment = (params: CreateCommentParams): Promise<CommentItem> => {
  return request.post('/common/comment/create', params)
}

/**
 * 删除评论
 * DELETE /common/comment/delete
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 删除自己的评论（需登录）
 */
export const deleteComment = (params: DeleteCommentParams): Promise<void> => {
  return request.delete('/common/comment/delete', { data: params })
}

/**
 * 点赞/取消点赞评论
 * POST /common/comment/like
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 点赞/取消点赞评论（需登录）
 */
export const toggleCommentLike = (params: LikeCommentParams): Promise<LikeCommentResult> => {
  return request.post('/common/comment/like', params)
}

/**
 * 置顶/取消置顶评论
 * PUT /common/comment/pin
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 作品作者置顶/取消置顶评论（需登录）
 */
export const toggleCommentPin = (params: PinCommentParams): Promise<void> => {
  return request.put('/common/comment/pin', params)
}

/**
 * 获取创作者评论列表
 * GET /common/comment/creator/list
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取自己视频下的评论列表（需登录）
 * 重要说明: sort 可选 0=最近、1=点赞最多、2=回复最多
 */
export const getCreatorCommentList = (
  params?: CreatorCommentListParams
): Promise<PaginatedResult<CreatorCommentItem>> => {
  return request.get('/common/comment/creator/list', { params })
}
