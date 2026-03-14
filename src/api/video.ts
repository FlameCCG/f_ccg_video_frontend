import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

// Common Types
export interface AuthorBrief {
  id: number
  username: string
  avatar: string
}

export interface VideoAuthorBrief extends AuthorBrief {
  level: number
  description: string
}

export interface Partition {
  id: number
  name: string
  icon: string
  sortOrder: number
  isActive: boolean
  isSubmittable: boolean
}

export interface Tag {
  id: number
  name: string
}

export interface VideoResourceItem {
  id: number
  resolution: string
  sourceFileName: string
  fileUrl: string
  fileSize: number
  bitrate: number
  format: string
  codec: string
  isVip: boolean
  isSource: boolean
}

export interface VideoPartItem {
  id: number
  title: string
  sortOrder: number
  duration: number
  danmuCount: number
  resources: VideoResourceItem[]
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  list: T[]
  total: number
}

// ============================================================================
// 5.1 视频列表 API Types
// ============================================================================

export interface FeedItem {
  id: number
  title: string
  cover: string
  duration: number
  views: number
  danmuCount: number
  author: AuthorBrief
  createdAt: string
}

export interface SearchHighlight {
  [key: string]: string[]
}

export interface SearchVideoHit {
  id: number
  title: string
  cover: string
  authorUsername: string
  highlight: SearchHighlight
  views: number
  danmuCount: number
  duration: number
  tags: string[]
}

export interface VideoSearchResult {
  videoTotal: number
  userTotal: number
  videos: SearchVideoHit[]
}

export const VideoSortType = {
  Relevance: 0,
  ViewCount: 1,
  DanmakuCount: 2,
  Duration: 3,
} as const

export type VideoSortValue = (typeof VideoSortType)[keyof typeof VideoSortType]

export interface SearchVideoParams {
  keyword: string
  page?: number
  pageSize?: number
  videoSort?: VideoSortValue
  videoOrder?: number // 0 降序 1 升序
}

export interface SearchSuggestItem {
  value: string
  highlight: string
  docType: 'videos' | 'tags'
}

export interface SearchSuggestParams {
  prefix: string
  size?: number
}

export interface RecommendParams {
  videoId: number
  size?: number
}

// ============================================================================
// 5.2 视频详情 API Types
// ============================================================================

export interface VideoDetail {
  id: number
  title: string
  description: string
  cover: string
  authorUsername: string
  author: VideoAuthorBrief
  duration: number
  views: number
  likes: number
  commentCount: number
  coinCount: number
  favoriteCount: number
  danmuCount: number
  isOriginal: boolean
  storageType: string
  status: number
  createdAt: string
  partition: Partition
  tags: Tag[]
  resources: VideoResourceItem[]
  parts: VideoPartItem[]
  isLiked: boolean
  isFavorited: boolean
  isCoined: boolean
  watchProgress: number
}

export interface ViewResult {
  views: number
}

// ============================================================================
// 5.3 视频互动 API Types
// ============================================================================

export interface LikeResult {
  likes: number
}

export interface CoinParams {
  videoId: number
  coins?: number // 1-2
}

export interface CoinResult {
  coinCount: number
}

export interface FavoriteParams {
  videoId: number
  folderId?: number
}

export interface FavoriteResult {
  favoriteCount: number
}

export interface TripleParams {
  videoId: number
  folderId?: number
  coins?: number // 1-2
}

export interface TripleResult {
  likes: number
  coinCount: number
  favoriteCount: number
  isLiked: boolean
  isFavorited: boolean
  isCoined: boolean
}

export interface ReportVideoParams {
  videoId: number
  reason: string
  detail?: string
  images?: File[]
}

// ============================================================================
// 5.4 视频发布 API Types
// ============================================================================

export interface PublishVideoParams {
  title: string
  description?: string
  partitionId: number
  tags?: number[]
  isOriginal?: boolean
  coverUrl: string
  filePath: string
  fileName: string
  fileHash: string
  publishTime?: string
}

export interface PublishVideoResult {
  videoId: number
  status: number
  publishTime: string
  cover: string
}

export interface UpdateVideoParams {
  videoId: number
  title?: string
  description?: string
  partitionId?: number
  tags?: number[]
  isOriginal?: boolean
  coverUrl?: string
  publishTime?: string
}

export type VideoItem = VideoDetail

// ============================================================================
// 5.6 播放历史 API Types
// ============================================================================

export interface SaveHistoryParams {
  videoId: number
  progress?: number
  duration: number
}

export interface DeleteHistoryParams {
  videoIds: number[]
}

export interface HistoryItem {
  videoId: number
  title: string
  cover: string
  duration: number
  progress: number
  createdAt: string
  authorId: number
  author: string
}

// ============================================================================
// 5.7 收藏夹 API Types
// ============================================================================

export interface CreateFolderParams {
  name: string
}

export interface FolderItem {
  id: number
  name: string
  isDefault: boolean
  videoCount: number
  isFavorited?: boolean
  createdAt?: string
}

export interface DeleteFolderParams {
  folderId: number
}

export interface FolderVideosParams {
  folderId: number
  page?: number
  pageSize?: number
}

export interface FolderVideoItem {
  id: number
  title: string
  cover: string
  duration: number
  views: number
  danmuCount: number
  favoriteCount: number
  author: AuthorBrief
}

// ============================================================================
// 5.1 视频列表 API
// ============================================================================

/**
 * 首页推荐流
 * GET /common/video/home
 */
