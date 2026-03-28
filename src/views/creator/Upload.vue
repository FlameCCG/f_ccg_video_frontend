<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { UploadCloud, Image as ImageIcon, X, Loader2, Plus, Check } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  uploadChunk,
  getUploadStatus,
  completeUpload,
  uploadImage,
  getRecommendedCovers,
  type UploadStatusResult,
} from '@/api/upload'
import { publishVideo, getPartitions, type Partition } from '@/api/video'
import { getSiteConfig, type StorageConfig } from '@/api/site'

const router = useRouter()
const { toast } = useToast()

interface VideoPart {
  id: string
  file: File
  title: string
  progress: number
  status:
    | 'pending'
    | 'hashing'
    | 'checking'
    | 'uploading'
    | 'merging'
    | 'success'
    | 'error'
    | 'canceled'
  hash: string
  filePath: string
  instant: boolean
  errorMessage?: string
  abortController?: AbortController
}

// State
const isDragging = ref(false)
const parts = ref<VideoPart[]>([])

const partitions = ref<Partition[]>([])
const coverFile = ref<File | null>(null)
const coverPreview = ref('')
const isPublishing = ref(false)

const storageConfig = ref<StorageConfig>({
  maxChunkSize: 10,
  chunkSize: 10,
  maxFileSize: 100,
  maxUploadNum: 10,
})

const chunkSizeBytes = computed(() => storageConfig.value.chunkSize * 1024 * 1024)
const maxFileSizeBytes = computed(() => storageConfig.value.maxFileSize * 1024 * 1024)

const isUploadingAny = computed(() =>
  parts.value.some((p) =>
    ['pending', 'hashing', 'checking', 'uploading', 'merging'].includes(p.status)
  )
)

// Form State
const form = ref({
  title: '',
  description: '',
  partitionId: undefined as number | undefined,
  tags: [] as string[],
  tagInput: '',
  isOriginal: true,
  publishType: 'immediate',
  publishTime: '',
})

// Cover Setting State
const showCoverSetting = ref(false)
const coverSettingMode = ref<'upload' | 'frame'>('upload')
const frameVideoRef = ref<HTMLVideoElement | null>(null)
const previewVideoUrl = ref('')
const previewVideoError = ref(false)
const recommendedCovers = ref<string[]>([])
const isExtractingFrames = ref(false)
const tempCoverPreview = ref('')
const tempCoverFile = ref<File | null>(null)
const UPLOAD_STATUS_TIMEOUT = 6000
const UPLOAD_CHUNK_TIMEOUT = 60000
const COMPLETE_UPLOAD_TIMEOUT = 5 * 60 * 1000
const COVER_EXTRACT_TIMEOUT = 8000
const RECOMMENDED_COVER_TIMEOUT = 20000

let coverExtractJobId = 0
let recommendedCoverLoadingHash = ''
let localPreviewObjectUrl = ''

const emptyUploadStatus = (fileHash: string): UploadStatusResult => ({
  fileHash,
  completed: false,
  filePath: '',
  uploadedChunks: [],
})

