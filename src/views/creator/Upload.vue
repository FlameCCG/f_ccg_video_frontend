<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import type { Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  UploadCloud,
  AlertTriangle,
  CalendarClock,
  Film,
  Globe,
  HardDrive,
  Layers,
  Lock,
  MonitorPlay,
  Repeat2,
  X,
  Loader2,
  Plus,
  Zap,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import ScheduledPublishPicker from '@/components/creator/ScheduledPublishPicker.vue'
import TagInput from '@/components/creator/TagInput.vue'
import BatchOperationDialog from '@/components/creator/BatchOperationDialog.vue'
import PartitionPicker from '@/components/creator/PartitionPicker.vue'
import SegmentedChoice from '@/components/creator/SegmentedChoice.vue'
import UploadCoverCard from '@/components/creator/UploadCoverCard.vue'
import UploadCoverEditor from '@/components/creator/UploadCoverEditor.vue'
import UploadDropOverlay from '@/components/creator/UploadDropOverlay.vue'
import UploadPartRow from '@/components/creator/UploadPartRow.vue'
import UploadWorkTabs from '@/components/creator/UploadWorkTabs.vue'
import {
  dataAttrs,
  isBusyPartStatus,
  type CoverCandidate,
  type SegmentedOption,
  type VideoPart,
  type VideoWork,
  type VideoWorkForm,
  type WorkIssues,
} from '@/components/creator/upload-shared'
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

/** 与后端 video_resources / video_part_resources.source_file_name 列长一致 */
const MAX_SOURCE_FILE_NAME_LENGTH = 255

/** 从源文件名推导默认分P标题（去扩展名），不修改源文件名本身 */
const getDefaultPartTitle = (fileName: string) => fileName.replace(/\.[^/.]+$/, '')

const getSourceFileNameLength = (fileName: string) => Array.from(fileName.trim()).length

const isSourceFileNameTooLong = (fileName: string) =>
  getSourceFileNameLength(fileName) > MAX_SOURCE_FILE_NAME_LENGTH

const formatSourceFileNameForDisplay = (fileName: string) => {
  const chars = Array.from(fileName.trim())
  if (chars.length <= 40) return fileName.trim()
  return `${chars.slice(0, 16).join('')}...${chars.slice(-16).join('')}`
}

const getSourceFileNameTooLongMessage = (fileName: string) => {
  const length = getSourceFileNameLength(fileName)
  return `源文件名过长（最多 ${MAX_SOURCE_FILE_NAME_LENGTH} 个字符，当前 ${length} 个）：${formatSourceFileNameForDisplay(fileName)}。请缩短文件名后重新选择`
}

const createVideoPart = (
  file: File,
  overrides: Partial<Omit<VideoPart, 'file' | 'sourceFileName'>> = {}
): VideoPart => ({
  id: Math.random().toString(36).substring(2, 9),
  file,
  sourceFileName: file.name,
  title: getDefaultPartTitle(file.name),
  progress: 0,
  status: 'pending',
  hash: '',
  filePath: '',
  instant: false,
  uploadedBytes: 0,
  speedBps: 0,
  etaMs: 0,
  ...overrides,
})

/** 传输指标写回 UI 的最小间隔：大文件分片多，逐片写会把状态行顶到每秒几十次渲染 */
const UPLOAD_UI_PUSH_INTERVAL = 220

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
  coverCandidates: [],
  publishState: 'idle',
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
const FILE_HASH_CACHE_KEY = 'creator-upload-file-hash-cache'
const FILE_HASH_CACHE_LIMIT = 24
const SCHEDULE_MIN_DELAY_MS = 5 * 60 * 1000
const SCHEDULE_MAX_DELAY_MS = 14 * 24 * 60 * 60 * 1000

/**
 * 空态的约束说明。原来是一整段密排小字，读完才知道能不能传；
 * 拆成四条带图标的要点，并把「秒传」这个产品能力前置 —— 它是用户最该先知道的一条。
 */
const uploadFacts = computed<{ icon: Component; title: string; text: string }[]>(() => [
  { icon: Film, title: '支持的格式', text: COMMON_VIDEO_FORMAT_TEXT },
  {
    icon: HardDrive,
    title: '单文件大小',
    text: hasExplicitStorageConfig.value
      ? `不超过 ${storageConfig.value.maxFileSize}MB`
      : '本站未公开上限，超限时会明确提示原因',
  },
  {
    icon: Layers,
    title: '分P 与续传',
    text: `单个作品最多 ${storageConfig.value.maxUploadNum} 个分P，按 ${storageConfig.value.chunkSize}MB 分片，断了可以接着传`,
  },
  { icon: Zap, title: '秒传', text: '传过的文件会被识别出来，直接跳过传输' },
])

// Active work computed
const activeWork = computed(() => works.value[activeWorkIndex.value])
const activeParts = computed(() => activeWork.value?.parts ?? [])
const allParts = computed(() => works.value.flatMap((w) => w.parts))
const isActiveScheduleDisabled = computed(() => Boolean(activeWork.value?.form.isPrivate))

const isUploadingAny = computed(() => allParts.value.some((p) => isBusyPartStatus(p.status)))
const showPartLabels = computed(() => activeParts.value.length > 1)
const remainingPartSlots = computed(() =>
  Math.max(storageConfig.value.maxUploadNum - activeParts.value.length, 0)
)

/** 已经点过一次「发布视频」：此后才把未填项显示成错误态，避免一进页面就满屏红 */
const hasTriedPublish = ref(false)

const workIssues = computed<WorkIssues[]>(() =>
  works.value.map((work) => ({
    noParts: work.parts.length === 0,
    uploading: work.parts.some((part) => isBusyPartStatus(part.status)),
    failed: work.parts.some((part) => ['error', 'canceled', 'paused'].includes(part.status)),
    title: !work.form.title.trim(),
    partition: !work.form.partitionId,
    cover: !work.coverFile && !work.coverPreview,
  }))
)

const activeIssues = computed<WorkIssues | undefined>(() => workIssues.value[activeWorkIndex.value])

/** 字段级 inline 错误只在点过发布之后出现 */
const showIssue = (key: keyof WorkIssues) =>
  hasTriedPublish.value && Boolean(activeIssues.value?.[key])

const publishBlockReason = computed(() => {
  if (works.value.length === 0) return '先添加视频文件'
  if (isPublishing.value) return '正在发布…'

  const busyCount = allParts.value.filter((part) => isBusyPartStatus(part.status)).length
  if (busyCount > 0) return `${busyCount} 个文件传输中，完成后即可发布`
  return ''
})

const headSummary = computed(() => {
  if (works.value.length === 0) return '支持多文件、分P 与秒传'
  return `${works.value.length} 个作品 · ${allParts.value.length} 个视频文件`
})

const originalOptions: SegmentedOption<boolean>[] = [
  { value: true, label: '自制', icon: MonitorPlay },
  { value: false, label: '转载', icon: Repeat2 },
]

const visibilityOptions: SegmentedOption<boolean>[] = [
  { value: false, label: '公开', icon: Globe },
  { value: true, label: '私密', icon: Lock },
]

const publishTypeOptions = computed<SegmentedOption<'immediate' | 'scheduled'>[]>(() => [
  { value: 'immediate', label: '立即发布', icon: Zap },
  {
    value: 'scheduled',
    label: '定时发布',
    icon: CalendarClock,
    disabled: isActiveScheduleDisabled.value,
  },
])

const updateActiveForm = <K extends keyof VideoWorkForm>(key: K, value: VideoWorkForm[K]) => {
  if (!activeWork.value) return
  activeWork.value.form[key] = value
}

type PublishField = 'parts' | 'title' | 'partition' | 'cover'

const FIELD_ANCHORS: Record<PublishField, string> = {
  parts: 'upload-field-parts',
  title: 'upload-field-title',
  partition: 'upload-field-partition',
  cover: 'upload-field-cover',
}

const focusField = (field: PublishField) => {
  const target = document.getElementById(FIELD_ANCHORS[field])
  if (!target) return

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({
    block: 'center',
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  })
  const focusable = target.querySelector<HTMLElement>(
    'input, textarea, button:not([tabindex="-1"]), [tabindex="0"]'
  )
  focusable?.focus({ preventScroll: true })
}

const focusWorkField = async (workIndex: number, field: PublishField) => {
  activeWorkIndex.value = workIndex
  await nextTick()
  focusField(field)
}

// Cover Setting State
const showCoverSetting = ref(false)
const showAICoverDialog = ref(false)
const applyingAICover = ref(false)
const previewVideoUrl = ref('')
const autoCoverPartTokens = new Map<string, string>()
const UPLOAD_STATUS_TIMEOUT = 6000
const UPLOAD_CHUNK_TIMEOUT = 60000
const COMPLETE_UPLOAD_TIMEOUT = 5 * 60 * 1000
const scheduleBoundaryBase = ref(Date.now())

let localPreviewObjectUrl = ''
let scheduleBoundaryTimer: ReturnType<typeof setInterval> | undefined
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
  if (isSourceFileNameTooLong(file.name)) {
    return getSourceFileNameTooLongMessage(file.name)
  }
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

  if (!firstPart) {
    revokeLocalPreviewObjectUrl()
    previewVideoUrl.value = ''
    return
  }

  revokeLocalPreviewObjectUrl()
  localPreviewObjectUrl = URL.createObjectURL(firstPart.file)
  previewVideoUrl.value = localPreviewObjectUrl
}