export const getHomeVideos = (params?: PaginationParams): Promise<PaginatedResult<FeedItem>> => {
  return request.get('/common/video/home', { params })
}

/**
 * 综合热门
 * GET /common/video/hot
 */
export const getHotVideos = (params?: PaginationParams): Promise<PaginatedResult<FeedItem>> => {
  return request.get('/common/video/hot', { params })
}

/**
 * 综合排行榜
 * GET /common/video/rank
 */
export const getRankVideos = (params?: PaginationParams): Promise<PaginatedResult<FeedItem>> => {
  return request.get('/common/video/rank', { params })
}

/**
 * 搜索视频
 * GET /common/video/search
 */
export const searchVideos = (params: SearchVideoParams): Promise<VideoSearchResult> => {
  return request.get('/common/video/search', { params })
}

/**
 * 搜索建议
 * GET /common/video/search/suggest
 */
export const getSearchSuggest = (params: SearchSuggestParams): Promise<SearchSuggestItem[]> => {
  return request.get('/common/video/search/suggest', { params })
}

/**
 * 视频周边推荐
 * GET /common/video/recommend
 */
export const getVideoRecommend = (params: RecommendParams): Promise<PaginatedResult<FeedItem>> => {
  return request.get('/common/video/recommend', { params })
}

/**
 * 投稿分区列表
 * GET /common/video/partitions
 */
export const getPartitions = (): Promise<Partition[]> => {
  return request.get('/common/video/partitions')
}

// ============================================================================
// 5.2 视频详情 API
// ============================================================================

/**
 * 视频详情
 * GET /common/video/detail
 */
export const getVideoDetail = (videoId: number): Promise<VideoDetail> => {
  return request.get('/common/video/detail', { params: { videoId } })
}

/**
 * 增加播放量
 * POST /common/video/view
 */
export const addVideoView = (videoId: number): Promise<ViewResult> => {
  return request.post('/common/video/view', { videoId })
}

// ============================================================================
// 5.3 视频互动 API
// ============================================================================

/**
 * 点赞/取消点赞
 * POST /common/video/like
 */
export const toggleVideoLike = (videoId: number): Promise<LikeResult> => {
  return request.post('/common/video/like', { videoId })
}

/**
 * 投币
 * POST /common/video/coin
 */
export const addVideoCoin = (params: CoinParams): Promise<CoinResult> => {
  return request.post('/common/video/coin', params)
}

/**
 * 收藏/取消收藏
 * POST /common/video/favorite
 */
export const toggleVideoFavorite = (params: FavoriteParams): Promise<FavoriteResult> => {
  return request.post('/common/video/favorite', params)
}

/**
 * 一键三连
 * POST /common/video/triple
 */
export const tripleVideo = (params: TripleParams): Promise<TripleResult> => {
  return request.post('/common/video/triple', params)
}

/**
 * 举报视频
 * POST /common/video/report
 */
export const reportVideo = (params: ReportVideoParams): Promise<void> => {
  const formData = new FormData()
  formData.append('videoId', String(params.videoId))
  formData.append('reason', params.reason)
  if (params.detail) {
    formData.append('detail', params.detail)
  }
  if (params.images) {
    params.images.forEach((image) => {
      formData.append('images', image)
    })
  }
  return request.post('/common/video/report', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

// ============================================================================
// 5.4 视频发布 API
// ============================================================================

/**
 * 发布视频
 * POST /common/video/publish
 */
export const publishVideo = (params: PublishVideoParams): Promise<PublishVideoResult> => {
  return request.post('/common/video/publish', params)
}

/**
 * 更新视频
 * PUT /common/video/publish
 */
export const updateVideo = (params: UpdateVideoParams): Promise<VideoItem> => {
  return request.put('/common/video/publish', params)
}

// ============================================================================
// 5.6 播放历史 API
// ============================================================================

/**
 * 保存播放进度
 * POST /common/video/history
 */
export const savePlayHistory = (params: SaveHistoryParams): Promise<void> => {
  return request.post('/common/video/history', params)
}

/**
 * 删除播放历史
 * DELETE /common/video/history
 */
export const deletePlayHistory = (params: DeleteHistoryParams): Promise<void> => {
  return request.delete('/common/video/history', { data: params })
}

/**
 * 播放历史列表
 * GET /common/video/history/list
 */
export const getPlayHistoryList = (
  params?: PaginationParams
): Promise<PaginatedResult<HistoryItem>> => {
  return request.get('/common/video/history/list', { params })
}

// ============================================================================
// 5.7 收藏夹 API
// ============================================================================

/**
 * 创建收藏夹
 * POST /common/video/folder
 */
export const createFolder = (params: CreateFolderParams): Promise<FolderItem> => {
  return request.post('/common/video/folder', params)
}

/**
 * 收藏夹列表
 * GET /common/video/folder
 */
export const getFolderList = (videoId?: number): Promise<PaginatedResult<FolderItem>> => {
  return request.get('/common/video/folder', { params: videoId ? { videoId } : undefined })
}

/**
 * 删除收藏夹
 * DELETE /common/video/folder
 */
export const deleteFolder = (params: DeleteFolderParams): Promise<void> => {
  return request.delete('/common/video/folder', { data: params })
}

/**
 * 收藏夹视频列表
 * GET /common/video/folder/videos
 */
export const getFolderVideos = (
  params: FolderVideosParams
): Promise<PaginatedResult<FolderVideoItem>> => {
  return request.get('/common/video/folder/videos', { params })
}
