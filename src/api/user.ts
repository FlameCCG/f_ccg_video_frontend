import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

// Auth Types
export interface ClickCaptchaPoint {
  index: number
  x: number
  y: number
}

export interface LoginPwdParams {
  username: string
  password: string
  captchaToken?: string
  captchaDots?: ClickCaptchaPoint[]
}

export interface LoginQQParams {
  code: string
}

export interface RefreshTokenParams {
  refreshToken: string
}

export interface RegisterEmailParams {
  username: string
  password: string
  email: string
  emailID?: string
  emailCode?: string
  slideCaptchaToken?: string
  slideCaptchaX?: number
  slideCaptchaY?: number
}

export interface ResetPasswordParams {
  emailID: string
  emailCode: string
  email: string
  newPassword: string
}

export interface ChangePasswordParams {
  oldPassword: string
  newPassword: string
}

export interface JwtToken {
  accessToken: string
  refreshToken: string
}

// User Info Types
export interface UserInfo {
  id: number
  username: string
  email: string
  avatar: string
  bannerUrl: string
  description: string
  gender: number
  birthday: string
  level: number
  exp: number
  coinCount: number
  followCount: number
  fansCount: number
  dynamicCount: number
  registerSource: string
}

export interface UserDetail {
  id: number
  username: string
  avatar: string
  bannerUrl: string
  description: string
  gender: number
  birthday: string
  level: number
  exp: number
  followCount: number
  fansCount: number
  totalLikes: number
  totalViews: number
}

export interface UpdateUserInfoParams {
  username?: string
  avatar?: string
  description?: string
  gender?: number
  birthday?: string
}

// User Search Types
export interface SearchHighlight {
  [key: string]: string[]
}

export interface SearchUserHit {
  id: number
  username: string
  avatar: string
  highlight: SearchHighlight
  level: number
  followerCount: number
}

export interface UserSearchResult {
  userTotal: number
  users: SearchUserHit[]
}

export const UserSortType = {
  Relevance: 0,
  FollowerCount: 1,
  Level: 2,
  CreatedAt: 3,
} as const

export type UserSortValue = (typeof UserSortType)[keyof typeof UserSortType]

export interface SearchUserParams {
  keyword: string
  page?: number
  pageSize?: number
  userSort?: UserSortValue
  userOrder?: number
}

// Mention Types
export interface MentionUser {
  id: number
  username: string
  avatar: string
  followerCount: number
  isFriend: boolean
}

export interface MentionSuggestParams {
  keyword?: string
  page?: number
  pageSize?: number
  partitionId?: number
}

export interface MentionSuggestResult {
  list: MentionUser[]
  total: number
}

// User Config Types
export interface UserConfig {
  openCollect: boolean
  openFans: boolean
  openFollow: boolean
  openLike?: boolean // 文档响应示例保留该字段，作为 openLikeVideo 的兼容读字段
  openLikeVideo: boolean
  openCoinVideo: boolean
  homeStyleID: number
  bannerId: number
  bannerUrl: string
  likeTags: string[]
}

export interface UpdateUserConfigParams {
  openCollect?: boolean
  openFans?: boolean
  openFollow?: boolean
  openLikeVideo?: boolean
  openCoinVideo?: boolean
  homeStyleID?: number
  bannerId?: number
  bannerUrl?: string
  likeTags?: string[]
}

export interface BindEmailParams {
  emailID: string
  emailCode: string
  email: string
}

export interface BannerUploadResult {
  bannerUrl: string
}

// User Record Types
export interface UserLoginRecordItem {
  id: number
  ip: string
  addr: string
  userAgent: string
  loginType: string
  createdAt: string
}

export interface UserExpRecordItem {
  id: number
  delta: number
  reason: string
  createdAt: string
}

export interface UserCoinRecordItem {
  id: number
  delta: number
  reason: string
  createdAt: string
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
}

// Creator Analytics Types
export type CreatorAnalyticsRange = '7d' | '30d' | 'month'

export type CreatorAnalyticsType = 'fans' | 'views' | 'comments' | 'coins' | 'danmu' | 'favorites'

export interface CreatorOverview {
  fans: number
  views: number
  comments: number
  coins: number
  danmu: number
  favorites: number
}

export interface CreatorAnalyticsTrendResult {
  range: CreatorAnalyticsRange
  type: CreatorAnalyticsType
  x: string[]
  values: number[]
  total: number
}

export interface CreatorAnalyticsQueryParams {
  range?: CreatorAnalyticsRange
  type?: CreatorAnalyticsType
}