const openCoverSetting = () => {
  if (!activeWork.value) return
  showCoverSetting.value = true
}

const clearVideoCoverSuggestions = (work?: VideoWork) => {
  if (!work) return
  work.coverCandidates = []
  autoCoverPartTokens.delete(work.id)

  if (work.coverSource === 'auto') {
    work.coverFile = null
    work.coverPreview = ''
    work.currentCoverUrl = ''
    work.coverSource = 'none'
  }
}

const captureCoverFromVideoElement = async (video: HTMLVideoElement, fileName: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法初始化封面画布')
  }

  const targetRatio = canvas.width / canvas.height
  const sourceRatio = video.videoWidth / video.videoHeight
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = video.videoWidth
  let sourceHeight = video.videoHeight

  if (sourceRatio > targetRatio) {
    sourceWidth = video.videoHeight * targetRatio
    sourceX = (video.videoWidth - sourceWidth) / 2
  } else if (sourceRatio < targetRatio) {
    sourceHeight = video.videoWidth / targetRatio
    sourceY = (video.videoHeight - sourceHeight) / 2
  }

  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  )

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.88)
  })
  if (!blob) {
    throw new Error('封面生成失败')
  }

  return {
    preview: canvas.toDataURL('image/jpeg', 0.88),
    file: new File([blob], fileName, { type: 'image/jpeg' }),
  }
}

const seekCoverVideo = (video: HTMLVideoElement, time: number) =>
  new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('封面定位超时'))
    }, 5000)

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
    video.currentTime = time
  })

const createRandomCoverTimes = (duration: number, count = 5) => {
  const safeDuration = Math.max(duration - 0.08, 0.08)
  return Array.from({ length: count }, (_, index) => {
    const segmentStart = (safeDuration * index) / count
    const segmentLength = safeDuration / count
    const jitter = 0.28 + Math.random() * 0.44
    return Math.min(Math.max(segmentStart + segmentLength * jitter, 0.04), safeDuration)
  })
}

