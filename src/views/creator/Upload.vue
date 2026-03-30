<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { UploadCloud, Image as ImageIcon, X, Loader2, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import ScheduledPublishPicker from '@/components/creator/ScheduledPublishPicker.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  uploadChunk,
  getUploadStatus,
  completeUpload,
  uploadImage,
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
const uploadRootRef = ref<HTMLElement | null>(null)
const initialFileInputRef = ref<HTMLInputElement | null>(null)
const appendFileInputRef = ref<HTMLInputElement | null>(null)

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
const VIDEO_FILE_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'avi',
  'wmv',
  'flv',
  'mpeg',
  'mpg',
  'ts',
  'm2ts',
] as const
const VIDEO_INPUT_ACCEPT = `video/*,${VIDEO_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(',')}`
const COMMON_VIDEO_FORMAT_TEXT = `${VIDEO_FILE_EXTENSIONS.slice(0, 6).join(' / ')} 等常见格式`
const SCHEDULE_MIN_DELAY_MS = 5 * 60 * 1000
const SCHEDULE_MAX_DELAY_MS = 14 * 24 * 60 * 60 * 1000

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
const frameVideoRef = ref<HTMLVideoElement | null>(null)
const previewVideoUrl = ref('')
const previewVideoError = ref(false)
const tempCoverPreview = ref('')
const tempCoverFile = ref<File | null>(null)
const UPLOAD_STATUS_TIMEOUT = 6000
const UPLOAD_CHUNK_TIMEOUT = 60000
const COMPLETE_UPLOAD_TIMEOUT = 5 * 60 * 1000
const scheduleBoundaryBase = ref(Date.now())

let localPreviewObjectUrl = ''
let scheduleBoundaryTimer: ReturnType<typeof setInterval> | undefined
const canCaptureCover = computed(() =>
  Boolean(parts.value[0] && previewVideoUrl.value && !previewVideoError.value)
)
const coverDialogTip = computed(() => {
  if (!parts.value[0]) return '请先上传视频后再设置封面'
  if (canCaptureCover.value) return '支持拖动视频进度条截取当前帧，也支持直接上传自定义封面'
  if (previewVideoUrl.value) return '当前视频浏览器无法预览，仅支持本地上传自定义封面'
  return '当前视频预览源尚未就绪，请先上传自定义封面'
})

const emptyUploadStatus = (fileHash: string): UploadStatusResult => ({
  fileHash,
  completed: false,
  filePath: '',
  uploadedChunks: [],
})

const parseLocalDateTime = (value: string) => {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const parsed = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (isNaN(parsed.getTime())) return null
  return parsed
}

const formatLocalDateTime = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

const formatScheduledRangeText = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)

const ceilDateToMinute = (date: Date) => {
  const next = new Date(date)
  if (next.getSeconds() !== 0 || next.getMilliseconds() !== 0) {
    next.setSeconds(0, 0)
    next.setMinutes(next.getMinutes() + 1)
  } else {
    next.setSeconds(0, 0)
  }
  return next
}

const floorDateToMinute = (date: Date) => {
  const next = new Date(date)
  next.setSeconds(0, 0)
  return next
}

const refreshScheduleBoundary = () => {
  scheduleBoundaryBase.value = Date.now()
}

const getScheduleWindowStart = () =>
  ceilDateToMinute(new Date(scheduleBoundaryBase.value + SCHEDULE_MIN_DELAY_MS))

const getScheduleWindowEnd = () =>
  floorDateToMinute(new Date(scheduleBoundaryBase.value + SCHEDULE_MAX_DELAY_MS))

const scheduledPublishMinValue = computed(() => formatLocalDateTime(getScheduleWindowStart()))
const scheduledPublishMaxValue = computed(() => formatLocalDateTime(getScheduleWindowEnd()))
const scheduledPublishMinLabel = computed(() => formatScheduledRangeText(getScheduleWindowStart()))
const scheduledPublishMaxLabel = computed(() => formatScheduledRangeText(getScheduleWindowEnd()))