// User Video Types
export interface UserVideoItem {
  id: number
  title: string
  cover: string
  views: number
  danmuCount: number
  duration: number
  progress: number
  createdAt: string
  status: number
  statusText: string
  auditStatus?: number
  auditStatusText?: string
  authorId: number
  authorName: string
}

export interface UserVideoListParams {
  userId: number
  page?: number
  pageSize?: number
  sort?: 0 | 1 | 2
  auditStatus?: number // 1已发布 2私密 3已删除 4审核中
}

export interface DeleteVideoParams {
  videoId: number
}

export interface CreateTagParams {
  name: string
}

export interface Tag {
  id: number
  name: string
}

// ============================================================================
// 3.1 用户认证 API
// ============================================================================

/**
 * 用户名密码登录
 * POST /common/user/login/pwd
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 点击验证码接口（启用时）
 * 接口说明: 使用用户名/邮箱和密码登录，需要先通过点击验证码
 * 重要说明: 是否需要提交 captchaToken/captchaDots，应根据 GET /common/site/config 返回的 data.site.login.textClickCaptcha 判断
 */
export const loginByPassword = (params: LoginPwdParams): Promise<JwtToken> => {
  return request.post('/common/user/login/pwd', params)
}

/**
 * QQ登录
 * POST /common/user/login/qq
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 使用 QQ 授权码登录，未注册用户会自动注册
 */
export const loginByQQ = (params: LoginQQParams): Promise<JwtToken> => {
  return request.post('/common/user/login/qq', params)
}

/**
 * 刷新Token
 * POST /common/user/login/refresh
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 登录接口获取 refreshToken
 * 接口说明: 使用 refreshToken 刷新访问令牌
 */
export const refreshToken = (params: RefreshTokenParams): Promise<JwtToken> => {
  return request.post('/common/user/login/refresh', params)
}

/**
 * 邮箱注册
 * POST /common/user/register/email
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 邮箱验证码接口、滑块验证码接口（启用时）
 * 接口说明: 通过邮箱注册新用户，需要先通过滑块验证码和邮箱验证码
 * 重要说明:
 * - 是否需要提交 emailID/emailCode，应根据 GET /common/site/config 返回的 data.site.register.emailCaptcha 判断
 * - 是否需要提交 slideCaptchaToken/slideCaptchaX/slideCaptchaY，应根据 GET /common/site/config 返回的 data.site.register.slideCaptcha 判断
 */
export const registerByEmail = (params: RegisterEmailParams): Promise<void> => {
  return request.post('/common/user/register/email', params)
}

/**
 * 忘记密码重置
 * POST /common/user/password/reset
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 邮箱验证码接口
 * 接口说明: 通过邮箱验证码重置密码（验证码类型 2）
 * 重要说明: 当前实现始终校验邮箱验证码，不受 GET /common/site/config 返回的 data.site.register.emailCaptcha 影响
 */
export const resetPassword = (params: ResetPasswordParams): Promise<void> => {
  return request.post('/common/user/password/reset', params)
}

/**
 * 修改密码
 * PUT /common/user/password/change
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 修改当前用户密码（需登录）
 */
export const changePassword = (params: ChangePasswordParams): Promise<void> => {
  return request.put('/common/user/password/change', params)
}

// ============================================================================
// 3.2 用户信息 API
// ============================================================================

/**
 * 获取当前用户信息
 * GET /common/user/info
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前登录用户的详细信息（需登录）
 */
export const getCurrentUserInfo = (): Promise<UserInfo> => {
  return request.get('/common/user/info')
}

/**
 * 更新用户信息
 * PUT /common/user/info
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 更新当前登录用户的信息（需登录）
 */
export const updateUserInfo = (params: UpdateUserInfoParams): Promise<void> => {
  return request.put('/common/user/info', params)
}

/**
 * 获取用户详情
 * GET /common/user/{id}
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 根据用户 ID 获取用户公开信息
 */
export const getUserDetail = (id: number): Promise<UserDetail> => {
  return request.get(`/common/user/${id}`)
}

/**
 * 搜索用户
 * GET /common/user/search
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 根据关键词搜索用户
 */
export const searchUsers = (params: SearchUserParams): Promise<UserSearchResult> => {
  return request.get('/common/user/search', { params })
}

/**
 * @联想用户
 * GET /common/user/mention/suggest
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 提供评论 @ 联想功能，按好友优先返回关注列表（需登录）
 */