const getCoverCandidateToken = (part: VideoPart) =>
  `${part.id}:${part.hash || part.file.name}:${part.file.size}:${part.file.lastModified}`

const generateCoverCandidatesForPart = async (part: VideoPart) => {
  const work = works.value.find((candidate) => candidate.parts.some((item) => item.id === part.id))
  if (!work || work.parts[0]?.id !== part.id) return
  if (part.status !== 'success') return

  const token = getCoverCandidateToken(part)
  if (work.coverCandidates.length > 0 && autoCoverPartTokens.get(work.id) === token) {
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
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('无法读取视频时长')
    }

    const candidates: CoverCandidate[] = []
    const sampleTimes = createRandomCoverTimes(duration)
    for (const [index, sampleTime] of sampleTimes.entries()) {
      await seekCoverVideo(video, sampleTime)
      const cover = await captureCoverFromVideoElement(
        video,
        `video-frame-${part.id}-${index + 1}.jpg`
      )
      candidates.push({
        id: `${token}:${index}`,
        time: sampleTime,
        preview: cover.preview,
        file: cover.file,
      })
    }

    const latestWork = works.value.find((candidate) => candidate.id === work.id)
    const latestFirstPart = latestWork?.parts[0]
    if (
      !latestWork ||
      !latestFirstPart ||
      latestFirstPart.id !== part.id ||
      getCoverCandidateToken(latestFirstPart) !== token
    ) {
      return
    }

    latestWork.coverCandidates = candidates
    if (latestWork.coverSource !== 'manual' && candidates[0]) {
      latestWork.coverFile = candidates[0].file
      latestWork.coverPreview = candidates[0].preview
      latestWork.currentCoverUrl = ''
      latestWork.coverSource = 'auto'
    }
    autoCoverPartTokens.set(latestWork.id, token)
  } catch (error) {
    console.warn('Video frame recommendations skipped', error)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const applyLocalCoverFile = (coverFile: File, coverPreview: string) => {
  if (!activeWork.value) return
  activeWork.value.coverFile = coverFile
  activeWork.value.coverPreview = coverPreview
  activeWork.value.currentCoverUrl = ''
  activeWork.value.coverSource = 'manual'
  autoCoverPartTokens.delete(activeWork.value.id)
}

const handleCoverEditorConfirm = (payload: { file: File; preview: string }) => {
  applyLocalCoverFile(payload.file, payload.preview)
}

const applyRecommendedCover = (candidateId: string) => {
  if (!activeWork.value) return
  const candidate = activeWork.value.coverCandidates.find((item) => item.id === candidateId)
  if (!candidate) return

  activeWork.value.coverFile = candidate.file
  activeWork.value.coverPreview = candidate.preview
  activeWork.value.currentCoverUrl = ''
  activeWork.value.coverSource = 'auto'
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
  const workTitle = draft.title.trim() || getDefaultPartTitle(draft.file.name)
  const part = createVideoPart(draft.file, {
    title: workTitle,
  })
  const work = createWork([part])
  work.form.title = workTitle
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
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  isDragging.value = true
}
const onDragEnter = (e: DragEvent) => {
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = true
}
const onDragLeave = (e: DragEvent) => {
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  const nextTarget = e.relatedTarget as Node | null
  if (nextTarget && uploadRootRef.value?.contains(nextTarget)) return
  isDragging.value = false
}
const onDrop = (e: DragEvent) => {
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()
  e.stopPropagation()
  isDragging.value = false

  // 已经有作品时，落点由 UploadDropOverlay 的两个区域接管：
  // 「加为分P」和「新建作品」是两件完全不同的事，不能替用户默认选一个。
  if (works.value.length > 0) return

  const files = getFilesFromDataTransfer(e.dataTransfer)
  if (files.length > 0) {
    handleFilesSelect(files)
  }
}

const onDropAsParts = (e: DragEvent) => {
  isDragging.value = false
  const files = getFilesFromDataTransfer(e.dataTransfer)
  if (files.length > 0) {
    handleFilesSelect(files)
  }
}

const onDropAsNewWorks = (e: DragEvent) => {
  isDragging.value = false
  const files = getFilesFromDataTransfer(e.dataTransfer)
  if (files.length > 0) {
    addFilesAsNewWorks(files)
  }
}

const onDropMissed = () => {
  isDragging.value = false
  // 用 toast 而不是页面顶部的提示条：拖拽多发生在页面中段，顶部提示条用户根本看不到
  toast({
    title: '文件还没有添加进来',
    description: '松手前请把文件移到「加为当前作品的分P」或「作为新的作品」区域内。',
  })
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
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()
}

const handleWindowDrop = (e: DragEvent) => {
  if (!hasDraggedVideoFiles(e.dataTransfer)) return
  e.preventDefault()

  const target = e.target as Node | null
  if (target && uploadRootRef.value?.contains(target)) {
    onDrop(e)
  }
}

// Concurrency & retry helpers
const activeUploads = ref(0)

/**
 * 排队序号。原来是模板里直接调用的函数，每次 render × 每个 pending 分P 都要
 * 重新遍历一遍 allParts；改成一次算完的 Map，只在 status 变化时失效。
 */
const queuePositions = computed(() => {
  const positions = new Map<string, number>()
  let position = 0
  for (const part of allParts.value) {
    if (part.status !== 'pending') continue
    position += 1
    positions.set(part.id, position)
  }
  return positions
})

const hasDraggedVideoFiles = (dataTransfer: DataTransfer | null | undefined) => {
  if (!dataTransfer) return false
  if (!Array.from(dataTransfer.types ?? []).includes('Files')) return false

  const fileItems = Array.from(dataTransfer.items ?? []).filter((item) => item.kind === 'file')
  if (fileItems.length === 0) {
    // 部分浏览器在文件真正落下前不会暴露 DataTransferItem，保留外部文件拖入能力。
    return true
  }

  const knownTypes = fileItems.map((item) => item.type).filter(Boolean)
  if (knownTypes.length === 0) return true
  return knownTypes.some((type) => type.startsWith('video/'))
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
    const longNameOnly = unsupportedFiles.filter((entry) =>
      isSourceFileNameTooLong(entry.file.name)
    )
    const formatOnly = unsupportedFiles.filter((entry) => !isSourceFileNameTooLong(entry.file.name))
    if (longNameOnly.length > 0 && formatOnly.length === 0) {
      uploadFeedback.value = {
        title: '源文件名过长，无法上传',
        description:
          longNameOnly.length === 1
            ? getSourceFileNameTooLongMessage(longNameOnly[0]!.file.name)
            : longNameOnly
                .map((entry) => getSourceFileNameTooLongMessage(entry.file.name))
                .join('；'),
      }
      return
    }
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
    const longNameFiles = unsupportedFiles.filter((entry) =>
      isSourceFileNameTooLong(entry.file.name)
    )
    const formatFiles = unsupportedFiles.filter(
      (entry) => !isSourceFileNameTooLong(entry.file.name)
    )
    if (longNameFiles.length > 0) {
      uploadIssues.push(
        longNameFiles.length === 1
          ? getSourceFileNameTooLongMessage(longNameFiles[0]!.file.name)
          : `源文件名过长（最多 ${MAX_SOURCE_FILE_NAME_LENGTH} 个字符）：${formatRejectedSummary(
              longNameFiles.map((entry) => entry.file.name),
              '部分文件'
            )}。请缩短文件名后重新选择`
      )
    }
    if (formatFiles.length > 0) {
      uploadIssues.push(
        `格式不支持：${formatRejectedSummary(
          formatFiles.map((entry) => entry.file.name),
          '部分文件'
        )}`
      )
    }
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

  const newParts: VideoPart[] = validFiles.map((file) => createVideoPart(file))

  if (activeWork.value) {
    // 作品标题默认取首个源文件名（去扩展名），与分P标题字段解耦
    if (!activeWork.value.form.title && newParts[0]) {
      activeWork.value.form.title = getDefaultPartTitle(newParts[0].sourceFileName)
    }
    activeWork.value.parts.push(...newParts)
  } else {
    newParts.forEach((part) => {
      const work = createWork([part])
      work.form.title = getDefaultPartTitle(part.sourceFileName)
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
    part.speedBps = 0
    part.etaMs = 0

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
      part.uploadedBytes = part.file.size
      part.instant = true
      part.status = 'success'
      void generateCoverCandidatesForPart(part)
      return
    }

    // Phase 3: upload missing chunks
    const uploadedChunks = new Set(status.uploadedChunks || [])
    const cSize = chunkSizeBytes.value
    const totalChunks = Math.ceil(part.file.size / cSize)
    let uploadedCount = uploadedChunks.size

    part.status = 'uploading'
    part.progress = totalChunks > 0 ? Math.round((uploadedCount / totalChunks) * 100) : 100
    part.uploadedBytes = Math.min(uploadedCount * cSize, part.file.size)

    // 传输指标只在本地累积，按 UPLOAD_UI_PUSH_INTERVAL 批量写回响应式对象
    let transferredBytes = part.uploadedBytes
    let smoothedSpeed = 0
    let lastTickAt = performance.now()
    let lastUiPushAt = 0

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
      transferredBytes = Math.min(transferredBytes + (end - start), part.file.size)

      const now = performance.now()
      const elapsedSeconds = (now - lastTickAt) / 1000
      lastTickAt = now
      if (elapsedSeconds > 0) {
        // 单片耗时抖动很大，不做 EMA 平滑的话速度数字会一直乱跳，反而读不出信息
        const instantSpeed = (end - start) / elapsedSeconds
        smoothedSpeed =
          smoothedSpeed > 0 ? smoothedSpeed * 0.75 + instantSpeed * 0.25 : instantSpeed
      }

      if (now - lastUiPushAt >= UPLOAD_UI_PUSH_INTERVAL || uploadedCount === totalChunks) {
        lastUiPushAt = now
        part.uploadedBytes = transferredBytes
        part.progress = Math.round((uploadedCount / totalChunks) * 100)
        part.speedBps = smoothedSpeed
        part.etaMs =
          smoothedSpeed > 0 ? ((part.file.size - transferredBytes) / smoothedSpeed) * 1000 : 0
      }
    }

    // Phase 4: merge (serialized)
    part.status = 'merging'
    part.progress = 100
    part.uploadedBytes = part.file.size
    part.speedBps = 0
    part.etaMs = 0
    await acquireCompleteLock()
    try {
      if (signal.aborted) throw new Error('canceled')
      const res = await withRetry(
        () =>
          completeUpload(
            { fileHash: part.hash, fileName: part.sourceFileName, totalChunks },
            { signal, timeout: COMPLETE_UPLOAD_TIMEOUT, silent: true }
          ),
        2,
        signal
      )
      part.filePath = res.filePath
      part.status = 'success'
      void generateCoverCandidatesForPart(part)
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
    clearVideoCoverSuggestions(work)
    const nextFirst = work.parts[0]
    if (nextFirst?.status === 'success') {
      void generateCoverCandidatesForPart(nextFirst)
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
}

/** 每个文件各自成为一个独立作品（「添加作品」按钮与拖拽落点共用） */
const addFilesAsNewWorks = (files: File[]) => {
  const videoFiles = files.filter(isLikelyVideoFile)
  if (videoFiles.length === 0) {
    uploadFeedback.value = {
      title: '没有可上传的视频文件',
      description: `请上传 ${COMMON_VIDEO_FORMAT_TEXT}。`,
    }
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
    return
  }
  uploadFeedback.value = null
  validFiles.forEach((file) => {
    const part = createVideoPart(file)
    const work = createWork([part])
    work.form.title = getDefaultPartTitle(part.sourceFileName)
    works.value.push(work)
  })
  activeWorkIndex.value = works.value.length - 1
  processUploadQueue()
}

const onAddWorkFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files?.length) return
  addFilesAsNewWorks(Array.from(target.files))
  target.value = ''
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

  if (isSourceFileNameTooLong(file.name)) {
    toast({
      title: '无法更换：源文件名过长',
      description: getSourceFileNameTooLongMessage(file.name),
      variant: 'destructive',
    })
    target.value = ''
    return
  }
  const reason = getVideoFileRejectionReason(file)
  if (reason) {
    toast({ title: '无法更换', description: reason, variant: 'destructive' })
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

  const oldDefaultTitle = getDefaultPartTitle(part.sourceFileName)
  const nextSourceName = file.name
  // 仅当用户未自定义分P标题时，才跟随新源文件名刷新默认标题
  if (!part.title || part.title === oldDefaultTitle) {
    part.title = getDefaultPartTitle(nextSourceName)
  }
  part.sourceFileName = nextSourceName

  if (replaceTargetPartIndex.value === 0) {
    clearVideoCoverSuggestions(activeWork.value)
  }

  part.file = file
  part.progress = 0
  part.status = 'pending'
  part.hash = ''
  part.filePath = ''
  part.errorMessage = ''
  part.instant = false
  part.uploadedBytes = 0
  part.speedBps = 0
  part.etaMs = 0

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
  // 从这一刻起，未填项在对应字段上常驻显示为错误态，而不是只弹一条会消失的 toast
  hasTriedPublish.value = true

  if (works.value.length === 0) {
    toast({ title: '请至少添加一个作品', variant: 'destructive' })
    return
  }
  for (let i = 0; i < works.value.length; i++) {
    const work = works.value[i]!
    const wLabel = works.value.length > 1 ? `作品${i + 1}：` : ''
    if (work.parts.length === 0) {
      toast({ title: `${wLabel}请至少上传一个视频`, variant: 'destructive' })
      await focusWorkField(i, 'parts')
      return
    }
    if (work.parts.some((p) => p.status !== 'success')) {
      toast({ title: `${wLabel}请等待所有视频上传完成`, variant: 'destructive' })
      await focusWorkField(i, 'parts')
      return
    }
    if (!work.form.title) {
      toast({ title: `${wLabel}请填写标题`, variant: 'destructive' })
      await focusWorkField(i, 'title')
      return
    }
    if (!work.form.partitionId) {
      toast({ title: `${wLabel}请选择分区`, variant: 'destructive' })
      await focusWorkField(i, 'partition')
      return
    }
    if (!work.coverFile && !work.coverPreview) {
      toast({ title: `${wLabel}请上传封面`, variant: 'destructive' })
      await focusWorkField(i, 'cover')
      return
    }
    const longNamePart = work.parts.find((p) => isSourceFileNameTooLong(p.sourceFileName))
    if (longNamePart) {
      toast({
        title: `${wLabel}源文件名过长`,
        description: getSourceFileNameTooLongMessage(longNamePart.sourceFileName),
        variant: 'destructive',
      })
      activeWorkIndex.value = i
      return
    }
  }

  let publishedCount = 0
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
      work.publishState = 'publishing'
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
              // 单P：只提交源文件名，不提交分P标题
              filePath: work.parts[0]!.filePath,
              fileName: work.parts[0]!.sourceFileName,
              fileHash: work.parts[0]!.hash,
            }
          : {
              // 多P：fileName 为源文件名，title 为分P标题（二者分离）
              parts: work.parts.map((p) => ({
                title: p.title.trim() || getDefaultPartTitle(p.sourceFileName),
                filePath: p.filePath,
                fileName: p.sourceFileName,
                fileHash: p.hash,
              })),
            }),
      }
      await publishVideo(publishPayload)
      work.publishState = 'done'
      publishedCount += 1
    }
    toast({ title: works.value.length > 1 ? `${works.value.length} 个作品发布成功` : '发布成功' })
    void router.push('/creator/content')
  } catch (error) {
    console.error('Publish failed', error)
    // 串行发布：前面成功的已经落库了，必须让用户知道断在哪一个，否则会重复投稿
    works.value.forEach((work) => {
      if (work.publishState === 'publishing') work.publishState = 'failed'
    })
    const partialText =
      publishedCount > 0 ? `前 ${publishedCount} 个作品已发布成功，其余未发布。` : ''
    // 业务错误文案（含源文件名过长）已由 request 拦截器 toast，避免再弹笼统的「发布失败」盖掉原因
    const message = error instanceof Error ? error.message.trim() : ''
    if (!message) {
      toast({
        title: '发布失败',
        description: `${partialText}请稍后重试`,
        variant: 'destructive',
      })
    } else if (partialText) {
      toast({ title: '部分作品未发布', description: partialText, variant: 'destructive' })
    }
  } finally {
    isPublishing.value = false
  }
}
</script>

