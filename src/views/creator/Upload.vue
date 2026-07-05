<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  UploadCloud,
  AlertTriangle,
  Image as ImageIcon,
  Bot,
  X,
  Loader2,
  Plus,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import ScheduledPublishPicker from '@/components/creator/ScheduledPublishPicker.vue'
import TagInput from '@/components/creator/TagInput.vue'
import BatchOperationDialog from '@/components/creator/BatchOperationDialog.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import AiChatDialog from '@/components/ai/AiChatDialog.vue'
import {
  uploadChunk,
  getUploadStatus,
  completeUpload,
  uploadImage,
  type UploadStatusResult,
} from '@/api/upload'
import { publishVideo, getPartitions, type Partition, type PublishVideoParams } from '@/api/video'
import {
  DEFAULT_STORAGE_CONFIG,
  getSiteConfig,
  hasStorageConfig,
  normalizeStorageConfig,
  type StorageConfig,
} from '@/api/site'
import { resolveCreatorTagIds } from '@/utils/creator-video'
import { useCreatorBridgeStore } from '@/stores/creatorBridge'

const router = useRouter()
const { toast } = useToast()
const creatorBridgeStore = useCreatorBridgeStore()

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
    | 'paused'
  hash: string
  filePath: string
  instant: boolean
  errorMessage?: string
  abortController?: AbortController
}

interface VideoWorkForm {
  title: string
  description: string
  partitionId: number | undefined
  tags: string[]
  tagInput: string
  isOriginal: boolean
  isPrivate: boolean
  publishType: 'immediate' | 'scheduled'
  publishTime: string
}

interface VideoWork {
  id: string
  parts: VideoPart[]
  form: VideoWorkForm
  coverFile: File | null
  coverPreview: string
  currentCoverUrl: string
  coverSource: 'none' | 'auto' | 'manual'
}

interface UploadFeedback {
  description: string
  title: string
}

const createWorkForm = (): VideoWorkForm => ({
  title: '',
  description: '',
  partitionId: undefined,
  tags: [],
  tagInput: '',
  isOriginal: true,
  isPrivate: false,
  publishType: 'immediate',
  publishTime: '',
})

const createWork = (initialParts: VideoPart[] = []): VideoWork => ({
  id: Math.random().toString(36).substring(2, 9),
  parts: initialParts,
  form: createWorkForm(),
  coverFile: null,
  coverPreview: '',
  currentCoverUrl: '',
  coverSource: 'none',
})

// State
const isDragging = ref(false)
const works = ref<VideoWork[]>([])
const activeWorkIndex = ref(0)
const uploadRootRef = ref<HTMLElement | null>(null)
const initialFileInputRef = ref<HTMLInputElement | null>(null)
const appendFileInputRef = ref<HTMLInputElement | null>(null)
const addWorkFileInputRef = ref<HTMLInputElement | null>(null)

const partitions = ref<Partition[]>([])
const isPublishing = ref(false)
const showBatchDialog = ref(false)
const hasExplicitStorageConfig = ref(false)
const uploadFeedback = ref<UploadFeedback | null>(null)

const storageConfig = ref<StorageConfig>({ ...DEFAULT_STORAGE_CONFIG })

const chunkSizeBytes = computed(() => storageConfig.value.chunkSize * 1024 * 1024)
const maxFileSizeBytes = computed(() => storageConfig.value.maxFileSize * 1024 * 1024)
const effectiveMaxFileSizeBytes = computed(() =>
  hasExplicitStorageConfig.value ? maxFileSizeBytes.value : Number.POSITIVE_INFINITY
)
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
const DEFAULT_PART_LIMIT_TEXT = `最多 ${DEFAULT_STORAGE_CONFIG.maxUploadNum} 个分P`
const FILE_HASH_CACHE_KEY = 'creator-upload-file-hash-cache'
const FILE_HASH_CACHE_LIMIT = 24
const SCHEDULE_MIN_DELAY_MS = 5 * 60 * 1000
const SCHEDULE_MAX_DELAY_MS = 14 * 24 * 60 * 60 * 1000
const uploadConstraintsText = computed(() => {
  if (hasExplicitStorageConfig.value) {
    return `支持 ${COMMON_VIDEO_FORMAT_TEXT}，单文件不超过 ${storageConfig.value.maxFileSize}MB，最多 ${storageConfig.value.maxUploadNum} 个分P，按 ${storageConfig.value.chunkSize}MB 分片上传。若文件未进入列表，会直接提示具体原因。`
  }

  return `支持 ${COMMON_VIDEO_FORMAT_TEXT}，当前站点未公开单文件大小限制，前端不会提前拦截；若服务端拒绝，会在列表中显示具体失败原因。${DEFAULT_PART_LIMIT_TEXT}。`
})

// Active work computed
const activeWork = computed(() => works.value[activeWorkIndex.value])
const activeParts = computed(() => activeWork.value?.parts ?? [])
const allParts = computed(() => works.value.flatMap((w) => w.parts))
const isActiveScheduleDisabled = computed(() => Boolean(activeWork.value?.form.isPrivate))

const isUploadingAny = computed(() =>
  allParts.value.some((p) =>
    ['pending', 'hashing', 'checking', 'uploading', 'merging'].includes(p.status)
  )
)
const showPartLabels = computed(() => activeParts.value.length > 1)

// Cover Setting State
const showCoverSetting = ref(false)
const showAICoverDialog = ref(false)
const applyingAICover = ref(false)
const frameVideoRef = ref<HTMLVideoElement | null>(null)
const previewVideoUrl = ref('')
const previewVideoError = ref(false)
const tempCoverPreview = ref('')
const tempCoverFile = ref<File | null>(null)
const autoCoverPartTokens = new Map<string, string>()
const UPLOAD_STATUS_TIMEOUT = 6000
const UPLOAD_CHUNK_TIMEOUT = 60000
const COMPLETE_UPLOAD_TIMEOUT = 5 * 60 * 1000
const scheduleBoundaryBase = ref(Date.now())

