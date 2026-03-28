import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

export interface UploadChunkParams {
  fileHash: string
  index: number
  chunk: Blob
}

export interface UploadStatusResult {
  fileHash: string
  completed: boolean
  filePath: string
  uploadedChunks: string[]
}

export interface CompleteUploadParams {
  fileHash: string
  fileName: string
  totalChunks: number
}

export interface CompleteUploadResult {
  filePath: string
}

export interface ImageUploadResult {
  imageUrl: string
}

export interface RecommendCoverResult {
  covers: string[]
}

// ============================================================================
// 5.5 视频上传 API
// ============================================================================

/**
 * 上传分片
 * POST /common/video/upload/chunk
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 上传视频分片（需登录）
 * 重要说明: index 从 0 开始，fileHash 用于断点续传
 */
export const uploadChunk = (
  params: UploadChunkParams,
  config?: Record<string, unknown>
): Promise<void> => {
  const formData = new FormData()
  formData.append('fileHash', params.fileHash)
  formData.append('index', String(params.index))
  formData.append('chunk', params.chunk)
  return request.post('/common/video/upload/chunk', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config,
  })
}

/**
 * 查询上传状态
 * GET /common/video/upload/status
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 查询文件分片上传状态（需登录）
 */
export const getUploadStatus = (
  fileHash: string,
  config?: Record<string, unknown>
): Promise<UploadStatusResult> => {
  return request.get('/common/video/upload/status', { params: { fileHash }, ...config })
}

/**
 * 完成上传
 * POST /common/video/upload/complete
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 合并分片完成上传（需登录）
 */
export const completeUpload = (
  params: CompleteUploadParams,
  config?: Record<string, unknown>
): Promise<CompleteUploadResult> => {
  return request.post('/common/video/upload/complete', params, {
    timeout: 5 * 60 * 1000,
    ...config,
  })
}

/**
 * 上传图片
 * POST /common/video/image/upload
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 上传图片（需登录）
 */
export const uploadImage = (fileHash: string, cover: File): Promise<ImageUploadResult> => {
  const formData = new FormData()
  formData.append('fileHash', fileHash)
  formData.append('cover', cover)
  return request.post('/common/video/image/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

/**
 * 查询推荐封面
 * GET /common/video/upload/cover/recommend
 */
export const getRecommendedCovers = (
  fileHash: string,
  count = 6,
  config?: Record<string, unknown>
): Promise<RecommendCoverResult> => {
  return request.get('/common/video/upload/cover/recommend', {
    params: { fileHash, count },
    ...config,
  })
}