<template>
  <div
    ref="uploadRootRef"
    class="upload-page"
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

    <header
      class="upload-page__header"
      v-bind="dataAttrs({ 'data-empty': works.length === 0 ? 'true' : 'false' })"
    >
      <div class="min-w-0">
        <h1 class="text-xl font-semibold tracking-tight">投稿</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ headSummary }}</p>
      </div>
    </header>

    <div
      v-if="uploadFeedback"
      class="upload-feedback-alert mb-5 flex items-start gap-3 rounded-2xl px-4 py-4"
      role="status"
    >
      <div
        class="upload-feedback-alert__icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      >
        <AlertTriangle class="h-4.5 w-4.5" />
      </div>
      <div class="min-w-0 flex-1 space-y-1">
        <p class="upload-feedback-alert__title text-sm font-semibold tracking-[0.01em]">
          {{ uploadFeedback.title }}
        </p>
        <p class="upload-feedback-alert__description text-sm leading-6">
          {{ uploadFeedback.description }}
        </p>
      </div>
      <button
        type="button"
        class="upload-feedback-alert__close active-scale"
        aria-label="关闭提示"
        @click="uploadFeedback = null"
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <!--
      Step 1: 选择文件

      整块空态本身就是按钮（<button> 而不是 <section> + 中间一个小 Button）。
      原来 320px 高的虚线框里只有正中那颗按钮可点，其余全是死区 —— 用户按直觉
      去点框子，什么也不会发生，只能再瞄准中间点一次。拖拽热区已经是整块了，
      点击热区没有理由比它小。

      说明文字放在按钮里会被读屏当成一长串按钮名念出来，所以 facts 列表留在按钮
      外面（aria-describedby 关联），标题与副标题则用 aria-label 收成一句话。
    -->
    <section v-if="works.length === 0">
      <button
        type="button"
        class="upload-empty"
        aria-label="把视频拖到这里，或点击选择文件"
        aria-describedby="upload-empty-facts"
        v-bind="dataAttrs({ 'data-dragging': isDragging ? 'true' : 'false' })"
        @click="openVideoPicker('initial')"
      >
        <span class="upload-empty__icon">
          <UploadCloud class="h-7 w-7" aria-hidden="true" />
        </span>
        <span class="text-xl font-semibold tracking-cjk" aria-hidden="true">
          把视频拖到这里，或点击选择文件
        </span>
        <span class="mt-2 max-w-md text-sm leading-6 text-muted-foreground" aria-hidden="true">
          一次可以选多个文件：既能合成同一个作品的多个分P，也能各自独立成稿。
        </span>
        <span class="upload-empty__cta" aria-hidden="true">
          <UploadCloud class="h-4 w-4" />
          选择视频文件
        </span>
      </button>

      <ul id="upload-empty-facts" class="upload-empty__facts">
        <li v-for="fact in uploadFacts" :key="fact.title" class="upload-empty__fact">
          <component :is="fact.icon" class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-xs font-medium text-foreground">{{ fact.title }}</p>
            <p class="mt-0.5 text-xs leading-5 text-muted-foreground">{{ fact.text }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- Step 2: 文件轨道 + 连续信息流 -->
    <div v-else class="upload-layout">
      <section id="upload-field-parts" class="upload-file-stage">
        <div class="upload-file-stage__head">
          <div>
            <h2 class="upload-file-stage__title">视频文件</h2>
            <p class="mt-1 text-xs text-muted-foreground">
              一个作品可以包含多个分P，也可以继续添加独立作品。
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="tabular text-xs text-muted-foreground">
              {{ activeParts.length }} / {{ storageConfig.maxUploadNum }} 个分P
            </span>
            <Button
              v-if="works.length > 1"
              variant="outline"
              size="sm"
              @click="showBatchDialog = true"
            >
              <Layers class="h-3.5 w-3.5" />
              批量设置
            </Button>
          </div>
        </div>

        <UploadWorkTabs
          :works="works"
          :active-index="activeWorkIndex"
          :issues="workIssues"
          :strict="hasTriedPublish"
          @select="activeWorkIndex = $event"
          @remove="removeWork"
          @add="addWorkFileInputRef?.click()"
        />

        <template v-if="activeWork">
          <div
            :id="`upload-work-panel-${activeWork.id}`"
            class="mt-3 space-y-2"
            role="tabpanel"
            :aria-labelledby="`upload-work-tab-${activeWork.id}`"
          >
            <UploadPartRow
              v-for="(part, index) in activeParts"
              :key="part.id"
              :part="part"
              :index="index"
              :show-label="showPartLabels"
              :queue-position="queuePositions.get(part.id) ?? 0"
              :chunk-size="chunkSizeBytes"
              @update:title="part.title = $event"
              @replace="openReplacePicker(index)"
              @pause="pausePart(part)"
              @resume="resumePart(part)"
              @remove="removePart(index)"
            />
          </div>

          <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              :disabled="remainingPartSlots === 0"
              @click="openVideoPicker('append')"
            >
              <Plus class="h-3.5 w-3.5" />
              添加分P
            </Button>
            <p class="text-xs text-muted-foreground">
              {{
                remainingPartSlots === 0
                  ? '已达分P上限，再多的视频请新建一个作品'
                  : '同一作品的分P共用标题、封面与分区'
              }}
            </p>
          </div>
        </template>
      </section>

      <div v-if="activeWork" class="upload-form-flow">
        <UploadCoverCard
          :cover-preview="activeWork.coverPreview"
          :cover-source="activeWork.coverSource"
          :cover-candidates="activeWork.coverCandidates"
          :title="activeWork.form.title"
          :invalid="showIssue('cover')"
          :ai-busy="applyingAICover"
          @open="openCoverSetting"
          @ai="showAICoverDialog = true"
          @select="applyRecommendedCover"
        />

        <div id="upload-field-title" class="upload-form-row">
          <Label for="title" class="upload-form-row__label">
            标题 <span class="text-destructive">*</span>
          </Label>
          <div class="upload-form-row__control">
            <div class="relative">
              <Input
                id="title"
                :model-value="activeWork.form.title"
                placeholder="用一句话说清这个视频讲了什么"
                class="h-11 pr-16 text-base"
                :class="showIssue('title') ? 'border-destructive' : ''"
                @update:model-value="(v) => updateActiveForm('title', String(v))"
              />
              <span
                class="tabular pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                :class="
                  activeWork.form.title.length > 80
                    ? 'text-[var(--status-warning-ink)]'
                    : 'text-muted-foreground'
                "
              >
                {{ activeWork.form.title.length }}/80
              </span>
            </div>
            <p v-if="showIssue('title')" class="mt-2 text-xs text-destructive">
              标题是必填项，先给作品起个名字
            </p>
          </div>
        </div>

        <div class="upload-form-row">
          <Label for="upload-partition" class="upload-form-row__label">
            类型 <span class="text-destructive">*</span>
          </Label>
          <div class="upload-form-row__control">
            <SegmentedChoice
              :model-value="activeWork.form.isOriginal"
              :options="originalOptions"
              label="视频类型"
              @update:model-value="(v) => updateActiveForm('isOriginal', v)"
            />
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              {{
                activeWork.form.isOriginal
                  ? '自制：内容由你本人拍摄或制作。'
                  : '转载：请在简介里注明原作者与来源链接。'
              }}
            </p>
          </div>
        </div>

        <div id="upload-field-partition" class="upload-form-row">
          <Label class="upload-form-row__label">
            分区 <span class="text-destructive">*</span>
          </Label>
          <div class="upload-form-row__control">
            <PartitionPicker
              :partitions="partitions"
              :model-value="activeWork.form.partitionId"
              :invalid="showIssue('partition')"
              @update:model-value="(v) => updateActiveForm('partitionId', v)"
            />
            <p v-if="showIssue('partition')" class="mt-2 text-xs text-destructive">
              请选择一个分区，它决定视频出现在哪个频道
            </p>
            <p v-else-if="partitions.length === 0" class="mt-2 text-xs text-muted-foreground">
              分区列表加载中…
            </p>
          </div>
        </div>

        <div class="upload-form-row">
          <Label class="upload-form-row__label">标签</Label>
          <div class="upload-form-row__control">
            <TagInput
              :model-value="activeWork.form.tags"
              :max="10"
              @update:model-value="(v) => updateActiveForm('tags', v)"
            />
          </div>
        </div>

        <div class="upload-form-row">
          <Label for="desc" class="upload-form-row__label">简介</Label>
          <div class="upload-form-row__control">
            <textarea
              id="desc"
              :value="activeWork.form.description"
              class="flex min-h-[9rem] w-full resize-y rounded-md border border-input bg-background px-3 py-3 text-sm leading-6 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="补充视频背景、制作过程或参考来源，让更多人能搜到你的视频"
              rows="5"
              @input="
                (e) => updateActiveForm('description', (e.target as HTMLTextAreaElement).value)
              "
            ></textarea>
          </div>
        </div>

        <div class="upload-form-row">
          <Label class="upload-form-row__label">可见性</Label>
          <div class="upload-form-row__control">
            <SegmentedChoice
              :model-value="activeWork.form.isPrivate"
              :options="visibilityOptions"
              label="可见性"
              @update:model-value="(v) => updateActiveForm('isPrivate', v)"
            />
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              {{
                activeWork.form.isPrivate
                  ? '私密作品只有你自己能看到，不进入推荐与搜索。'
                  : '公开后所有人都能看到，也会进入推荐与搜索。'
              }}
            </p>
          </div>
        </div>

        <div class="upload-form-row">
          <Label class="upload-form-row__label">发布时间</Label>
          <div class="upload-form-row__control">
            <SegmentedChoice
              :model-value="activeWork.form.publishType"
              :options="publishTypeOptions"
              label="发布时间"
              @update:model-value="(v) => updateActiveForm('publishType', v)"
            />
            <p class="mt-2 text-xs leading-5 text-muted-foreground">
              {{
                isActiveScheduleDisabled
                  ? '私密作品只能立即发布，取消私密后可以预约 5 分钟到 15 天内的时间。'
                  : '定时发布可预约最早 5 分钟后、最晚 15 天内。'
              }}
            </p>
            <div
              v-if="!isActiveScheduleDisabled && activeWork.form.publishType === 'scheduled'"
              class="upload-form-row__sub mt-3"
            >
              <ScheduledPublishPicker v-model="activeWork.form.publishTime" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="works.length > 0" class="upload-actionbar">
      <p v-if="publishBlockReason" class="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {{ publishBlockReason }}
      </p>
      <Button
        size="lg"
        class="shrink-0 rounded-full px-8"
        :disabled="isPublishing || isUploadingAny"
        @click="handlePublish"
      >
        <Loader2 v-if="isPublishing" class="h-4 w-4 animate-spin" />
        {{
          isPublishing ? '发布中…' : works.length > 1 ? `发布 ${works.length} 个作品` : '发布视频'
        }}
      </Button>
    </div>

    <!-- Batch Operations Dialog -->
    <BatchOperationDialog
      :open="showBatchDialog"
      @update:open="showBatchDialog = $event"
      @apply="handleBatchApply"
    />

    <UploadCoverEditor
      :open="showCoverSetting"
      :video-url="previewVideoUrl"
      :initial-preview="activeWork?.coverPreview ?? ''"
      :initial-file="activeWork?.coverFile ?? null"
      :title="activeWork?.form.title ?? ''"
      @update:open="showCoverSetting = $event"
      @confirm="handleCoverEditorConfirm"
    />

    <AiChatDialog
      :open="showAICoverDialog"
      mode="cover-picker"
      initial-model="image"
      :initial-prompt="aiCoverInitialPrompt"
      @update:open="showAICoverDialog = $event"
      @cover-pick="handleAICoverPick"
    />

    <UploadDropOverlay
      v-if="isDragging && works.length > 0"
      :active-title="activeWork?.form.title ?? ''"
      :remaining="remainingPartSlots"
      @append="onDropAsParts"
      @new-works="onDropAsNewWorks"
      @miss="onDropMissed"
    />
  </div>
</template>

<style scoped lang="scss">
/* 投稿工作台使用单一阅读轴，但给多 P 文件轨道与抽帧封面保留足够横向空间。 */
.upload-page {
  width: 100%;
  max-width: 68rem;
  margin-inline: auto;
  padding-bottom: 1.5rem;
}

.upload-page__header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 1.25rem;

  &[data-empty='true'] {
    justify-content: center;
    text-align: center;
  }
}