const normalizeScheduledPublishTime = (value: string) => {
  const parsed = parseLocalDateTime(value)
  if (!parsed) return ''

  const minDate = getScheduleWindowStart()
  const maxDate = getScheduleWindowEnd()
  if (parsed.getTime() < minDate.getTime()) return formatLocalDateTime(minDate)
  if (parsed.getTime() > maxDate.getTime()) return formatLocalDateTime(maxDate)
  return formatLocalDateTime(parsed)
}

const getFileExtension = (fileName: string) => {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/)
  return match?.[1] ?? ''
}

const getVideoFileRejectionReason = (file: File) => {
  if (file.type.startsWith('video/')) return ''
  const extension = getFileExtension(file.name)
  if (
    extension &&
    VIDEO_FILE_EXTENSIONS.includes(extension as (typeof VIDEO_FILE_EXTENSIONS)[number])
  ) {
    return ''
  }
  return `不支持的格式：${file.name}`
}

const formatRejectedSummary = (values: string[], fallback: string) => {
  if (values.length === 0) return fallback
  const visible = values.slice(0, 2).join('、')
  return values.length > 2 ? `${visible} 等 ${values.length} 个` : visible
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

const openCoverSetting = () => {
  tempCoverPreview.value = coverPreview.value
  tempCoverFile.value = coverFile.value
  showCoverSetting.value = true
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
    toast({ title: '当前视频无法直接预览，请上传自定义封面', variant: 'destructive' })
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

  refreshScheduleBoundary()
  scheduleBoundaryTimer = window.setInterval(refreshScheduleBoundary, 30000)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('drop', handleWindowDrop)
})

watch(
  () => [parts.value[0]?.id, parts.value[0]?.status, parts.value[0]?.filePath],
  () => {
    syncPreviewVideoUrl()
  },
  { immediate: true }
)

watch(
  () => form.value.publishType,
  (publishType) => {
    if (publishType !== 'scheduled') return
    refreshScheduleBoundary()
    form.value.publishTime =
      normalizeScheduledPublishTime(form.value.publishTime) || scheduledPublishMinValue.value
  }
)