const waitForVideoEvent = (
  video: HTMLVideoElement,
  successEvent: 'loadedmetadata' | 'seeked',
  timeoutMs: number,
  ready?: () => boolean
): Promise<void> => {
  if (ready?.()) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`wait for ${successEvent} timed out`))
    }, timeoutMs)

    const onSuccess = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error(`video ${successEvent} failed`))
    }

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener(successEvent, onSuccess)
      video.removeEventListener('error', onError)
    }

    video.addEventListener(successEvent, onSuccess, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

const revokeLocalPreviewObjectUrl = () => {
  if (localPreviewObjectUrl) {
    URL.revokeObjectURL(localPreviewObjectUrl)
    localPreviewObjectUrl = ''
  }
}

const syncPreviewVideoUrl = () => {
  const firstPart = parts.value[0]
  previewVideoError.value = false

  if (!firstPart) {
    revokeLocalPreviewObjectUrl()
    previewVideoUrl.value = ''
    return
  }

  if (firstPart.status === 'success' && firstPart.filePath) {
    revokeLocalPreviewObjectUrl()
    previewVideoUrl.value = firstPart.filePath
    return
  }

  revokeLocalPreviewObjectUrl()
  localPreviewObjectUrl = URL.createObjectURL(firstPart.file)
  previewVideoUrl.value = localPreviewObjectUrl
}

const extractFrames = async (file: File) => {
  const currentJobId = ++coverExtractJobId
  isExtractingFrames.value = true
  recommendedCovers.value = []

  const video = document.createElement('video')
  const objectUrl = URL.createObjectURL(file)
  video.src = objectUrl
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.load()

  try {
    await waitForVideoEvent(
      video,
      'loadedmetadata',
      COVER_EXTRACT_TIMEOUT,
      () => video.readyState >= 1
    )
    if (currentJobId !== coverExtractJobId) return

    const duration = Number.isFinite(video.duration) ? video.duration : 0
    if (duration <= 0 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error('invalid video metadata')
    }

    const numFrames = 6
    const timestamps = Array.from(
      { length: numFrames },
      (_, i) => (duration / (numFrames + 1)) * (i + 1)
    )

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('canvas context unavailable')
    }

    for (const time of timestamps) {
      if (currentJobId !== coverExtractJobId) return

      const safeTime = Math.min(time, Math.max(duration - 0.1, 0))
      video.currentTime = safeTime
      await waitForVideoEvent(video, 'seeked', COVER_EXTRACT_TIMEOUT)
      if (currentJobId !== coverExtractJobId) return

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      recommendedCovers.value.push(canvas.toDataURL('image/jpeg', 0.9))
    }

    if (
      currentJobId === coverExtractJobId &&
      !coverPreview.value &&
      recommendedCovers.value.length > 0 &&
      recommendedCovers.value[0]
    ) {
      await selectRecommendedCover(recommendedCovers.value[0])
    }
  } catch (error) {
    if (currentJobId !== coverExtractJobId) return
    recommendedCovers.value = []
    console.error('Extract recommended covers failed', error)
  } finally {
    if (currentJobId === coverExtractJobId) {
      isExtractingFrames.value = false
      const firstPart = parts.value[0]
      if (recommendedCovers.value.length === 0 && firstPart?.status === 'success') {
        void loadRecommendedCoversFromServer(firstPart)
      }
    }
    URL.revokeObjectURL(objectUrl)
    video.removeAttribute('src')
    video.load()
  }
}

const dataUrlToCoverFile = async (dataUrl: string) => {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], 'cover.jpg', { type: 'image/jpeg' })
}

const loadRecommendedCoversFromServer = async (part: VideoPart) => {
  if (!part.hash || part.status !== 'success') return
  if (parts.value[0]?.id !== part.id) return
  if (recommendedCovers.value.length > 0) return
  if (recommendedCoverLoadingHash === part.hash) return

  recommendedCoverLoadingHash = part.hash
  isExtractingFrames.value = true
  try {
    const res = await getRecommendedCovers(part.hash, 6, {
      timeout: RECOMMENDED_COVER_TIMEOUT,
      silent: true,
    })
    if (parts.value[0]?.id !== part.id) return
    recommendedCovers.value = res.covers || []
    if (!coverPreview.value && recommendedCovers.value[0]) {
      await selectRecommendedCover(recommendedCovers.value[0])
    }
  } catch (error) {
    console.error('Load recommended covers from server failed', error)
    toast({ title: '推荐封面生成失败，请手动上传或截取封面', variant: 'destructive' })
  } finally {
    if (recommendedCoverLoadingHash === part.hash) {
      recommendedCoverLoadingHash = ''
    }
    isExtractingFrames.value = false
  }
}

const selectRecommendedCover = async (dataUrl: string) => {
  coverPreview.value = dataUrl
  coverFile.value = await dataUrlToCoverFile(dataUrl)
}

const applyRecommendedCoverInDialog = async (dataUrl: string) => {
  tempCoverPreview.value = dataUrl
  tempCoverFile.value = await dataUrlToCoverFile(dataUrl)
}

const openCoverSetting = () => {
  tempCoverPreview.value = coverPreview.value
  tempCoverFile.value = coverFile.value
  coverSettingMode.value = parts.value[0] ? 'frame' : 'upload'
  showCoverSetting.value = true

  const firstPart = parts.value[0]
  if (
    firstPart?.status === 'success' &&
    recommendedCovers.value.length === 0 &&
    !isExtractingFrames.value
  ) {
    void loadRecommendedCoversFromServer(firstPart)
  }
}

const onTempCoverChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    tempCoverFile.value = file
    tempCoverPreview.value = URL.createObjectURL(file)
  }
  target.value = ''
}

const captureFrame = () => {
  if (!frameVideoRef.value || previewVideoError.value) {
    toast({ title: '当前视频无法直接预览，请从推荐封面中选择', variant: 'destructive' })
    return
  }
  const video = frameVideoRef.value
  if (!video.videoWidth || !video.videoHeight) {
    toast({ title: '视频尚未就绪，请稍后重试', variant: 'destructive' })
    return
  }
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)

  const dataUrl = canvas.toDataURL('image/jpeg')
  tempCoverPreview.value = dataUrl

  void fetch(dataUrl)
    .then((res) => res.blob())
    .then((blob) => {
      tempCoverFile.value = new File([blob], 'cover.jpg', { type: 'image/jpeg' })
      toast({ title: '已截取当前帧' })
    })
}

