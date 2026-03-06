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
  captchaToken: string
  captchaDots: ClickCaptchaPoint[]
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
  emailID: string
  emailCode: string
  slideCaptchaToken: string
  slideCaptchaX: number
  slideCaptchaY: number
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

export interface SearchUserParams {
  keyword: string
  page?: number
  pageSize?: number
  userSort?: number
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
  openLikeVideo: boolean
  openLikeArticle: boolean
  openCoinVideo: boolean
  openCoinArticle: boolean
  openFollowAnime: boolean
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
  openLikeArticle?: boolean
  openCoinVideo?: boolean
  openCoinArticle?: boolean
  openFollowAnime?: boolean
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
export interface CreatorAnalyticsTotals {
  fans: number
  views: number
  comments: number
  coins: number
  danmu: number
  favorites: number
}

export interface CreatorAnalyticsResult {
  range: string
  x: string[]
  fans: number[]
  views: number[]
  comments: number[]
  coins: number[]
  danmu: number[]
  favorites: number[]
  total: CreatorAnalyticsTotals
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
  authorId: number
  authorName: string
}

export interface UserVideoListParams {
  userId: number
  page?: number
  pageSize?: number
  sort?: number
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
 */
export const loginByPassword = (params: LoginPwdParams): Promise<JwtToken> => {
  return request.post('/common/user/login/pwd', params)
}

/**
 * QQ登录
 * POST /common/user/login/qq
 */
export const loginByQQ = (params: LoginQQParams): Promise<JwtToken> => {
  return request.post('/common/user/login/qq', params)
}

/**
 * 刷新Token
 * POST /common/user/login/refresh
 */
export const refreshToken = (params: RefreshTokenParams): Promise<JwtToken> => {
  return request.post('/common/user/login/refresh', params)
}

/**
 * 邮箱注册
 * POST /common/user/register/email
 */
export const registerByEmail = (params: RegisterEmailParams): Promise<void> => {
  return request.post('/common/user/register/email', params)
}

/**
 * 忘记密码重置
 * POST /common/user/password/reset
 */
export const resetPassword = (params: ResetPasswordParams): Promise<void> => {
  return request.post('/common/user/password/reset', params)
}

/**
 * 修改密码
 * PUT /common/user/password/change
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
 */
export const getCurrentUserInfo = (): Promise<UserInfo> => {
  return request.get('/common/user/info')
}

/**
 * 更新用户信息
 * PUT /common/user/info
 */
export const updateUserInfo = (params: UpdateUserInfoParams): Promise<void> => {
  return request.put('/common/user/info', params)
}

/**
 * 获取用户详情
 * GET /common/user/{id}
 */
export const getUserDetail = (id: number): Promise<UserDetail> => {
  return request.get(`/common/user/${id}`)
}

/**
 * 搜索用户
 * GET /common/user/search
 */
export const searchUsers = (params: SearchUserParams): Promise<UserSearchResult> => {
  return request.get('/common/user/search', { params })
}

/**
 * @联想用户
 * GET /common/user/mention/suggest
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
 */
export const getUserConfig = (): Promise<UserConfig> => {
  return request.get('/common/user/info/conf')
}

/**
 * 更新用户配置
 * PUT /common/user/info/conf
 */
export const updateUserConfig = (params: UpdateUserConfigParams): Promise<void> => {
  return request.put('/common/user/info/conf', params)
}

/**
 * 绑定邮箱
 * POST /common/user/email/bind
 */
export const bindEmail = (params: BindEmailParams): Promise<void> => {
  return request.post('/common/user/email/bind', params)
}

/**
 * 上传用户主页横幅
 * POST /common/user/banner/upload
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
 */
export const getLoginIpRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserLoginRecordItem>> => {
  return request.get('/common/user/record/login-ip', { params })
}

/**
 * 经验记录
 * GET /common/user/record/exp
 */
export const getExpRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserExpRecordItem>> => {
  return request.get('/common/user/record/exp', { params })
}

/**
 * 硬币记录
 * GET /common/user/record/coin
 */
export const getCoinRecords = (
  params?: PaginationParams
): Promise<PaginatedResult<UserCoinRecordItem>> => {
  return request.get('/common/user/record/coin', { params })
}

/**
 * 创作者数据分析
 * GET /common/user/creator/analytics
 */
export const getCreatorAnalytics = (
  range?: '7d' | '30d' | 'month'
): Promise<CreatorAnalyticsResult> => {
  return request.get('/common/user/creator/analytics', { params: { range } })
}

// ============================================================================
// 3.5 用户视频 API
// ============================================================================

/**
 * 用户视频列表
 * GET /common/user/video/list
 */
export const getUserVideoList = (
  params: UserVideoListParams
): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/list', { params })
}

/**
 * 最近点赞的视频
 * GET /common/user/video/recent/liked
 */
export const getRecentLikedVideos = (userID: number): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/recent/liked', { params: { userID } })
}

/**
 * 最近投币的视频
 * GET /common/user/video/recent/coined
 */
export const getRecentCoinedVideos = (userID: number): Promise<PaginatedResult<UserVideoItem>> => {
  return request.get('/common/user/video/recent/coined', { params: { userID } })
}

/**
 * 删除视频
 * DELETE /common/user/video/delete
 */
export const deleteVideo = (params: DeleteVideoParams): Promise<void> => {
  return request.delete('/common/user/video/delete', { data: params })
}

/**
 * 创建标签
 * POST /common/user/video/tag
 */
export const createTag = (params: CreateTagParams): Promise<Tag> => {
  return request.post('/common/user/video/tag', params)
}