watch([scheduledPublishMinValue, scheduledPublishMaxValue], () => {
  if (form.value.publishType !== 'scheduled' || !form.value.publishTime) return
  const normalized = normalizeScheduledPublishTime(form.value.publishTime)
  if (normalized && normalized !== form.value.publishTime) {
    form.value.publishTime = normalized
  }
})

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
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  isDragging.value = true
}
const onDragEnter = (e: DragEvent) => {
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}
const onDragLeave = (e: DragEvent) => {
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  const nextTarget = e.relatedTarget as Node | null
  if (nextTarget && uploadRootRef.value?.contains(nextTarget)) return
  isDragging.value = false
}
const onDrop = (e: DragEvent) => {
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false
  const files = getFilesFromDataTransfer(e.dataTransfer)
  if (files.length > 0) {
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

const openVideoPicker = (target: 'initial' | 'append') => {
  const input = target === 'initial' ? initialFileInputRef.value : appendFileInputRef.value
  input?.click()
}

const handleWindowDragOver = (e: DragEvent) => {
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()
}

const handleWindowDrop = (e: DragEvent) => {
  if (!hasDraggedFiles(e.dataTransfer)) return
  e.preventDefault()

  const target = e.target as Node | null
  if (target && uploadRootRef.value?.contains(target)) {
    onDrop(e)
  }
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

const hasDraggedFiles = (dataTransfer: DataTransfer | null | undefined) => {
  if (!dataTransfer) return false
  return Array.from(dataTransfer.types ?? []).includes('Files')
}

const getFilesFromDataTransfer = (dataTransfer: DataTransfer | null | undefined) => {
  if (!dataTransfer) return []

  if (dataTransfer.files?.length) {
    return Array.from(dataTransfer.files)
  }

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File)
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

const isLikelyVideoFile = (file: File) => {
  return !getVideoFileRejectionReason(file)
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
  const allFiles = Array.from(files)
  const unsupportedFiles = allFiles
    .map((file) => ({ file, reason: getVideoFileRejectionReason(file) }))
    .filter((entry) => entry.reason)

  const videoFiles = allFiles.filter(isLikelyVideoFile)
  if (videoFiles.length === 0) {
    toast({
      title: '没有可上传的视频文件',
      description:
        unsupportedFiles.length > 0
          ? `${formatRejectedSummary(
              unsupportedFiles.map((entry) => entry.file.name),
              '所选文件'
            )} 未被识别为常见视频格式，请检查扩展名或重新导出。`
          : `请上传 ${COMMON_VIDEO_FORMAT_TEXT}。`,
      variant: 'destructive',
    })
    return
  }

  const maxNum = storageConfig.value.maxUploadNum
  const remaining = maxNum - parts.value.length
  if (remaining <= 0) {
    toast({ title: `最多上传 ${maxNum} 个分P`, variant: 'destructive' })
    return
  }

  const filesToAdd = videoFiles.slice(0, remaining)
  const ignoredByLimit = videoFiles.slice(remaining)

  const oversized = filesToAdd.filter((f) => f.size > maxFileSizeBytes.value)
  const validFiles = filesToAdd.filter((f) => f.size <= maxFileSizeBytes.value)

  const uploadIssues: string[] = []
  if (unsupportedFiles.length > 0) {
    uploadIssues.push(
      `格式不支持：${formatRejectedSummary(
        unsupportedFiles.map((entry) => entry.file.name),
        '部分文件'
      )}`
    )
  }
  if (ignoredByLimit.length > 0) {
    uploadIssues.push(
      `超出本次最多 ${maxNum} 个分P：${formatRejectedSummary(
        ignoredByLimit.map((file) => file.name),
        '部分文件'
      )}`
    )
  }
  if (oversized.length > 0) {
    uploadIssues.push(
      `超过 ${storageConfig.value.maxFileSize}MB：${formatRejectedSummary(
        oversized.map((file) => file.name),
        '部分文件'
      )}`
    )
  }
  if (uploadIssues.length > 0) {
    toast({
      title: validFiles.length > 0 ? '部分文件未加入上传队列' : '所选文件未通过上传校验',
      description: uploadIssues.join('；'),
      variant: validFiles.length > 0 ? undefined : 'destructive',
    })
  }

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

  parts.value.push(...newParts)
  processUploadQueue()
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
  if (removedFirst) previewVideoError.value = false
  processUploadQueue()
}

onBeforeUnmount(() => {
  revokeLocalPreviewObjectUrl()
  parts.value.forEach((p) => p.abortController?.abort())
  if (scheduleBoundaryTimer) {
    clearInterval(scheduleBoundaryTimer)
  }
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('drop', handleWindowDrop)
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
    refreshScheduleBoundary()
    if (!form.value.publishTime) {
      toast({ title: '请选择定时发布时间', variant: 'destructive' })
      return
    }
    const normalizedPublishTime = normalizeScheduledPublishTime(form.value.publishTime)
    if (!normalizedPublishTime) {
      toast({ title: '发布时间格式不正确', variant: 'destructive' })
      return
    }
    if (normalizedPublishTime !== form.value.publishTime) {
      form.value.publishTime = normalizedPublishTime
    }
    const d = new Date(normalizedPublishTime)
    if (isNaN(d.getTime())) {
      toast({ title: '发布时间格式不正确', variant: 'destructive' })
      return
    }
    const minDate = getScheduleWindowStart()
    const maxDate = getScheduleWindowEnd()
    if (d.getTime() < minDate.getTime() || d.getTime() > maxDate.getTime()) {
      toast({
        title: '定时发布时间超出允许范围',
        description: `请选择 ${scheduledPublishMinLabel.value} 至 ${scheduledPublishMaxLabel.value} 之间的时间`,
        variant: 'destructive',
      })
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
  <div
    ref="uploadRootRef"
    class="max-w-5xl mx-auto py-8 px-4"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <input
      ref="initialFileInputRef"
      type="file"
      :accept="VIDEO_INPUT_ACCEPT"
      multiple
      class="hidden"
      @change="onFileChange"
    />
    <input
      ref="appendFileInputRef"
      type="file"
      :accept="VIDEO_INPUT_ACCEPT"
      multiple
      class="hidden"
      @change="onFileChange"
    />

    <!-- Step 1: Upload Area -->
    <div
      v-if="parts.length === 0"
      class="bg-card rounded-3xl border-2 border-dashed p-16 transition-all duration-300 flex flex-col items-center justify-center min-h-[440px] hover:border-primary/50 hover:bg-muted/10"
      :class="{ 'border-primary bg-primary/5 scale-[1.02] shadow-xl': isDragging }"
    >
      <div
        class="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 transition-transform duration-500 group-hover:scale-110"
      >
        <UploadCloud class="h-12 w-12 text-primary" />
      </div>
      <h3 class="text-3xl font-bold tracking-tight mb-4">拖拽视频到此处，或点击上传</h3>
      <p class="text-muted-foreground mb-10 text-center max-w-lg leading-relaxed">
        支持 {{ COMMON_VIDEO_FORMAT_TEXT }}，单文件不超过 {{ storageConfig.maxFileSize }}MB，最多
        {{ storageConfig.maxUploadNum }} 个分P。若文件未进入列表，会直接提示具体原因。
      </p>
      <Button
        size="lg"
        class="cursor-pointer text-lg px-10 py-7 rounded-2xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all font-medium"
        @click="openVideoPicker('initial')"
      >
        选择视频
      </Button>
    </div>

    <!-- Step 2: Form Area -->
    <div v-else class="space-y-8">
      <!-- Parts List Section -->
      <div class="bg-card rounded-2xl border p-8 shadow-sm">
        <div class="flex items-center justify-between mb-8">
          <h2 class="text-2xl font-bold tracking-tight">发布视频</h2>
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
          class="w-full border-dashed"
          :disabled="parts.length >= storageConfig.maxUploadNum"
          @click="openVideoPicker('append')"
        >
          <Plus class="mr-2 h-4 w-4" />
          添加分P（还可添加 {{ storageConfig.maxUploadNum - parts.length }} 个）
        </Button>
      </div>

      <!-- Basic Settings Section -->
      <div class="bg-card rounded-2xl border p-8 shadow-sm">
        <h2 class="text-2xl font-bold tracking-tight mb-8">基本设置</h2>

        <div class="max-w-4xl space-y-10">
          <!-- Cover -->
          <div class="space-y-4">
            <Label class="text-base">视频封面 <span class="text-red-500">*</span></Label>

            <div class="flex flex-col gap-4">
              <!-- Main Cover -->
              <div
                class="relative w-[240px] aspect-video rounded-xl border-2 overflow-hidden group bg-muted/30 transition-all duration-300 hover:shadow-lg hover:border-primary/50"
                :class="!coverPreview ? 'border-dashed' : 'border-transparent shadow-md'"
              >
                <img
                  v-if="coverPreview"
                  :src="coverPreview"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div
                  v-else
                  class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground"
                >
                  <ImageIcon
                    class="h-8 w-8 mb-2 opacity-50 group-hover:scale-110 transition-transform"
                  />
                  <span class="text-sm font-medium">点击设置封面</span>
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

              <div class="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p>{{ coverDialogTip }}</p>
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
          <div class="space-y-3">
            <Label class="text-base">分区 <span class="text-red-500">*</span></Label>
            <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-3 mt-2">
              <div
                v-for="p in partitions"
                :key="p.id"
                class="px-3 py-2.5 rounded-xl border text-center text-sm cursor-pointer transition-all duration-200"
                :class="
                  form.partitionId === p.id
                    ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/30 scale-105 border-transparent'
                    : 'hover:bg-muted/80 hover:scale-105 border-border/60 bg-card'
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

              <div
                v-if="form.publishType === 'scheduled'"
                class="mt-3 flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4"
              >
                <ScheduledPublishPicker v-model="form.publishTime" />
                <div class="text-sm text-muted-foreground whitespace-nowrap">
                  (目前支持最早≥5分钟，最晚≤15天)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-end gap-4 pt-4">
        <Button
          class="px-12 py-7 text-lg rounded-2xl font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all"
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
      <DialogContent
        class="flex max-h-[min(90vh,860px)] flex-col overflow-hidden p-0 sm:max-w-[760px]"
      >
        <DialogHeader class="border-b border-border/70 px-6 py-5">
          <DialogTitle>设置封面</DialogTitle>
          <DialogDescription class="sr-only">
            设置视频封面，可上传自定义图片；若浏览器支持视频预览，也可以截取当前帧。
          </DialogDescription>
        </DialogHeader>

        <div class="cover-dialog-scroll flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div
            class="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          >
            {{ coverDialogTip }}
          </div>

          <div
            class="grid gap-5"
            :class="canCaptureCover ? 'lg:grid-cols-[minmax(0,1.2fr)_260px]' : 'lg:grid-cols-1'"
          >
            <div v-if="canCaptureCover" class="space-y-4">
              <div
                class="relative aspect-video max-h-[38vh] min-h-[220px] overflow-hidden rounded-2xl bg-black flex items-center justify-center"
              >
                <video
                  v-if="previewVideoUrl"
                  ref="frameVideoRef"
                  :src="previewVideoUrl"
                  controls
                  class="h-full w-full"
                  crossorigin="anonymous"
                  @loadeddata="previewVideoError = false"
                  @error="onPreviewVideoError"
                ></video>
                <div
                  v-else
                  class="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70"
                >
                  暂无可预览视频
                </div>
              </div>
              <div
                class="flex flex-col gap-3 rounded-2xl bg-muted/45 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span class="text-sm leading-6 text-muted-foreground">
                  拖动视频进度条到目标时间，点击右侧按钮截取当前画面
                </span>
                <Button
                  class="shrink-0"
                  :disabled="!previewVideoUrl || previewVideoError"
                  @click="captureFrame"
                >
                  截取当前帧
                </Button>
              </div>
            </div>

            <div class="space-y-4">
              <div
                class="relative aspect-video overflow-hidden rounded-2xl border-2 border-dashed group bg-muted/30 cursor-pointer transition-colors hover:border-primary/50"
              >
                <img
                  v-if="tempCoverPreview"
                  :src="tempCoverPreview"
                  class="h-full w-full object-cover"
                />
                <div
                  v-else
                  class="absolute inset-0 flex flex-col items-center justify-center px-6 text-center text-muted-foreground"
                >
                  <UploadCloud class="mb-3 h-10 w-10 opacity-50" />
                  <span class="text-sm font-medium">点击上传封面</span>
                  <span class="mt-1 text-xs opacity-70">建议比例 16:9</span>
                </div>

                <div
                  v-if="tempCoverPreview"
                  class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span class="text-sm font-medium text-white">更换封面</span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  class="absolute inset-0 cursor-pointer opacity-0"
                  @change="onTempCoverChange"
                />
              </div>

              <div class="space-y-2">
                <p class="text-sm font-medium text-foreground">当前封面预览</p>
                <div
                  class="flex aspect-video items-center justify-center overflow-hidden rounded-2xl border bg-muted/20"
                >
                  <img
                    v-if="tempCoverPreview"
                    :src="tempCoverPreview"
                    class="h-full w-full object-cover"
                  />
                  <div v-else class="px-6 text-center text-sm text-muted-foreground">
                    {{
                      canCaptureCover
                        ? '可以从视频中截帧，也可以直接上传自定义封面'
                        : '当前视频浏览器无法预览，请直接上传自定义封面'
                    }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter class="border-t border-border/70 px-6 py-4 sm:justify-end">
          <Button variant="outline" @click="showCoverSetting = false">取消</Button>
          <Button @click="confirmCoverSetting">确定</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style>
.cover-dialog-scroll {
  scrollbar-width: thin;
  scrollbar-color: oklch(var(--foreground) / 0.15) transparent;
}

.cover-dialog-scroll::-webkit-scrollbar {
  width: 6px;
}

.cover-dialog-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.cover-dialog-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: oklch(var(--foreground) / 0.15);
  background-clip: padding-box;
}

.cover-dialog-scroll::-webkit-scrollbar-thumb:hover {
  background: oklch(var(--foreground) / 0.25);
}
</style>
