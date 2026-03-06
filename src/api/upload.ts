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

// ============================================================================
// 5.5 视频上传 API
// ============================================================================

/**
 * 上传分片
 * POST /common/video/upload/chunk
 */
export const uploadChunk = (params: UploadChunkParams): Promise<void> => {
  const formData = new FormData()
  formData.append('fileHash', params.fileHash)
  formData.append('index', String(params.index))
  formData.append('chunk', params.chunk)
  return request.post('/common/video/upload/chunk', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

/**
 * 查询上传状态
 * GET /common/video/upload/status
 */
export const getUploadStatus = (fileHash: string): Promise<UploadStatusResult> => {
  return request.get('/common/video/upload/status', { params: { fileHash } })
}

/**
 * 完成上传
 * POST /common/video/upload/complete
 */
export const completeUpload = (params: CompleteUploadParams): Promise<CompleteUploadResult> => {
  return request.post('/common/video/upload/complete', params)
}

/**
 * 上传图片
 * POST /common/video/image/upload
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