let localPreviewObjectUrl = ''
let scheduleBoundaryTimer: ReturnType<typeof setInterval> | undefined
const canCaptureCover = computed(() =>
  Boolean(activeParts.value[0] && previewVideoUrl.value && !previewVideoError.value)
)
const coverDialogTip = computed(() => {
  if (!activeParts.value[0]) return '请先上传视频后再设置封面'
  if (canCaptureCover.value) return '支持拖动视频进度条截取当前帧，也支持直接上传自定义封面'
  if (previewVideoUrl.value) return '当前视频浏览器无法预览，仅支持本地上传自定义封面'
  return '当前视频预览源尚未就绪，请先上传自定义封面'
})
const aiCoverInitialPrompt = computed(() => {
  return activeWork.value?.form.title || activeParts.value[0]?.title || ''
})
const importedAIDraftIds = new Set<string>()

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

const formatMegabytes = (value: number) => {
  if (!Number.isFinite(value)) return '0MB'
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)}MB`
}

const formatFileSizeInMegabytes = (file: File) => {
  return formatMegabytes(file.size / (1024 * 1024))
}

const getFileHashCacheKey = (file: File) => {
  return `${file.name}::${file.size}::${file.lastModified}`
}

const readFileHashCache = () => {
  try {
    const raw = window.localStorage.getItem(FILE_HASH_CACHE_KEY)
    if (!raw) return {} as Record<string, { hash: string; updatedAt: number }>

    const parsed = JSON.parse(raw) as Record<string, { hash: string; updatedAt: number }>
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {} as Record<string, { hash: string; updatedAt: number }>
  }
}

const writeFileHashCache = (cache: Record<string, { hash: string; updatedAt: number }>) => {
  try {
    const entries = Object.entries(cache)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, FILE_HASH_CACHE_LIMIT)

    window.localStorage.setItem(FILE_HASH_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Ignore local cache failures and continue hashing normally.
  }
}

const getCachedFileHash = (file: File) => {
  return readFileHashCache()[getFileHashCacheKey(file)]?.hash ?? ''
}

const setCachedFileHash = (file: File, hash: string) => {
  if (!hash) return

  const cache = readFileHashCache()
  cache[getFileHashCacheKey(file)] = {
    hash,
    updatedAt: Date.now(),
  }
  writeFileHashCache(cache)
}

const showFileSizeLimitToast = (files: File[]) => {
  if (files.length === 0) return

  const firstFile = files[0]
  if (!firstFile) return
  const title = files.length === 1 ? '文件超过大小上限' : '部分文件超过大小上限'
  const description =
    files.length === 1
      ? `${firstFile.name} 当前约 ${formatFileSizeInMegabytes(firstFile)}，单文件最大只支持 ${storageConfig.value.maxFileSize}MB。`
      : `${formatRejectedSummary(
          files.map((file) => file.name),
          '部分文件'
        )} 超过单文件 ${storageConfig.value.maxFileSize}MB 上限，请压缩后重试。`

  uploadFeedback.value = { title, description }
}

const getOversizeIssueText = (files: File[]) => {
  const [firstFile] = files
  if (!firstFile) {
    return `超过 ${storageConfig.value.maxFileSize}MB`
  }

  if (files.length === 1) {
    return `${firstFile.name} 当前约 ${formatFileSizeInMegabytes(firstFile)}，单文件最大只能上传 ${storageConfig.value.maxFileSize}MB`
  }

  return `${formatRejectedSummary(
    files.map((file) => file.name),
    '部分文件'
  )} 超过单文件 ${storageConfig.value.maxFileSize}MB 上限`
}

const showPartCountLimitToast = (maxNum: number, currentCount: number) => {
  const remaining = Math.max(maxNum - currentCount, 0)
  const description =
    remaining > 0
      ? `当前作品已经有 ${currentCount} 个分P，这次还能再添加 ${remaining} 个。`
      : `当前作品已经达到 ${currentCount} 个分P 上限，请先删除部分分P后再继续上传。`

  uploadFeedback.value = {
    title: `单个作品最多只能上传 ${maxNum} 个分P`,
    description,
  }
}

const revokeLocalPreviewObjectUrl = () => {
  if (localPreviewObjectUrl) {
    URL.revokeObjectURL(localPreviewObjectUrl)
    localPreviewObjectUrl = ''
  }
}

const syncPreviewVideoUrl = () => {
  const firstPart = activeParts.value[0]
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
  if (!activeWork.value) return
  tempCoverPreview.value = activeWork.value.coverPreview
  tempCoverFile.value = activeWork.value.coverFile
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

const clearAutoCover = (work?: VideoWork) => {
  if (!work || work.coverSource !== 'auto') return
  work.coverFile = null
  work.coverPreview = ''
  work.currentCoverUrl = ''
  work.coverSource = 'none'
  autoCoverPartTokens.delete(work.id)
}

const captureCoverFromVideoElement = async (video: HTMLVideoElement, fileName: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法初始化封面画布')
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })
  if (!blob) {
    throw new Error('封面生成失败')
  }

  return {
    preview: canvas.toDataURL('image/jpeg', 0.92),
    file: new File([blob], fileName, { type: 'image/jpeg' }),
  }
}

const autoRecommendCoverForPart = async (part: VideoPart) => {
  const work = works.value.find((candidate) => candidate.parts.some((item) => item.id === part.id))
  if (!work || work.parts[0]?.id !== part.id || work.coverSource === 'manual') {
    return
  }
  if (part.status !== 'success') return

  const token = `${part.id}:${part.hash || part.file.name}:${part.file.size}:${part.file.lastModified}`
  if (
    work.coverSource === 'auto' &&
    work.coverPreview &&
    autoCoverPartTokens.get(work.id) === token
  ) {
    return
  }

  const objectUrl = URL.createObjectURL(part.file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.crossOrigin = 'anonymous'

  try {
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        cleanup()
        reject(new Error('封面预览超时'))
      }, 12000)

      const cleanup = () => {
        clearTimeout(timeoutId)
        video.onloadeddata = null
        video.onerror = null
      }

      video.onloadeddata = () => {
        cleanup()
        resolve()
      }
      video.onerror = () => {
        cleanup()
        reject(new Error('封面预览失败'))
      }

      video.src = objectUrl
      void video.load()
    })

    const duration = Number(video.duration)
    if (Number.isFinite(duration) && duration > 0.6) {
      const targetTime = Math.min(Math.max(duration * 0.18, 0.4), Math.max(duration - 0.1, 0.4), 3)
      if (targetTime > 0.05) {
        await new Promise<void>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
            cleanup()
            resolve()
          }, 6000)

          const cleanup = () => {
            clearTimeout(timeoutId)
            video.onseeked = null
            video.onerror = null
          }

          video.onseeked = () => {
            cleanup()
            resolve()
          }
          video.onerror = () => {
            cleanup()
            reject(new Error('封面定位失败'))
          }

          video.currentTime = targetTime
        })
      }
    }

    const cover = await captureCoverFromVideoElement(video, `auto-cover-${part.id}.jpg`)
    const latestWork = works.value.find((candidate) => candidate.id === work.id)
    if (!latestWork || latestWork.parts[0]?.id !== part.id || latestWork.coverSource === 'manual') {
      return
    }

    latestWork.coverFile = cover.file
    latestWork.coverPreview = cover.preview
    latestWork.currentCoverUrl = ''
    latestWork.coverSource = 'auto'
    autoCoverPartTokens.set(latestWork.id, token)
  } catch (error) {
    console.warn('Auto cover recommendation skipped', error)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const confirmCoverSetting = () => {
  if (activeWork.value) {
    activeWork.value.coverPreview = tempCoverPreview.value
    activeWork.value.coverFile = tempCoverFile.value
    activeWork.value.currentCoverUrl = tempCoverFile.value ? '' : activeWork.value.currentCoverUrl
    activeWork.value.coverSource = tempCoverFile.value ? 'manual' : activeWork.value.coverSource
    autoCoverPartTokens.delete(activeWork.value.id)
  }
  showCoverSetting.value = false
}

const applyLocalCoverFile = (coverFile: File, coverPreview: string) => {
  if (!activeWork.value) return
  activeWork.value.coverFile = coverFile
  activeWork.value.coverPreview = coverPreview
  activeWork.value.currentCoverUrl = ''
  activeWork.value.coverSource = 'manual'
  autoCoverPartTokens.delete(activeWork.value.id)
}

const handleAICoverPick = (payload: { file: File; sourceUrl: string; prompt: string }) => {
  if (!activeWork.value) return
  applyingAICover.value = true
  try {
    applyLocalCoverFile(payload.file, payload.sourceUrl)
    showAICoverDialog.value = false
    toast({ title: 'AI 封面已应用' })
  } catch (error) {
    console.error('Apply AI cover failed', error)
    toast({ title: 'AI 封面应用失败', variant: 'destructive' })
  } finally {
    applyingAICover.value = false
  }
}

const importPendingAIVideoDraft = () => {
  const draft = creatorBridgeStore.pendingVideoImport
  if (!draft || importedAIDraftIds.has(draft.id)) return

  importedAIDraftIds.add(draft.id)
  const title = draft.title.trim() || draft.file.name.replace(/\.[^/.]+$/, '')
  const part: VideoPart = {
    id: Math.random().toString(36).substring(2, 9),
    file: draft.file,
    title,
    progress: 0,
    status: 'pending',
    hash: '',
    filePath: '',
    instant: false,
  }
  const work = createWork([part])
  work.form.title = title
  work.form.description = draft.prompt
  works.value.push(work)
  activeWorkIndex.value = works.value.length - 1
  creatorBridgeStore.clearPendingVideoImport()
  toast({ title: 'AI 视频已导入投稿页，开始上传' })
  processUploadQueue()
}

onMounted(async () => {
  const [partitionRes, configRes] = await Promise.allSettled([getPartitions(), getSiteConfig()])
  if (partitionRes.status === 'fulfilled') {
    partitions.value = partitionRes.value
  }
  if (configRes.status === 'fulfilled') {
    const siteStorage = configRes.value.site?.storage
    hasExplicitStorageConfig.value = hasStorageConfig(siteStorage)
    storageConfig.value = normalizeStorageConfig(siteStorage)
  }

  refreshScheduleBoundary()
  scheduleBoundaryTimer = window.setInterval(refreshScheduleBoundary, 30000)
  window.addEventListener('dragover', handleWindowDragOver)
  window.addEventListener('drop', handleWindowDrop)
  importPendingAIVideoDraft()
})

watch(
  () => creatorBridgeStore.pendingVideoImport?.id,
  (draftId) => {
    if (!draftId) return
    importPendingAIVideoDraft()
  }
)

watch(
  () => [
    activeWorkIndex.value,
    activeParts.value[0]?.id,
    activeParts.value[0]?.status,
    activeParts.value[0]?.filePath,
  ],
  () => {
    syncPreviewVideoUrl()
  },
  { immediate: true }
)

watch(
  () => [activeWork.value?.form.publishType, activeWork.value?.form.isPrivate] as const,
  ([publishType, isPrivate]) => {
    if (!activeWork.value) return
    if (isPrivate) {
      if (activeWork.value.form.publishType !== 'immediate') {
        activeWork.value.form.publishType = 'immediate'
      }
      activeWork.value.form.publishTime = ''
      return
    }
    if (publishType !== 'scheduled') return
    refreshScheduleBoundary()
    activeWork.value.form.publishTime =
      normalizeScheduledPublishTime(activeWork.value.form.publishTime) ||
      scheduledPublishMinValue.value
  }
)

watch([scheduledPublishMinValue, scheduledPublishMaxValue], () => {
  if (
    !activeWork.value ||
    activeWork.value.form.isPrivate ||
    activeWork.value.form.publishType !== 'scheduled' ||
    !activeWork.value.form.publishTime
  )
    return
  const normalized = normalizeScheduledPublishTime(activeWork.value.form.publishTime)
  if (normalized && normalized !== activeWork.value.form.publishTime) {
    activeWork.value.form.publishTime = normalized
  }
})

// Full-file SHA-256 via Web Worker with progress reporting
const calculateFullSHA256 = (
  file: File,
  signal?: AbortSignal,
  onProgress?: (pct: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/upload-hash.worker.ts', import.meta.url), {
      type: 'module',
    })

    const cleanup = () => {
      worker.terminate()
      signal?.removeEventListener('abort', handleAbort)
    }

    const handleAbort = () => {
      cleanup()
      reject(new Error('canceled'))
    }

    signal?.addEventListener('abort', handleAbort, { once: true })

    worker.onmessage = (
      e: MessageEvent<
        | { type: 'done'; hash: string }
        | { type: 'error'; error: string }
        | { type: 'progress'; pct: number }
      >
    ) => {
      if (e.data.type === 'progress') {
        onProgress?.(e.data.pct)
      } else if (e.data.type === 'done') {
        resolve(e.data.hash)
        cleanup()
      } else if (e.data.type === 'error') {
        reject(new Error(e.data.error))
        cleanup()
      }
    }
    worker.onerror = (err) => {
      reject(new Error(err.message || '文件哈希计算失败'))
      cleanup()
    }
    worker.postMessage({
      file,
      chunkSize: chunkSizeBytes.value,
    })
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
const activeUploads = ref(0)

const queuePosition = (part: VideoPart): number => {
  if (part.status !== 'pending') return 0
  let pos = 0
  for (const p of allParts.value) {
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

const exceedsConfiguredFileSizeLimit = (file: File) => {
  return file.size > effectiveMaxFileSizeBytes.value
}

const processUploadQueue = () => {
  while (activeUploads.value < storageConfig.value.maxUploadNum) {
    let next: VideoPart | undefined
    for (const work of works.value) {
      next = work.parts.find((p) => p.status === 'pending')
      if (next) break
    }
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
    uploadFeedback.value = {
      title: '没有可上传的视频文件',
      description:
        unsupportedFiles.length > 0
          ? `${formatRejectedSummary(
              unsupportedFiles.map((entry) => entry.file.name),
              '所选文件'
            )} 未被识别为常见视频格式，请检查扩展名或重新导出。`
          : `请上传 ${COMMON_VIDEO_FORMAT_TEXT}。`,
    }
    return
  }

  const maxNum = storageConfig.value.maxUploadNum
  const currentParts = activeWork.value?.parts ?? []
  const remaining = maxNum - currentParts.length
  if (remaining <= 0) {
    showPartCountLimitToast(maxNum, currentParts.length)
    return
  }

  const filesToAdd = videoFiles.slice(0, remaining)
  const ignoredByLimit = videoFiles.slice(remaining)

  const oversized = hasExplicitStorageConfig.value
    ? filesToAdd.filter((file) => exceedsConfiguredFileSizeLimit(file))
    : []
  const validFiles = filesToAdd.filter((file) => !exceedsConfiguredFileSizeLimit(file))

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
  if (hasExplicitStorageConfig.value && oversized.length > 0) {
    uploadIssues.push(getOversizeIssueText(oversized))
  }
  if (uploadIssues.length > 0) {
    uploadFeedback.value = {
      title: validFiles.length > 0 ? '部分文件未加入上传队列' : '所选文件未通过上传校验',
      description: uploadIssues.join('；'),
    }
  }

  if (validFiles.length === 0) return
  uploadFeedback.value = null

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

  if (activeWork.value) {
    if (!activeWork.value.form.title && newParts[0]) {
      activeWork.value.form.title = newParts[0].title
    }
    activeWork.value.parts.push(...newParts)
  } else {
    newParts.forEach((part) => {
      const work = createWork([part])
      work.form.title = part.title
      works.value.push(work)
    })
    activeWorkIndex.value = 0
  }
  processUploadQueue()
}

const uploadPart = async (part: VideoPart, isResume = false) => {
  part.abortController = new AbortController()
  const signal = part.abortController.signal

  try {
    if (!isResume) {
      part.progress = 0
      part.errorMessage = ''
      part.instant = false
    } else {
      part.errorMessage = ''
    }

    if (!isResume || !part.hash) {
      const cachedHash = getCachedFileHash(part.file)
      if (cachedHash) {
        part.hash = cachedHash
        part.progress = 100
      } else {
        part.hash = await calculateFullSHA256(part.file, signal, (pct) => {
          part.progress = pct
        })
        setCachedFileHash(part.file, part.hash)
      }
    }

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
      void autoRecommendCoverForPart(part)
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
      void autoRecommendCoverForPart(part)
    } finally {
      releaseCompleteLock()
    }
  } catch (error: unknown) {
    if ((error instanceof Error && error.message === 'canceled') || signal.aborted) {
      if (part.status !== 'paused') part.status = 'canceled'
    } else {
      part.status = 'error'
      const err = error as { response?: { data?: { msg?: string } }; message?: string }
      part.errorMessage = err.response?.data?.msg || err.message || '上传失败'
      console.error('Upload failed for part', part.title, error)
    }
  }
}

const removePart = (index: number) => {
  if (!activeWork.value) return
  const work = activeWork.value
  const part = activeWork.value.parts[index]
  const removedFirst = index === 0
  if (part?.abortController) {
    part.abortController.abort()
  }
  activeWork.value.parts.splice(index, 1)
  if (removedFirst) {
    previewVideoError.value = false
    clearAutoCover(work)
    const nextFirst = work.parts[0]
    if (nextFirst?.status === 'success') {
      void autoRecommendCoverForPart(nextFirst)
    }
  }
  processUploadQueue()
}

const pausePart = (part: VideoPart) => {
  if (!['hashing', 'checking', 'uploading', 'merging'].includes(part.status)) return
  part.status = 'paused'
  part.abortController?.abort()
}

const resumePart = (part: VideoPart) => {
  if (part.status !== 'paused' && part.status !== 'error' && part.status !== 'canceled') return
  part.status = 'hashing'
  activeUploads.value++
  void uploadPart(part, true).finally(() => {
    activeUploads.value--
    processUploadQueue()
  })
}

const removeWork = (index: number) => {
  const work = works.value[index]
  if (!work) return
  work.parts.forEach((p) => p.abortController?.abort())
  works.value.splice(index, 1)
  if (activeWorkIndex.value >= works.value.length) {
    activeWorkIndex.value = Math.max(0, works.value.length - 1)
  }
  previewVideoError.value = false
}

const onAddWorkFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  const allFiles = Array.from(target.files)
  const videoFiles = allFiles.filter(isLikelyVideoFile)
  if (videoFiles.length === 0) {
    uploadFeedback.value = {
      title: '没有可上传的视频文件',
      description: `请上传 ${COMMON_VIDEO_FORMAT_TEXT}。`,
    }
    target.value = ''
    return
  }
  const validFiles = videoFiles.filter((file) => !exceedsConfiguredFileSizeLimit(file))
  if (validFiles.length === 0) {
    if (hasExplicitStorageConfig.value) {
      showFileSizeLimitToast(videoFiles)
    } else {
      uploadFeedback.value = {
        title: '没有可加入上传队列的视频',
        description: '当前选择的文件未通过上传校验，请检查后重试。',
      }
    }
    target.value = ''
    return
  }
  uploadFeedback.value = null
  validFiles.forEach((file) => {
    const part: VideoPart = {
      id: Math.random().toString(36).substring(2, 9),
      file,
      title: file.name.replace(/\.[^/.]+$/, ''),
      progress: 0,
      status: 'pending',
      hash: '',
      filePath: '',
      instant: false,
    }
    const work = createWork([part])
    work.form.title = part.title
    works.value.push(work)
  })
  activeWorkIndex.value = works.value.length - 1
  target.value = ''
  processUploadQueue()
}

const replaceFileInputRef = ref<HTMLInputElement | null>(null)
const replaceTargetPartIndex = ref<number | null>(null)

const openReplacePicker = (index: number) => {
  replaceTargetPartIndex.value = index
  replaceFileInputRef.value?.click()
}

const onReplaceFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files?.length || replaceTargetPartIndex.value === null) return
  const file = target.files[0]
  if (!file || !activeWork.value) return

  const reason = getVideoFileRejectionReason(file)
  if (reason) {
    toast({ title: '无法更换', description: `${file.name} ${reason}`, variant: 'destructive' })
    target.value = ''
    return
  }
  if (exceedsConfiguredFileSizeLimit(file)) {
    showFileSizeLimitToast([file])
    target.value = ''
    return
  }

  const part = activeWork.value.parts[replaceTargetPartIndex.value]
  if (!part) return
  if (part.abortController) {
    part.abortController.abort()
  }

  const oldName = part.file.name.replace(/\.[^/.]+$/, '')
  if (part.title === oldName || !part.title) {
    part.title = file.name.replace(/\.[^/.]+$/, '')
  }

  if (replaceTargetPartIndex.value === 0) {
    clearAutoCover(activeWork.value)
  }

  part.file = file
  part.progress = 0
  part.status = 'pending'
  part.hash = ''
  part.filePath = ''
  part.errorMessage = ''
  part.instant = false

  target.value = ''
  replaceTargetPartIndex.value = null

  processUploadQueue()
}

const handleBatchApply = (data: { isOriginal: boolean; tags: string[] }) => {
  for (const work of works.value) {
    work.form.isOriginal = data.isOriginal
    if (data.tags.length > 0) {
      const merged = [...new Set([...work.form.tags, ...data.tags])]
      work.form.tags = merged.slice(0, 10)
    }
  }
  toast({ title: '批量设置已应用' })
}

const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (works.value.length > 0) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  revokeLocalPreviewObjectUrl()
  allParts.value.forEach((p) => p.abortController?.abort())
  if (scheduleBoundaryTimer) {
    clearInterval(scheduleBoundaryTimer)
  }
  window.removeEventListener('dragover', handleWindowDragOver)
  window.removeEventListener('drop', handleWindowDrop)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

// Publish
const handlePublish = async () => {
  if (works.value.length === 0) {
    toast({ title: '请至少添加一个作品', variant: 'destructive' })
    return
  }
  for (let i = 0; i < works.value.length; i++) {
    const work = works.value[i]!
    const wLabel = works.value.length > 1 ? `作品${i + 1}：` : ''
    if (work.parts.length === 0) {
      toast({ title: `${wLabel}请至少上传一个视频`, variant: 'destructive' })
      activeWorkIndex.value = i
      return
    }
    if (work.parts.some((p) => p.status !== 'success')) {
      toast({ title: `${wLabel}请等待所有视频上传完成`, variant: 'destructive' })
      activeWorkIndex.value = i
      return
    }
    if (!work.form.title) {
      toast({ title: `${wLabel}请填写标题`, variant: 'destructive' })
      activeWorkIndex.value = i
      return
    }
    if (!work.form.partitionId) {
      toast({ title: `${wLabel}请选择分区`, variant: 'destructive' })
      activeWorkIndex.value = i
      return
    }
    if (!work.coverFile && !work.coverPreview) {
      toast({ title: `${wLabel}请上传封面`, variant: 'destructive' })
      activeWorkIndex.value = i
      return
    }
  }

  try {
    isPublishing.value = true
    for (const work of works.value) {
      let publishTimeStr: string | undefined
      if (!work.form.isPrivate && work.form.publishType === 'scheduled') {
        const normalized = normalizeScheduledPublishTime(work.form.publishTime)
        if (!normalized) {
          toast({ title: '发布时间格式不正确', variant: 'destructive' })
          return
        }
        publishTimeStr = new Date(normalized).toISOString()
      }
      const tagIds = await resolveCreatorTagIds(work.form.tags)
      let coverUrl = work.currentCoverUrl
      if (work.coverFile) {
        const coverRes = await uploadImage(work.parts[0]?.hash || '', work.coverFile)
        coverUrl = coverRes.imageUrl
      }
      const publishPayload: PublishVideoParams = {
        title: work.form.title,
        description: work.form.description,
        partitionId: work.form.partitionId!,
        tags: tagIds,
        isOriginal: work.form.isOriginal,
        isPrivate: work.form.isPrivate,
        coverUrl,
        publishTime: publishTimeStr,
        ...(work.parts.length === 1
          ? {
              filePath: work.parts[0]!.filePath,
              fileName: work.parts[0]!.file.name,
              fileHash: work.parts[0]!.hash,
            }
          : {
              parts: work.parts.map((p) => ({
                title: p.title,
                filePath: p.filePath,
                fileName: p.file.name,
                fileHash: p.hash,
              })),
            }),
      }
      await publishVideo(publishPayload)
    }
    toast({ title: works.value.length > 1 ? `${works.value.length} 个作品发布成功` : '发布成功' })
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
    <input
      ref="addWorkFileInputRef"
      type="file"
      :accept="VIDEO_INPUT_ACCEPT"
      multiple
      class="hidden"
      @change="onAddWorkFileChange"
    />
    <input
      ref="replaceFileInputRef"
      type="file"
      :accept="VIDEO_INPUT_ACCEPT"
      class="hidden"
      @change="onReplaceFileChange"
    />

    <div
      v-if="uploadFeedback"
      class="upload-feedback-alert mb-6 flex items-start gap-3 rounded-2xl px-4 py-4"
    >
      <div
        class="upload-feedback-alert__icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      >
        <AlertTriangle class="h-4.5 w-4.5" />
      </div>
      <div class="min-w-0 space-y-1">
        <p class="upload-feedback-alert__title text-sm font-semibold tracking-[0.01em]">
          {{ uploadFeedback.title }}
        </p>
        <p class="upload-feedback-alert__description text-sm leading-6">
          {{ uploadFeedback.description }}
        </p>
      </div>
    </div>

    <!-- Step 1: Upload Area -->
    <div
      v-if="works.length === 0"
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
        {{ uploadConstraintsText }}
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
      <!-- Video Works Section -->
      <div class="bg-card rounded-2xl border p-8 shadow-sm">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-bold tracking-tight">发布视频</h2>
          <Button
            variant="outline"
            size="sm"
            class="hover:border-primary hover:text-primary hover:bg-primary/5"
            @click="showBatchDialog = true"
            >批量操作</Button
          >
        </div>

        <!-- Work Tabs -->
        <div class="flex items-center gap-2 mb-4 overflow-x-auto pb-2 pt-2 pr-2 upload-tabs-scroll">
          <div
            v-for="(work, wIdx) in works"
            :key="work.id"
            class="upload-work-tab flex-shrink-0 relative flex flex-col items-start gap-1 p-3 rounded-lg border cursor-pointer transition-all w-[200px] group"
            :class="
              activeWorkIndex === wIdx
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-foreground border-border hover:border-primary/50'
            "
            @click="activeWorkIndex = wIdx"
          >
            <div class="w-full pr-4">
              <span class="truncate block text-[13px] font-medium w-full text-left">{{
                work.form.title || work.parts[0]?.file.name || `作品${wIdx + 1}`
              }}</span>
            </div>
            <div
              v-if="work.parts.length > 0 && work.parts.every((p) => p.status === 'success')"
              class="flex items-center gap-1 shrink-0 mt-0.5"
              :class="
                activeWorkIndex === wIdx
                  ? 'text-[var(--signal-foreground)] opacity-90'
                  : 'text-[var(--status-success-ink)]'
              "
            >
              <CheckCircle2
                class="w-3.5 h-3.5"
                :class="
                  activeWorkIndex === wIdx
                    ? 'fill-primary-foreground text-primary'
                    : 'fill-[var(--status-success)] text-[var(--signal-foreground)]'
                "
              />
              <span class="text-[11px] font-medium">上传完成</span>
            </div>
            <div
              v-else-if="
                work.parts.length > 0 &&
                work.parts.some((p) =>
                  ['uploading', 'hashing', 'checking', 'merging', 'pending'].includes(p.status)
                )
              "
              class="flex items-center gap-1 shrink-0 mt-0.5"
              :class="activeWorkIndex === wIdx ? 'text-white/80' : 'text-primary'"
            >
              <Loader2 class="w-3 h-3 animate-spin" />
              <span class="text-[11px] font-medium">上传中</span>
            </div>
            <div v-else class="h-4"></div>

            <button
              v-if="works.length > 1"
              class="absolute top-2 right-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              :class="
                activeWorkIndex === wIdx
                  ? 'text-white/80 hover:text-white'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click.stop="removeWork(wIdx)"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            class="flex-shrink-0 flex items-center gap-1 px-4 py-2.5 rounded-lg border border-dashed text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            @click="addWorkFileInputRef?.click()"
          >
            <Plus class="h-3.5 w-3.5" />
            添加视频
          </button>
        </div>

        <!-- Active Work Parts -->
        <template v-if="activeWork">
          <Button
            variant="ghost"
            size="sm"
            class="text-primary hover:bg-primary/10 mb-3"
            :disabled="activeParts.length >= storageConfig.maxUploadNum"
            @click="openVideoPicker('append')"
          >
            <Plus class="mr-1 h-3.5 w-3.5" />
            添加分P
          </Button>

          <div class="space-y-2">
            <div
              v-for="(part, index) in activeParts"
              :key="part.id"
              class="flex items-center gap-4 p-4 rounded-lg border bg-muted/20"
            >
              <div
                v-if="showPartLabels"
                class="flex-shrink-0 w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm"
              >
                P{{ index + 1 }}
              </div>
              <div
                v-else
                class="flex-shrink-0 w-8 h-8 rounded bg-primary/10 text-primary flex items-center justify-center"
              >
                <Play class="h-4 w-4" />
              </div>
              <div class="flex-grow min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sm font-medium truncate" :title="part.file.name">{{
                    part.file.name
                  }}</span>
                  <div
                    v-if="part.status === 'success'"
                    class="ml-3 flex shrink-0 items-center gap-1.5 text-[var(--status-success-ink)]"
                  >
                    <CheckCircle2
                      class="h-[16px] w-[16px] fill-[var(--status-success)] text-[var(--signal-foreground)]"
                    />
                    <span class="text-xs font-medium">{{
                      part?.instant ? '秒传完成' : '上传完成'
                    }}</span>
                  </div>
                </div>
                <div class="mb-3">
                  <Label :for="`part-title-${part.id}`" class="sr-only">分P标题</Label>
                  <input
                    :id="`part-title-${part.id}`"
                    :value="part.title"
                    maxlength="200"
                    class="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="请输入分P标题"
                    @input="part.title = ($event.target as HTMLInputElement).value"
                  />
                </div>
                <div v-if="part.status !== 'success'" class="flex items-center gap-3">
                  <div class="flex-grow bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      class="h-full transition-all duration-300"
                      :class="{
                        'bg-primary': part.status === 'uploading',
                        'bg-destructive': part.status === 'error',
                        'bg-[var(--status-warning)]': ['hashing', 'checking', 'merging'].includes(
                          part.status
                        ),
                        'bg-muted-foreground': ['pending', 'canceled', 'paused'].includes(
                          part.status
                        ),
                      }"
                      :style="{ width: `${part.progress}%` }"
                    ></div>
                  </div>
                  <span
                    class="text-xs w-16 text-right shrink-0"
                    :class="{
                      'text-destructive': part.status === 'error',
                      'text-[var(--status-warning-ink)]': [
                        'hashing',
                        'checking',
                        'merging',
                      ].includes(part.status),
                      'text-muted-foreground': [
                        'pending',
                        'uploading',
                        'canceled',
                        'paused',
                      ].includes(part.status),
                    }"
                  >
                    <template v-if="part.status === 'error'"
                      ><span :title="part.errorMessage">上传失败</span></template
                    >
                    <template v-else-if="part.status === 'pending'"
                      >排队 #{{ queuePosition(part) }}</template
                    >
                    <template v-else-if="part.status === 'hashing'">计算哈希</template>
                    <template v-else-if="part.status === 'checking'">校验中</template>
                    <template v-else-if="part.status === 'merging'">合并中</template>
                    <template v-else-if="part.status === 'canceled'">已取消</template>
                    <template v-else-if="part.status === 'paused'">已暂停</template>
                    <template v-else>{{ part.progress }}%</template>
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-7 text-xs text-primary hover:bg-primary/10 px-2"
                  @click="openReplacePicker(index)"
                >
                  <RefreshCw class="h-3.5 w-3.5 mr-1" />更换视频
                </Button>
                <Button
                  v-if="['uploading', 'hashing', 'checking'].includes(part.status)"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  @click="pausePart(part)"
                >
                  <Pause class="h-3.5 w-3.5" />
                </Button>
                <Button
                  v-if="
                    part.status === 'paused' ||
                    part.status === 'error' ||
                    part.status === 'canceled'
                  "
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-primary hover:bg-primary/10"
                  @click="resumePart(part)"
                >
                  <RotateCcw class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  @click="removePart(index)"
                >
                  <X class="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Basic Settings Section -->
      <div v-if="activeWork" class="bg-card rounded-2xl border p-8 shadow-sm">
        <h2 class="text-2xl font-bold tracking-tight mb-8">基本设置</h2>

        <div class="max-w-4xl space-y-10">
          <!-- Cover -->
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <Label class="text-base">视频封面 <span class="text-red-500">*</span></Label>
              <span title="AI 生成封面">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  class="h-9 w-9 rounded-full"
                  :disabled="applyingAICover"
                  @click="showAICoverDialog = true"
                >
                  <Loader2 v-if="applyingAICover" class="h-4 w-4 animate-spin" />
                  <Bot v-else class="h-4 w-4" />
                </Button>
              </span>
            </div>

            <div class="flex flex-col gap-4">
              <!-- Main Cover -->
              <div
                class="relative w-[240px] aspect-video rounded-xl border-2 overflow-hidden group bg-muted/30 transition-all duration-300 hover:shadow-lg hover:border-primary/50"
                :class="
                  !activeWork?.coverPreview ? 'border-dashed' : 'border-transparent shadow-md'
                "
              >
                <img
                  v-if="activeWork?.coverPreview"
                  :src="activeWork.coverPreview"
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
                  v-if="!activeWork?.coverPreview"
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
              :model-value="activeWork?.form.title ?? ''"
              placeholder="给视频起个响亮的标题吧"
              class="text-lg"
              @update:model-value="
                (v) => {
                  if (activeWork) activeWork.form.title = String(v)
                }
              "
            />
            <div class="text-xs text-muted-foreground text-right">
              {{ activeWork?.form.title.length ?? 0 }}/80
            </div>
          </div>

          <!-- Type (Original / Copied) -->
          <div class="space-y-2">
            <Label class="text-base">类型 <span class="text-red-500">*</span></Label>
            <div class="flex gap-6 mt-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="activeWork.form.isOriginal"
                  type="radio"
                  :value="true"
                  class="accent-primary w-4 h-4"
                />
                <span class="text-sm">自制</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="activeWork.form.isOriginal"
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
                  activeWork?.form.partitionId === p.id
                    ? 'bg-primary text-primary-foreground font-medium shadow-md shadow-primary/30 scale-105 border-transparent'
                    : 'hover:bg-muted/80 hover:scale-105 border-border/60 bg-card'
                "
                @click="
                  () => {
                    if (activeWork) activeWork.form.partitionId = p.id
                  }
                "
              >
                {{ p.name }}
              </div>
            </div>
          </div>

          <!-- Tags -->
          <div class="space-y-2">
            <Label class="text-base">标签</Label>
            <TagInput
              :model-value="activeWork.form.tags"
              :max="10"
              @update:model-value="
                (v) => {
                  if (activeWork) activeWork.form.tags = v
                }
              "
            />
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <Label for="desc" class="text-base">简介</Label>
            <textarea
              id="desc"
              :value="activeWork?.form.description ?? ''"
              class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[120px] resize-y"
              placeholder="填写更全面的相关信息，让更多人能找到你的视频"
              rows="4"
              @input="
                (e) => {
                  if (activeWork)
                    activeWork.form.description = (e.target as HTMLTextAreaElement).value
                }
              "
            ></textarea>
          </div>

          <!-- Privacy -->
          <div class="space-y-3">
            <Label class="text-base">可见性</Label>
            <label
              class="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4 transition-colors hover:border-primary/40"
            >
              <input
                v-model="activeWork.form.isPrivate"
                type="checkbox"
                class="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-foreground">设为私密视频</span>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    :class="
                      activeWork.form.isPrivate
                        ? 'bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]'
                        : 'bg-[var(--status-success-soft)] text-[var(--status-success-ink)]'
                    "
                  >
                    {{ activeWork.form.isPrivate ? '仅自己可见' : '公开视频' }}
                  </span>
                </div>
                <p class="text-sm text-muted-foreground">
                  私密作品不会出现在公开列表、推荐和搜索中，且前端不允许设置定时发布。
                </p>
              </div>
            </label>
          </div>

          <!-- Publish Time -->
          <div class="space-y-2">
            <Label class="text-base">发布时间</Label>
            <div class="flex flex-col gap-4 mt-2">
              <div class="flex gap-6">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    v-model="activeWork.form.publishType"
                    type="radio"
                    value="immediate"
                    class="accent-primary w-4 h-4"
                  />
                  <span class="text-sm">立即发布</span>
                </label>
                <label
                  class="flex items-center gap-2 transition-opacity"
                  :class="
                    isActiveScheduleDisabled
                      ? 'cursor-not-allowed text-muted-foreground/60 opacity-50'
                      : 'cursor-pointer'
                  "
                >
                  <input
                    v-model="activeWork.form.publishType"
                    type="radio"
                    value="scheduled"
                    class="accent-primary w-4 h-4"
                    :disabled="isActiveScheduleDisabled"
                  />
                  <span class="text-sm">定时发布</span>
                </label>
              </div>

              <div
                v-if="isActiveScheduleDisabled"
                class="rounded-2xl border border-dashed border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground"
              >
                私密视频仅支持立即发布。取消私密后，才可以设置最早 5 分钟、最晚 15 天的定时发布。
              </div>

              <div
                v-if="activeWork?.form.publishType === 'scheduled'"
                class="mt-3 flex items-center gap-4 rounded-2xl border border-border/60 bg-muted/20 p-4"
              >
                <ScheduledPublishPicker v-model="activeWork.form.publishTime" />
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

    <!-- Batch Operations Dialog -->
    <BatchOperationDialog
      :open="showBatchDialog"
      @update:open="showBatchDialog = $event"
      @apply="handleBatchApply"
    />

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

    <AiChatDialog
      :open="showAICoverDialog"
      mode="cover-picker"
      initial-model="image"
      :initial-prompt="aiCoverInitialPrompt"
      @update:open="showAICoverDialog = $event"
      @cover-pick="handleAICoverPick"
    />
  </div>
</template>

<style>
.upload-feedback-alert {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--status-warning-border);
  background: linear-gradient(
    135deg,
    color-mix(in oklch, var(--status-warning-soft) 88%, var(--bg-surface-1)),
    color-mix(in oklch, var(--status-warning-soft) 74%, var(--bg-surface-2))
  );
  box-shadow:
    inset 0 1px 0 color-mix(in oklch, var(--bg-surface-0) 88%, transparent),
    0 22px 56px -40px color-mix(in oklch, var(--status-warning) 34%, transparent);
  backdrop-filter: blur(14px);
}

.upload-feedback-alert__icon {
  background: color-mix(in oklch, var(--status-warning) 16%, var(--bg-surface-0));
  color: color-mix(in oklch, var(--status-warning-ink) 74%, var(--text-1));
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--status-warning-border) 82%, transparent);
}

.upload-feedback-alert__title {
  color: color-mix(in oklch, var(--status-warning-ink) 78%, var(--text-1));
}

.upload-feedback-alert__description {
  color: color-mix(in oklch, var(--status-warning-ink) 64%, var(--text-2));
}

.dark .upload-feedback-alert {
  box-shadow:
    inset 0 1px 0 color-mix(in oklch, white 10%, transparent),
    0 24px 60px -38px color-mix(in oklch, var(--status-warning) 46%, transparent);
}

.cover-dialog-scroll {
  scrollbar-width: thin;
  scrollbar-color: oklch(var(--foreground) / 0.15) transparent;
}

.upload-tabs-scroll::-webkit-scrollbar {
  height: 4px;
}

.upload-tabs-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.upload-tabs-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: oklch(var(--foreground) / 0.12);
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