.upload-layout {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.upload-file-stage {
  position: relative;
  padding: 1.25rem;
  border-radius: var(--radius-xl);
  background-color: color-mix(in oklch, var(--color-muted) 48%, var(--color-background));
}

.upload-file-stage::before {
  position: absolute;
  top: 0;
  left: 1.25rem;
  width: 3rem;
  height: 0.1875rem;
  border-radius: 0 0 999px 999px;
  background-color: var(--color-primary);
  content: '';
}

.upload-file-stage__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.upload-file-stage__title {
  font-size: 1.0625rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.upload-form-flow {
  padding-top: 0.5rem;
}

.upload-form-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.upload-form-row__label {
  align-self: start;
  min-height: 2.5rem;
  padding-top: 0.625rem;
  color: var(--color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
}

.upload-form-row__control {
  min-width: 0;
}

.upload-form-row__sub {
  padding: 0.875rem;
  border-left: 2px solid color-mix(in oklch, var(--color-primary) 55%, var(--color-border));
  background-color: color-mix(in oklch, var(--color-muted) 35%, transparent);
}

@media (width >= 720px) {
  .upload-form-row {
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 1.25rem;
  }
}

/* 发布操作留在内容流末尾，避免悬浮层遮挡最后一项设置。 */
.upload-actionbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  flex-wrap: wrap;
  gap: 1rem;
  place-items: center start;
  padding-top: 1.5rem;
}

@media (width >= 720px) {
  .upload-actionbar {
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 1.25rem;
  }

  .upload-actionbar > p {
    grid-column: 2;
  }

  .upload-actionbar > button {
    grid-column: 2;
  }
}

/* ── 空态 ───────────────────────────────────────────────────── */
.upload-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 20rem;
  padding: 2.5rem 1.5rem;
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-2xl);
  background-color: var(--color-card);
  text-align: center;
  cursor: pointer;
  /* 拖拽态只改颜色：对一个 320px 高的块做 scale 会让内部文字重新栅格化发虚 */
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &[data-dragging='true'] {
    border-color: var(--color-primary);
    border-style: solid;
    background-color: color-mix(in oklch, var(--color-primary) 6%, var(--color-card));
  }

  /* 整块可点就得整块给反馈，否则用户还是以为只有中间那颗按钮活着 */
  &:focus-visible {
    outline: 2px solid var(--color-ring, var(--brand-blue));
    outline-offset: 2px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .upload-empty:hover {
    border-color: color-mix(in oklch, var(--color-primary) 50%, var(--color-border));
    background-color: color-mix(in oklch, var(--color-primary) 3%, var(--color-card));
  }

  .upload-empty:hover .upload-empty__cta {
    background-color: color-mix(in oklch, var(--color-primary) 88%, var(--color-foreground));
  }
}

@media (width >= 640px) {
  .upload-empty {
    padding: 3.5rem 3rem;
  }
}

/* 视觉上的「按钮」，实际是整块按钮里的一个装饰件：
   保留原来那颗 CTA 的召唤力，但不再是唯一的点击目标。 */
.upload-empty__cta {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 1.5rem;
  padding: 0.625rem 1.5rem;
  border-radius: var(--radius-md);
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color var(--duration-fast) var(--ease-out-quart);
}

.upload-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: 1.25rem;
  border-radius: 999px;
  background-color: color-mix(in oklch, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.upload-empty__facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem 1.5rem;
  width: 100%;
  max-width: 38rem;
  margin-top: 2.5rem;
  margin-inline: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
  text-align: left;
}

@media (width >= 640px) {
  .upload-empty__facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.upload-empty__fact {
  display: flex;
  gap: 0.625rem;
  align-items: flex-start;
}

/* ── 文件校验提示 ───────────────────────────────────────────── */
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

  &__icon {
    background: color-mix(in oklch, var(--status-warning) 16%, var(--bg-surface-0));
    color: color-mix(in oklch, var(--status-warning-ink) 74%, var(--text-1));
    box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--status-warning-border) 82%, transparent);
  }

  &__title {
    color: color-mix(in oklch, var(--status-warning-ink) 78%, var(--text-1));
  }

  &__description {
    color: color-mix(in oklch, var(--status-warning-ink) 64%, var(--text-2));
  }

  &__close {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--radius-md);
    color: color-mix(in oklch, var(--status-warning-ink) 70%, var(--text-2));
    transition: background-color var(--duration-fast) var(--ease-out-quart);

    &:hover {
      background-color: color-mix(in oklch, var(--status-warning) 14%, transparent);
    }
  }
}

:global(html.dark) .upload-feedback-alert {
  box-shadow:
    inset 0 1px 0 color-mix(in oklch, var(--text-1) 10%, transparent),
    0 24px 60px -38px color-mix(in oklch, var(--status-warning) 46%, transparent);
}
</style>