export const getMentionSuggest = (params?: MentionSuggestParams): Promise<MentionSuggestResult> => {
  return request.get('/common/user/mention/suggest', { params })
}

// ============================================================================
// 3.3 用户配置 API
// ============================================================================

/**
 * 获取用户配置
 * GET /common/user/info/conf
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前登录用户的隐私配置（需登录）
 */
export const getUserConfig = (): Promise<UserConfig> => {
  return request.get('/common/user/info/conf')
}

/**
 * 更新用户配置
 * PUT /common/user/info/conf
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 更新当前登录用户的隐私配置（需登录）
 * 重要说明: bannerId 与 bannerUrl 不能同时传
 */
export const updateUserConfig = (params: UpdateUserConfigParams): Promise<void> => {
  return request.put('/common/user/info/conf', params)
}

/**
 * 绑定邮箱
 * POST /common/user/email/bind
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 邮箱验证码接口
 * 接口说明: 绑定邮箱（需登录，邮箱验证码类型 3）
 * 重要说明: 当前实现始终校验邮箱验证码，不受 GET /common/site/config 返回的 data.site.register.emailCaptcha 影响
 */
export const bindEmail = (params: BindEmailParams): Promise<void> => {
  return request.post('/common/user/email/bind', params)
}

/**
 * 上传用户主页横幅
 * POST /common/user/banner/upload
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 上传用户主页横幅图片（需登录）
 */
export const uploadUserBanner = (fileHash: string, banner: File): Promise<BannerUploadResult> => {
  const formData = new FormData()
  formData.append('fileHash', fileHash)
  formData.append('banner', banner)
  return request.post('/common/user/banner/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

// ============================================================================
// 3.4 用户记录 API
// ============================================================================

/**
 * 登录IP记录
 * GET /common/user/record/login-ip
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前用户登录 IP 记录（需登录）
 */
export const getLoginIpRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserLoginRecordItem>> => {
  return request.get('/common/user/record/login-ip', { params })
}

/**
 * 经验记录
 * GET /common/user/record/exp
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前用户经验记录（需登录）
 */
export const getExpRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserExpRecordItem>> => {
  return request.get('/common/user/record/exp', { params })
}

/**
 * 硬币记录
 * GET /common/user/record/coin
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前用户硬币记录（需登录）
 */
export const getCoinRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserCoinRecordItem>> => {
  return request.get('/common/user/record/coin', { params })
}

/**
 * 创作者总览
 * GET /common/user/creator/overview
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 返回播放/粉丝/评论/硬币/弹幕/收藏六项总量（需登录）
 */
export const getCreatorOverview = (): Promise<CreatorOverview> => {
  return request.get('/common/user/creator/overview')
}

/**
 * 创作者数据分析
 * GET /common/user/creator/analytics
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 按指标类型返回单个趋势序列，支持近 7 天 / 近 30 天 / 自然月（需登录）
 */
export const getCreatorAnalytics = (
  params?: CreatorAnalyticsQueryParams
): Promise<CreatorAnalyticsTrendResult> => {
  return request.get('/common/user/creator/analytics', { params })
}

// ============================================================================
// 3.5 用户视频 API
// ============================================================================

/**
 * 用户视频列表
 * GET /common/user/video/list
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定用户的视频列表
 * 重要说明: sort 可选 0=最新、1=最多播放、2=最多收藏
 */
export const getUserVideoList = (
  params: UserVideoListParams
): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/list', { params })
}

/**
 * 最近点赞的视频
 * GET /common/user/video/recent/liked
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定用户最近点赞的 10 条视频
 */
export const getRecentLikedVideos = (userID: number): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/recent/liked', { params: { userID } })
}

/**
 * 最近投币的视频
 * GET /common/user/video/recent/coined
 * 认证: 可选登录（客户端可携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取指定用户最近投币的 10 条视频
 */
export const getRecentCoinedVideos = (userID: number): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/recent/coined', { params: { userID } })
}

/**
 * 删除视频
 * DELETE /common/user/video/delete
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 用户删除自己的视频（逻辑删除，需登录）
 */
export const deleteVideo = (params: DeleteVideoParams): Promise<void> => {
  return request.delete('/common/user/video/delete', { data: params })
}

/**
 * 创建标签
 * POST /common/user/video/tag
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 用户创建视频标签（需登录）
 */
export const createTag = (params: CreateTagParams): Promise<Tag> => {
  return request.post('/common/user/video/tag', params)
}