const onPreviewVideoError = () => {
  previewVideoError.value = true
  const firstPart = parts.value[0]
  if (
    firstPart?.status === 'success' &&
    recommendedCovers.value.length === 0 &&
    !isExtractingFrames.value
  ) {
    void loadRecommendedCoversFromServer(firstPart)
  }
}

const confirmCoverSetting = () => {
  coverPreview.value = tempCoverPreview.value
  coverFile.value = tempCoverFile.value
  showCoverSetting.value = false
}

onMounted(async () => {
  const [partitionRes, configRes] = await Promise.allSettled([getPartitions(), getSiteConfig()])
  if (partitionRes.status === 'fulfilled') {
    partitions.value = partitionRes.value
  }
  if (configRes.status === 'fulfilled') {
    storageConfig.value = configRes.value.site.storage
  }
})

watch(
  () => [parts.value[0]?.id, parts.value[0]?.status, parts.value[0]?.filePath],
  () => {
    syncPreviewVideoUrl()
  },
  { immediate: true }
)

// Full-file SHA-256 via Web Worker with progress reporting
const calculateFullSHA256 = (
  file: File,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const workerCode = `
      self.onmessage = async (e) => {
        try {
          const file = e.data;
          const chunkSize = 2 * 1024 * 1024;
          const total = file.size;
          const chunks = [];
          let offset = 0;
          while (offset < total) {
            const end = Math.min(offset + chunkSize, total);
            const buf = await file.slice(offset, end).arrayBuffer();
            chunks.push(new Uint8Array(buf));
            offset = end;
            self.postMessage({ type: 'progress', pct: Math.round((offset / total) * 100) });
          }
          let totalLen = 0;
          for (const c of chunks) totalLen += c.length;
          const merged = new Uint8Array(totalLen);
          let pos = 0;
          for (const c of chunks) { merged.set(c, pos); pos += c.length; }
          const hashBuf = await crypto.subtle.digest('SHA-256', merged);
          const arr = Array.from(new Uint8Array(hashBuf));
          const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
          self.postMessage({ type: 'done', hash: hex });
        } catch (err) {
          self.postMessage({ type: 'error', error: err.message });
        }
      };
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    const worker = new Worker(url)

    const cleanup = () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        cleanup()
        reject(new Error('canceled'))
      })
    }

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.pct as number)
      } else if (e.data.type === 'done') {
        resolve(e.data.hash as string)
        cleanup()
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.error as string))
        cleanup()
      }
    }
    worker.onerror = (err) => {
      reject(err)
      cleanup()
    }
    worker.postMessage(file)
  })
}

// Drag and Drop
const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = true
}
const onDragLeave = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
}
const onDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFilesSelect(files)
  }
}
const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (files && files.length > 0) {
    handleFilesSelect(files)
  }
  target.value = ''
}

// Concurrency & retry helpers
const MAX_CONCURRENT_UPLOADS = 5
const activeUploads = ref(0)

const pendingCount = computed(() => parts.value.filter((p) => p.status === 'pending').length)

const queuePosition = (part: VideoPart): number => {
  if (part.status !== 'pending') return 0
  let pos = 0
  for (const p of parts.value) {
    if (p.id === part.id) return pos + 1
    if (p.status === 'pending') pos++
  }
  return 0
}

let isCompleting = false
const completeQueue: (() => void)[] = []

const acquireCompleteLock = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!isCompleting) {
      isCompleting = true
      resolve()
    } else {
      completeQueue.push(resolve)
    }
  })
}

const releaseCompleteLock = () => {
  if (completeQueue.length > 0) {
    const next = completeQueue.shift()
    next?.()
  } else {
    isCompleting = false
  }
}

const withRetry = async <T,>(
  fn: () => Promise<T>,
  retries: number,
  signal?: AbortSignal
): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      if (signal?.aborted) throw new Error('canceled')
      return await fn()
    } catch (error: unknown) {
      if (signal?.aborted || (error instanceof Error && error.message === 'canceled')) throw error
      const isNetworkOr5xx =
        !(error as { response?: { status?: number } }).response ||
        ((error as { response?: { status?: number } }).response?.status ?? 0) >= 500
      if (!isNetworkOr5xx || i === retries - 1) throw error
      await new Promise((res) => setTimeout(res, 1000 * Math.pow(2, i)))
    }
  }
  throw new Error('Max retries reached')
}

const processUploadQueue = () => {
  while (activeUploads.value < MAX_CONCURRENT_UPLOADS) {
    const next = parts.value.find((p) => p.status === 'pending')
    if (!next) break
    next.status = 'hashing'
    activeUploads.value++
    void uploadPart(next).finally(() => {
      activeUploads.value--
      processUploadQueue()
    })
  }
}

const handleFilesSelect = (files: FileList | File[]) => {
  const videoFiles = Array.from(files).filter((f) => f.type.startsWith('video/'))
  if (videoFiles.length === 0) {
    toast({ title: '请上传视频文件', variant: 'destructive' })
    return
  }

  const maxNum = storageConfig.value.maxUploadNum
  const remaining = maxNum - parts.value.length
  if (remaining <= 0) {
    toast({ title: `最多上传 ${maxNum} 个分P`, variant: 'destructive' })
    return
  }

  const filesToAdd = videoFiles.slice(0, remaining)
  if (filesToAdd.length < videoFiles.length) {
    toast({ title: `已达上限，仅添加前 ${filesToAdd.length} 个文件` })
  }

  const oversized = filesToAdd.filter((f) => f.size > maxFileSizeBytes.value)
  if (oversized.length > 0) {
    toast({
      title: `${oversized.length} 个文件超过 ${storageConfig.value.maxFileSize}MB 限制，已跳过`,
      variant: 'destructive',
    })
  }

  const validFiles = filesToAdd.filter((f) => f.size <= maxFileSizeBytes.value)
  if (validFiles.length === 0) return

  const newParts: VideoPart[] = validFiles.map((file) => ({
    id: Math.random().toString(36).substring(2, 9),
    file,
    title: file.name.replace(/\.[^/.]+$/, ''),
    progress: 0,
    status: 'pending',
    hash: '',
    filePath: '',
    instant: false,
  }))

  if (!form.value.title && newParts[0]) {
    form.value.title = newParts[0].title
  }

  const isFirstVideo = parts.value.length === 0
  parts.value.push(...newParts)
  processUploadQueue()

  if (isFirstVideo && newParts[0]) {
    void extractFrames(newParts[0].file)
  }
}

const uploadPart = async (part: VideoPart) => {
  part.abortController = new AbortController()
  const signal = part.abortController.signal

  try {
    part.progress = 0
    part.errorMessage = ''
    part.instant = false

    part.hash = await calculateFullSHA256(part.file, signal, (pct) => {
      part.progress = pct
    })

    // Phase 2: check status (秒传 / 断点续传)
    part.status = 'checking'
    let status = emptyUploadStatus(part.hash)
    try {
      status = await withRetry(
        () => getUploadStatus(part.hash, { signal, timeout: UPLOAD_STATUS_TIMEOUT, silent: true }),
        2,
        signal
      )
    } catch (error) {
      console.warn('Get upload status failed, fallback to full upload', error)
    }

    if (status.completed) {
      part.filePath = status.filePath
      part.progress = 100
      part.instant = true
      part.status = 'success'
      return
    }

    // Phase 3: upload missing chunks
    const uploadedChunks = new Set(status.uploadedChunks || [])
    const cSize = chunkSizeBytes.value
    const totalChunks = Math.ceil(part.file.size / cSize)
    let uploadedCount = uploadedChunks.size

    part.status = 'uploading'
    part.progress = totalChunks > 0 ? Math.round((uploadedCount / totalChunks) * 100) : 100

    for (let i = 0; i < totalChunks; i++) {
      if (signal.aborted) throw new Error('canceled')
      if (uploadedChunks.has(String(i))) continue

      const start = i * cSize
      const end = Math.min(start + cSize, part.file.size)
      const chunk = part.file.slice(start, end)

      await withRetry(
        () =>
          uploadChunk(
            { fileHash: part.hash, index: i, chunk },
            {
              signal,
              timeout: UPLOAD_CHUNK_TIMEOUT,
              silent: true,
            }
          ),
        3,
        signal
      )

      uploadedCount++
      part.progress = Math.round((uploadedCount / totalChunks) * 100)
    }

    // Phase 4: merge (serialized)
    part.status = 'merging'
    part.progress = 100
    await acquireCompleteLock()
    try {
      if (signal.aborted) throw new Error('canceled')
      const res = await withRetry(
        () =>
          completeUpload(
            { fileHash: part.hash, fileName: part.file.name, totalChunks },
            { signal, timeout: COMPLETE_UPLOAD_TIMEOUT, silent: true }
          ),
        2,
        signal
      )
      part.filePath = res.filePath
      part.status = 'success'
      if (
        parts.value[0]?.id === part.id &&
        recommendedCovers.value.length === 0 &&
        !isExtractingFrames.value
      ) {
        void loadRecommendedCoversFromServer(part)
      }
    } finally {
      releaseCompleteLock()
    }
  } catch (error: unknown) {
    if ((error instanceof Error && error.message === 'canceled') || signal.aborted) {
      part.status = 'canceled'
    } else {
      part.status = 'error'
      const err = error as { response?: { data?: { msg?: string } }; message?: string }
      part.errorMessage = err.response?.data?.msg || err.message || '上传失败'
      console.error('Upload failed for part', part.title, error)
    }
  }
}

const removePart = (index: number) => {
  const part = parts.value[index]
  const removedFirst = index === 0
  if (part?.abortController) {
    part.abortController.abort()
  }
  parts.value.splice(index, 1)
  if (removedFirst) {
    coverExtractJobId++
    recommendedCoverLoadingHash = ''
    isExtractingFrames.value = false
    recommendedCovers.value = []
    const nextFirstPart = parts.value[0]
    if (nextFirstPart) {
      if (nextFirstPart.status === 'success') {
        void loadRecommendedCoversFromServer(nextFirstPart)
      } else {
        void extractFrames(nextFirstPart.file)
      }
    }
  }
  processUploadQueue()
}

onBeforeUnmount(() => {
  coverExtractJobId++
  recommendedCoverLoadingHash = ''
  isExtractingFrames.value = false
  revokeLocalPreviewObjectUrl()
  parts.value.forEach((p) => p.abortController?.abort())
})

// Tags
const addTag = () => {
  const val = form.value.tagInput.trim()
  if (val && !form.value.tags.includes(val) && form.value.tags.length < 10) {
    form.value.tags.push(val)
  }
  form.value.tagInput = ''
}
const removeTag = (index: number) => {
  form.value.tags.splice(index, 1)
}

// Publish
const handlePublish = async () => {
  if (parts.value.length === 0) {
    toast({ title: '请至少上传一个视频分P', variant: 'destructive' })
    return
  }
  if (parts.value.some((p) => p.status !== 'success')) {
    toast({ title: '请等待所有视频上传完成', variant: 'destructive' })
    return
  }
  if (!form.value.title) {
    toast({ title: '请填写标题', variant: 'destructive' })
    return
  }
  if (!form.value.partitionId) {
    toast({ title: '请选择分区', variant: 'destructive' })
    return
  }
  if (!coverFile.value && !coverPreview.value) {
    toast({ title: '请上传封面', variant: 'destructive' })
    return
  }

  let publishTimeStr = undefined
  if (form.value.publishType === 'scheduled') {
    if (!form.value.publishTime) {
      toast({ title: '请选择定时发布时间', variant: 'destructive' })
      return
    }
    const d = new Date(form.value.publishTime)
    if (isNaN(d.getTime())) {
      toast({ title: '发布时间格式不正确', variant: 'destructive' })
      return
    }
    // 后端需要 RFC3339 格式的时间字符串
    publishTimeStr = d.toISOString()
  }

  try {
    isPublishing.value = true

    let coverUrl = ''
    if (coverFile.value) {
      const coverRes = await uploadImage(parts.value[0]?.hash || '', coverFile.value)
      coverUrl = coverRes.imageUrl
    }

    await publishVideo({
      title: form.value.title,
      description: form.value.description,
      partitionId: form.value.partitionId,
      isOriginal: form.value.isOriginal,
      coverUrl: coverUrl,
      publishTime: publishTimeStr,
      parts: parts.value.map((p) => ({
        title: p.title,
        filePath: p.filePath,
        fileName: p.file.name,
        fileHash: p.hash,
      })),
    })

    toast({ title: '发布成功' })
    void router.push('/creator/content')
  } catch (error) {
    console.error('Publish failed', error)
    toast({ title: '发布失败', variant: 'destructive' })
  } finally {
    isPublishing.value = false
  }
}
</script>

<template>
  <div class="max-w-5xl mx-auto py-8 px-4">
    <!-- Step 1: Upload Area -->
    <div
      v-if="parts.length === 0"
      class="bg-card rounded-xl border-2 border-dashed p-16 transition-colors flex flex-col items-center justify-center min-h-[400px]"
      :class="{ 'border-primary bg-primary/5': isDragging }"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <div class="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <UploadCloud class="h-12 w-12 text-primary" />
      </div>
      <h3 class="text-2xl font-semibold mb-3">拖拽视频到此处，或点击上传</h3>
      <p class="text-muted-foreground mb-8 text-center max-w-md">
        支持 mp4, webm 格式，单文件不超过 {{ storageConfig.maxFileSize }}MB，最多
        {{ storageConfig.maxUploadNum }} 个分P。建议上传 1080P 以上高清视频。
      </p>
      <Button size="lg" class="relative overflow-hidden cursor-pointer text-lg px-8 py-6">
        选择视频
        <input
          type="file"
          accept="video/*"
          multiple
          class="absolute inset-0 opacity-0 cursor-pointer"
          @change="onFileChange"
        />
      </Button>
    </div>

    <!-- Step 2: Form Area -->
    <div v-else class="space-y-8">
      <!-- Parts List Section -->
      <div class="bg-card rounded-xl border p-6 shadow-sm">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold flex items-center gap-2">发布视频</h2>
          <div class="flex items-center gap-3 text-sm text-muted-foreground">
            <span>共 {{ parts.length }} P</span>
            <span v-if="activeUploads > 0" class="text-primary">
              {{ activeUploads }} 个上传中
            </span>
            <span v-if="pendingCount > 0" class="text-orange-500">
              {{ pendingCount }} 个排队中
            </span>
          </div>
        </div>

        <div class="space-y-3 mb-4">
          <div
            v-for="(part, index) in parts"
            :key="part.id"
            class="flex items-center gap-4 p-4 rounded-lg border bg-muted/20"
          >
            <div
              class="flex-shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground font-medium"
            >
              P{{ index + 1 }}
            </div>
            <div class="flex-grow min-w-0">
              <div class="flex items-center justify-between mb-1">
                <Input
                  :model-value="part.title"
                  class="h-8 text-sm max-w-[300px] border-transparent hover:border-input focus-visible:border-input bg-transparent px-2 -ml-2"
                  placeholder="分P标题"
                  @update:model-value="(v) => (part.title = String(v))"
                />
                <span class="text-xs text-muted-foreground truncate ml-4" :title="part.file.name">
                  {{ part.file.name }} ({{ (part.file.size / 1024 / 1024).toFixed(2) }} MB)
                </span>
              </div>
              <div class="flex items-center gap-3">
                <div class="flex-grow bg-muted rounded-full h-1.5 overflow-hidden">
                  <div
                    class="h-full transition-all duration-300"
                    :class="{
                      'bg-primary': ['uploading', 'success'].includes(part.status),
                      'bg-destructive': part.status === 'error',
                      'bg-orange-400': ['hashing', 'checking', 'merging'].includes(part.status),
                      'bg-muted-foreground': ['pending', 'canceled'].includes(part.status),
                    }"
                    :style="{ width: `${part.progress}%` }"
                  ></div>
                </div>
                <span
                  class="text-xs w-20 text-right"
                  :class="{
                    'text-primary': part.status === 'success',
                    'text-destructive': part.status === 'error',
                    'text-orange-500': ['hashing', 'checking', 'merging'].includes(part.status),
                    'text-muted-foreground': ['pending', 'uploading', 'canceled'].includes(
                      part.status
                    ),
                  }"
                >
                  <template v-if="part.status === 'success'">{{
                    part.instant ? '秒传成功' : '上传成功'
                  }}</template>
                  <template v-else-if="part.status === 'error'">
                    <span :title="part.errorMessage">上传失败</span>
                  </template>
                  <template v-else-if="part.status === 'pending'">
                    排队 #{{ queuePosition(part) }}
                  </template>
                  <template v-else-if="part.status === 'hashing'">计算哈希</template>
                  <template v-else-if="part.status === 'checking'">校验中</template>
                  <template v-else-if="part.status === 'merging'">合并中</template>
                  <template v-else-if="part.status === 'canceled'">已取消</template>
                  <template v-else>{{ part.progress }}%</template>
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="flex-shrink-0 text-muted-foreground hover:text-destructive"
              @click="removePart(index)"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button
          variant="outline"
          class="w-full border-dashed relative overflow-hidden"
          :disabled="parts.length >= storageConfig.maxUploadNum"
        >
          <Plus class="mr-2 h-4 w-4" />
          添加分P（还可添加 {{ storageConfig.maxUploadNum - parts.length }} 个）
          <input
            type="file"
            accept="video/*"
            multiple
            class="absolute inset-0 opacity-0 cursor-pointer"
            :disabled="parts.length >= storageConfig.maxUploadNum"
            @change="onFileChange"
          />
        </Button>
      </div>

      <!-- Basic Settings Section -->
      <div class="bg-card rounded-xl border p-6 shadow-sm">
        <h2 class="text-xl font-bold mb-6">基本设置</h2>

        <div class="max-w-4xl space-y-8">
          <!-- Cover -->
          <div class="space-y-4">
            <Label class="text-base">视频封面 <span class="text-red-500">*</span></Label>

            <div class="flex flex-col gap-4">
              <!-- Main Cover -->
              <div
                class="relative w-[240px] aspect-video rounded-lg border-2 overflow-hidden group bg-muted/30"
                :class="!coverPreview ? 'border-dashed' : 'border-transparent'"
              >
                <img v-if="coverPreview" :src="coverPreview" class="w-full h-full object-cover" />
                <div
                  v-else
                  class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"
                >
                  <ImageIcon class="h-8 w-8 mb-2 opacity-50" />
                  <span class="text-sm">点击设置封面</span>
                </div>

                <div
                  class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-center cursor-pointer"
                  @click="openCoverSetting"
                >
                  <Button size="sm" variant="secondary" class="h-7 text-xs"> 封面设置 </Button>
                </div>
                <div
                  v-if="!coverPreview"
                  class="absolute inset-0 cursor-pointer"
                  @click="openCoverSetting"
                ></div>
              </div>

              <!-- Recommended Covers -->
              <div class="bg-muted/30 p-4 rounded-lg border max-w-full">
                <p class="text-sm text-muted-foreground mb-3">
                  系统默认选中第一帧为视频封面，以下为更多智能推荐封面
                </p>
                <div class="flex gap-3 overflow-x-auto pb-2">
                  <div
                    v-if="isExtractingFrames"
                    class="flex items-center gap-2 text-sm text-muted-foreground h-[68px]"
                  >
                    <Loader2 class="h-4 w-4 animate-spin" />
                    正在生成推荐封面...
                  </div>
                  <template v-else>
                    <div
                      v-for="(cover, index) in recommendedCovers"
                      :key="index"
                      class="relative w-[120px] aspect-video rounded border-2 cursor-pointer flex-shrink-0 overflow-hidden transition-colors"
                      :class="
                        coverPreview === cover
                          ? 'border-primary'
                          : 'border-transparent hover:border-primary/50'
                      "
                      @click="selectRecommendedCover(cover)"
                    >
                      <img :src="cover" class="w-full h-full object-cover" />
                      <div
                        v-if="coverPreview === cover"
                        class="absolute inset-0 bg-black/20 flex items-center justify-center"
                      >
                        <Check class="h-6 w-6 text-white drop-shadow-md" />
                      </div>
                    </div>
                  </template>
                  <div
                    v-if="!isExtractingFrames && recommendedCovers.length === 0"
                    class="text-sm text-muted-foreground h-[68px] flex items-center"
                  >
                    上传视频后将自动生成推荐封面
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <Label for="title" class="text-base">标题 <span class="text-red-500">*</span></Label>
            <Input
              id="title"
              :model-value="form.title"
              placeholder="给视频起个响亮的标题吧"
              class="text-lg"
              @update:model-value="(v) => (form.title = String(v))"
            />
            <div class="text-xs text-muted-foreground text-right">{{ form.title.length }}/80</div>
          </div>

          <!-- Type (Original / Copied) -->
          <div class="space-y-2">
            <Label class="text-base">类型 <span class="text-red-500">*</span></Label>
            <div class="flex gap-6 mt-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="form.isOriginal"
                  type="radio"
                  :value="true"
                  class="accent-primary w-4 h-4"
                />
                <span class="text-sm">自制</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="form.isOriginal"
                  type="radio"
                  :value="false"
                  class="accent-primary w-4 h-4"
                />
                <span class="text-sm">转载</span>
              </label>
            </div>
          </div>

          <!-- Partition -->
          <div class="space-y-2">
            <Label class="text-base">分区 <span class="text-red-500">*</span></Label>
            <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2 mt-2">
              <div
                v-for="p in partitions"
                :key="p.id"
                class="px-3 py-2 rounded-lg border text-center text-sm cursor-pointer transition-colors"
                :class="
                  form.partitionId === p.id
                    ? 'bg-primary/10 border-primary text-primary font-medium'
                    : 'hover:bg-muted'
                "
                @click="form.partitionId = p.id"
              >
                {{ p.name }}
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="space-y-2">
            <Label class="text-base">标签</Label>
            <div class="flex flex-wrap gap-2 mb-2">
              <span
                v-for="(tag, index) in form.tags"
                :key="index"
                class="bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm flex items-center gap-1"
              >
                {{ tag }}
                <X class="h-3 w-3 cursor-pointer hover:text-primary/70" @click="removeTag(index)" />
              </span>
            </div>
            <input
              v-model="form.tagInput"
              type="text"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="输入标签后按回车添加"
              :disabled="form.tags.length >= 10"
              @keydown.enter.prevent="addTag"
            />
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label for="desc" class="text-base">简介</Label>
            <textarea
              id="desc"
              v-model="form.description"
              class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px] resize-y"
              placeholder="填写更全面的相关信息，让更多人能找到你的视频"
              rows="4"
            ></textarea>
          </div>

          <!-- Publish Time -->
          <div class="space-y-2">
            <Label class="text-base">发布时间</Label>
            <div class="flex flex-col gap-4 mt-2">
              <div class="flex gap-6">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="form.publishType"
                    type="radio"
                    value="immediate"
                    class="accent-primary w-4 h-4"
                  />
                  <span class="text-sm">立即发布</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="form.publishType"
                    type="radio"
                    value="scheduled"
                    class="accent-primary w-4 h-4"
                  />
                  <span class="text-sm">定时发布</span>
                </label>
              </div>

              <div v-if="form.publishType === 'scheduled'" class="flex items-center gap-4">
                <Input
                  type="datetime-local"
                  :model-value="form.publishTime"
                  class="w-[250px]"
                  @update:model-value="(v) => (form.publishTime = String(v))"
                />
                <span class="text-sm text-muted-foreground">请选择至少2小时后的时间</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-4 pt-4">
        <Button
          class="px-10 py-6 text-lg"
          :disabled="isPublishing || isUploadingAny"
          @click="handlePublish"
        >
          <Loader2 v-if="isPublishing" class="mr-2 h-5 w-5 animate-spin" />
          发布视频
        </Button>
      </div>
    </div>

    <!-- Cover Setting Dialog -->
    <Dialog :open="showCoverSetting" @update:open="showCoverSetting = $event">
      <DialogContent class="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>设置封面</DialogTitle>
        </DialogHeader>

        <div class="space-y-6 py-4">
          <div class="flex gap-4 border-b pb-4">
            <Button
              :variant="coverSettingMode === 'upload' ? 'default' : 'ghost'"
              @click="coverSettingMode = 'upload'"
              >本地上传</Button
            >
            <Button
              :variant="coverSettingMode === 'frame' ? 'default' : 'ghost'"
              :disabled="!parts[0]"
              @click="coverSettingMode = 'frame'"
              >截取视频帧</Button
            >
          </div>

          <div v-if="coverSettingMode === 'upload'" class="space-y-4">
            <div
              class="relative aspect-video rounded-lg border-2 border-dashed overflow-hidden group bg-muted/30 cursor-pointer transition-colors hover:border-primary/50 max-w-md mx-auto"
            >
              <img
                v-if="tempCoverPreview"
                :src="tempCoverPreview"
                class="w-full h-full object-cover"
              />
              <div
                v-else
                class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"
              >
                <UploadCloud class="h-10 w-10 mb-3 opacity-50" />
                <span class="text-sm font-medium">点击上传封面</span>
                <span class="text-xs mt-1 opacity-70">建议比例 16:9</span>
              </div>

              <div
                v-if="tempCoverPreview"
                class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <span class="text-white text-sm font-medium">更换封面</span>
              </div>
              <input
                type="file"
                accept="image/*"
                class="absolute inset-0 opacity-0 cursor-pointer"
                @change="onTempCoverChange"
              />
            </div>
          </div>

          <div v-else-if="coverSettingMode === 'frame' && parts[0]" class="space-y-4">
            <div
              class="relative aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center"
            >
              <video
                v-if="previewVideoUrl"
                ref="frameVideoRef"
                :src="previewVideoUrl"
                controls
                class="w-full h-full"
                crossorigin="anonymous"
                @loadeddata="previewVideoError = false"
                @error="onPreviewVideoError"
              ></video>
              <div
                v-else
                class="absolute inset-0 flex items-center justify-center text-sm text-white/70"
              >
                暂无可预览视频
              </div>
              <div
                v-if="previewVideoError"
                class="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-white"
              >
                当前视频浏览器无法直接预览，已自动尝试服务端生成推荐封面
              </div>
            </div>
            <div class="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
              <span class="text-sm text-muted-foreground"
                >拖动进度条，点击右侧按钮截取当前画面作为封面</span
              >
              <Button :disabled="previewVideoError || !previewVideoUrl" @click="captureFrame">
                截取当前帧
              </Button>
            </div>

            <div v-if="tempCoverPreview" class="mt-4">
              <p class="text-sm font-medium mb-2">已截取封面预览：</p>
              <div class="w-[200px] aspect-video rounded border overflow-hidden">
                <img :src="tempCoverPreview" class="w-full h-full object-cover" />
              </div>
            </div>

            <div v-if="recommendedCovers.length > 0" class="space-y-3">
              <p class="text-sm font-medium">推荐封面</p>
              <div class="flex gap-3 overflow-x-auto pb-2">
                <button
                  v-for="(cover, index) in recommendedCovers"
                  :key="index"
                  type="button"
                  class="relative w-[120px] aspect-video rounded border-2 overflow-hidden transition-colors"
                  :class="
                    tempCoverPreview === cover
                      ? 'border-primary'
                      : 'border-transparent hover:border-primary/50'
                  "
                  @click="void applyRecommendedCoverInDialog(cover)"
                >
                  <img :src="cover" class="w-full h-full object-cover" />
                  <div
                    v-if="tempCoverPreview === cover"
                    class="absolute inset-0 bg-black/20 flex items-center justify-center"
                  >
                    <Check class="h-6 w-6 text-white drop-shadow-md" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showCoverSetting = false">取消</Button>
          <Button @click="confirmCoverSetting">确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
