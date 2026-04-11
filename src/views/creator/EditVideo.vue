<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  AlertCircle,
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Lock,
  Globe,
  MonitorPlay,
  Repeat2,
  CalendarClock,
  Zap,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast/use-toast'
import TagInput from '@/components/creator/TagInput.vue'
import ScheduledPublishPicker from '@/components/creator/ScheduledPublishPicker.vue'
import { uploadImage } from '@/api/upload'
import {
  getPartitions,
  getVideoDetail,
  updateVideo,
  type Partition,
  type VideoDetail,
  type UpdateVideoParams,
} from '@/api/video'
import { normalizeCreatorTags, resolveCreatorTagIds } from '@/utils/creator-video'

interface EditVideoForm {
  title: string
  description: string
  partitionId: number | undefined
  tags: string[]
  isOriginal: boolean
  isPrivate: boolean
  publishType: 'immediate' | 'scheduled'
  publishTime: string
  coverFile: File | null
  coverPreview: string
  currentCoverUrl: string
}

const createEditForm = (): EditVideoForm => ({
  title: '',
  description: '',
  partitionId: undefined,
  tags: [],
  isOriginal: true,
  isPrivate: false,
  publishType: 'immediate',
  publishTime: '',
  coverFile: null,
  coverPreview: '',
  currentCoverUrl: '',
})

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const videoId = computed(() => Number(route.params.id))
const loading = ref(true)
const saving = ref(false)
const loadError = ref('')
const partialLoadWarning = ref('')
const detailLoaded = ref(false)
const partitions = ref<Partition[]>([])
const form = ref<EditVideoForm>(createEditForm())
const currentStatus = ref<number | null>(null)
const originalPublishTime = ref('')
const scheduleBoundaryBase = ref(Date.now())

let scheduleBoundaryTimer: ReturnType<typeof setInterval> | undefined
let coverPreviewObjectUrl = ''

const parseLocalDateTime = (value: string) => {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw] = match
  const parsed = new Date(
    Number(yearRaw),
    Number(monthRaw) - 1,
    Number(dayRaw),
    Number(hourRaw),
    Number(minuteRaw),
    0,
    0
  )
  return Number.isNaN(parsed.getTime()) ? null : parsed
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
  ceilDateToMinute(new Date(scheduleBoundaryBase.value + 5 * 60 * 1000))

const getScheduleWindowEnd = () =>
  floorDateToMinute(new Date(scheduleBoundaryBase.value + 14 * 24 * 60 * 60 * 1000))

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

const toLocalDateTimeValue = (value?: string) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return formatLocalDateTime(parsed)
}

const isScheduleDisabled = computed(() => form.value.isPrivate)
const hasFutureOriginalPublishTime = computed(() => {
  if (!originalPublishTime.value) return false
  const parsed = new Date(originalPublishTime.value)
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
})

const currentStatusMeta = computed(() => {
  switch (currentStatus.value) {
    case 1:
      return {
        label: '已发布',
        className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      }
    case 2:
      return {
        label: '私密',
        className: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      }
    case 4:
      return {
        label: '审核中',
        className: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400',
      }
    case 3:
      return {
        label: '已删除',
        className: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
      }
    default:
      return {
        label: '草稿信息',
        className: 'border-muted bg-muted/50 text-muted-foreground',
      }
  }
})

const revokeCoverPreviewUrl = () => {
  if (coverPreviewObjectUrl) {
    URL.revokeObjectURL(coverPreviewObjectUrl)
    coverPreviewObjectUrl = ''
  }
}

const assignPersistedCover = (coverUrl: string) => {
  revokeCoverPreviewUrl()
  form.value.coverFile = null
  form.value.coverPreview = coverUrl
  form.value.currentCoverUrl = coverUrl
}

const getRouteQueryText = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : ''
  }
  return typeof value === 'string' ? value : ''
}

const applyFallbackFromRouteQuery = () => {
  const title = getRouteQueryText(route.query.title)
  const cover = getRouteQueryText(route.query.cover)
  const statusValue = Number(getRouteQueryText(route.query.status))

  if (!title && !cover) {
    return false
  }

  currentStatus.value = Number.isFinite(statusValue) ? statusValue : null
  originalPublishTime.value = ''
  form.value = {
    ...createEditForm(),
    title,
    isPrivate: statusValue === 2,
    coverPreview: cover,
    currentCoverUrl: cover,
  }
  return true
}

const fillForm = (video: VideoDetail) => {
  currentStatus.value = video.status
  originalPublishTime.value = video.publishTime ?? ''
  const tagNames = Array.isArray(video.tags) ? video.tags.map((tag) => tag.name) : []

  const normalizedPublishTime = normalizeScheduledPublishTime(
    toLocalDateTimeValue(video.publishTime)
  )
  const shouldUseScheduled = Boolean(
    video.publishTime &&
    !Number.isNaN(new Date(video.publishTime).getTime()) &&
    new Date(video.publishTime).getTime() > Date.now() &&
    video.status !== 2
  )

  form.value = {
    title: video.title,
    description: video.description ?? '',
    partitionId: video.partition?.id,
    tags: normalizeCreatorTags(tagNames),
    isOriginal: video.isOriginal,
    isPrivate: video.status === 2,
    publishType: shouldUseScheduled ? 'scheduled' : 'immediate',
    publishTime: shouldUseScheduled ? normalizedPublishTime || scheduledPublishMinValue.value : '',
    coverFile: null,
    coverPreview: video.cover,
    currentCoverUrl: video.cover,
  }
}

const loadVideo = async () => {
  if (!Number.isFinite(videoId.value) || videoId.value <= 0) {
    loading.value = false
    loadError.value = '无效的视频编号'
    return
  }

  try {
    loading.value = true
    loadError.value = ''
    partialLoadWarning.value = ''
    detailLoaded.value = false

    const [partitionResult, videoResult] = await Promise.allSettled([
      getPartitions(),
      getVideoDetail(videoId.value),
    ])

    if (partitionResult.status === 'fulfilled') {
      partitions.value = partitionResult.value
    }

    if (videoResult.status !== 'fulfilled') {
      if (applyFallbackFromRouteQuery()) {
        partialLoadWarning.value =
          '完整视频详情暂时读取失败，当前先按列表里的基础信息编辑；未获取到的字段会保持原样。'
        return
      }
      throw videoResult.reason
    }

    fillForm(videoResult.value)
    detailLoaded.value = true
  } catch (error) {
    console.error('Failed to load creator video detail', error)
    loadError.value = '视频信息加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const handleCoverChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast({ title: '请选择图片文件', variant: 'destructive' })
    target.value = ''
    return
  }

  revokeCoverPreviewUrl()
  coverPreviewObjectUrl = URL.createObjectURL(file)
  form.value.coverFile = file
  form.value.coverPreview = coverPreviewObjectUrl
  target.value = ''
}

const restoreOriginalCover = () => {
  assignPersistedCover(form.value.currentCoverUrl)
}

watch(
  () => [form.value.publishType, form.value.isPrivate] as const,
  ([publishType, isPrivate]) => {
    if (isPrivate) {
      if (form.value.publishType !== 'immediate') {
        form.value.publishType = 'immediate'
      }
      form.value.publishTime = ''
      return
    }

    if (publishType !== 'scheduled') return
    refreshScheduleBoundary()
    form.value.publishTime =
      normalizeScheduledPublishTime(form.value.publishTime) || scheduledPublishMinValue.value
  }
)

watch([scheduledPublishMinValue, scheduledPublishMaxValue], () => {
  if (form.value.isPrivate || form.value.publishType !== 'scheduled' || !form.value.publishTime) {
    return
  }

  const normalized = normalizeScheduledPublishTime(form.value.publishTime)
  if (normalized && normalized !== form.value.publishTime) {
    form.value.publishTime = normalized
  }
})

const handleSave = async () => {
  if (!form.value.title.trim()) {
    toast({ title: '请填写标题', variant: 'destructive' })
    return
  }

  if (!form.value.coverPreview) {
    toast({ title: '请上传封面', variant: 'destructive' })
    return
  }

  try {
    saving.value = true

    const tagIds = form.value.tags.length > 0 ? await resolveCreatorTagIds(form.value.tags) : []
    let coverUrl = form.value.currentCoverUrl

    if (form.value.coverFile) {
      const uploadResult = await uploadImage(
        `video-edit-${videoId.value}-${Date.now()}`,
        form.value.coverFile
      )
      coverUrl = uploadResult.imageUrl
    }

    let publishTime: string | undefined
    if (!form.value.isPrivate && form.value.publishType === 'scheduled') {
      const normalized = normalizeScheduledPublishTime(form.value.publishTime)
      if (!normalized) {
        toast({ title: '发布时间格式不正确', variant: 'destructive' })
        return
      }
      publishTime = new Date(normalized).toISOString()
    } else if (hasFutureOriginalPublishTime.value) {
      publishTime = new Date().toISOString()
    }

    const updatePayload: UpdateVideoParams = {
      videoId: videoId.value,
      coverUrl,
    }

    const trimmedTitle = form.value.title.trim()
    if (trimmedTitle) {
      updatePayload.title = trimmedTitle
    }
    if (detailLoaded.value || form.value.description.trim()) {
      updatePayload.description = form.value.description.trim() || undefined
    }
    if (form.value.partitionId) {
      updatePayload.partitionId = form.value.partitionId
    }
    if (detailLoaded.value || tagIds.length > 0) {
      updatePayload.tags = tagIds
    }
    if (detailLoaded.value) {
      updatePayload.isOriginal = form.value.isOriginal
    }
    if (detailLoaded.value || currentStatus.value !== null) {
      updatePayload.isPrivate = form.value.isPrivate
    }
    if (publishTime) {
      updatePayload.publishTime = publishTime
    }

    const updatedVideo = await updateVideo(updatePayload)

    assignPersistedCover(coverUrl)
    currentStatus.value = updatedVideo.status
    originalPublishTime.value = publishTime ?? updatedVideo.publishTime ?? originalPublishTime.value
    detailLoaded.value = true

    toast({ title: '视频信息已更新' })
    void router.push('/creator/content')
  } catch (error) {
    console.error('Failed to update creator video', error)
    toast({ title: '更新失败', variant: 'destructive' })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  refreshScheduleBoundary()
  scheduleBoundaryTimer = window.setInterval(refreshScheduleBoundary, 30000)
  void loadVideo()
})

onBeforeUnmount(() => {
  revokeCoverPreviewUrl()
  if (scheduleBoundaryTimer) {
    clearInterval(scheduleBoundaryTimer)
  }
})
</script>

<template>
  <div class="min-h-screen bg-background pb-24 text-foreground">
    <div class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header class="mb-8 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            as-child
            class="h-10 w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <router-link to="/creator/content">
              <ArrowLeft class="h-5 w-5" />
            </router-link>
          </Button>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-2xl font-bold tracking-tight">更新视频信息</h1>
              <span
                v-if="!loading && !loadError"
                class="rounded-full border px-2.5 py-0.5 text-xs font-medium"
                :class="currentStatusMeta.className"
              >
                {{ currentStatusMeta.label }}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div v-if="loading" class="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div class="space-y-6">
          <div class="h-[500px] animate-pulse rounded-2xl bg-muted/60"></div>
        </div>
        <div class="h-[300px] animate-pulse rounded-2xl bg-muted/60"></div>
      </div>

      <div
        v-else-if="loadError"
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card py-24 text-center shadow-sm"
      >
        <div class="mb-4 rounded-full bg-destructive/10 p-4 text-destructive">
          <AlertCircle class="h-8 w-8" />
        </div>
        <h2 class="mb-2 text-xl font-semibold">加载失败</h2>
        <p class="mb-6 text-muted-foreground">{{ loadError }}</p>
        <Button @click="loadVideo">重新加载</Button>
      </div>

      <div v-else class="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <div class="space-y-8">
          <div
            v-if="partialLoadWarning"
            class="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400"
          >
            {{ partialLoadWarning }}
          </div>

          <section class="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h2 class="mb-6 text-lg font-semibold tracking-tight">基础信息</h2>

            <div class="space-y-6">
              <div class="space-y-2.5">
                <div class="flex items-center justify-between">
                  <Label for="title" class="text-sm font-medium"
                    >标题 <span class="text-destructive">*</span></Label
                  >
                  <span class="text-xs text-muted-foreground">{{ form.title.length }}/80</span>
                </div>
                <Input
                  id="title"
                  :model-value="form.title"
                  placeholder="给视频起一个引人注目的标题"
                  class="h-11 border-border/80 bg-background text-base shadow-none focus-visible:ring-1 focus-visible:ring-primary"
                  @update:model-value="form.title = String($event)"
                />
              </div>

              <div class="space-y-2.5">
                <Label for="description" class="text-sm font-medium">简介</Label>
                <textarea
                  id="description"
                  v-model="form.description"
                  rows="4"
                  class="w-full resize-y rounded-xl border border-border/80 bg-background px-3 py-3 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  placeholder="补充视频背景、制作人员或你希望观众看到的信息"
                ></textarea>
              </div>

              <div class="space-y-3">
                <Label class="text-sm font-medium"
                  >分区 <span class="text-destructive">*</span></Label
                >
                <div class="flex flex-wrap gap-2.5">
                  <button
                    v-for="partition in partitions"
                    :key="partition.id"
                    type="button"
                    class="rounded-full border px-4 py-1.5 text-sm transition-colors"
                    :class="
                      form.partitionId === partition.id
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    "
                    @click="form.partitionId = partition.id"
                  >
                    {{ partition.name }}
                  </button>
                </div>
              </div>

              <div class="space-y-2.5">
                <Label class="text-sm font-medium">标签</Label>
                <TagInput v-model="form.tags" :max="10" />
              </div>
            </div>
          </section>

          <section class="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            <h2 class="mb-6 text-lg font-semibold tracking-tight">发布设置</h2>

            <div class="grid gap-6 sm:grid-cols-2">
              <div class="space-y-3">
                <Label class="text-sm font-medium text-muted-foreground">视频类型</Label>
                <div class="flex gap-3">
                  <div
                    class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
                    :class="
                      form.isOriginal
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    "
                    @click="form.isOriginal = true"
                  >
                    <MonitorPlay class="h-4 w-4" />
                    <span class="text-sm font-medium">自制</span>
                  </div>
                  <div
                    class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
                    :class="
                      !form.isOriginal
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    "
                    @click="form.isOriginal = false"
                  >
                    <Repeat2 class="h-4 w-4" />
                    <span class="text-sm font-medium">转载</span>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <Label class="text-sm font-medium text-muted-foreground">可见性</Label>
                <div class="flex gap-3">
                  <div
                    class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
                    :class="
                      !form.isPrivate
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    "
                    @click="form.isPrivate = false"
                  >
                    <Globe class="h-4 w-4" />
                    <span class="text-sm font-medium">公开</span>
                  </div>
                  <div
                    class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border p-3 transition-colors"
                    :class="
                      form.isPrivate
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    "
                    @click="form.isPrivate = true"
                  >
                    <Lock class="h-4 w-4" />
                    <span class="text-sm font-medium">私密</span>
                  </div>
                </div>
              </div>
            </div>

            <hr class="my-6 border-border" />

            <div class="space-y-4">
              <Label class="text-sm font-medium text-muted-foreground">发布时间</Label>
              <div class="flex flex-wrap gap-3">
                <div
                  class="flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors"
                  :class="
                    form.publishType === 'immediate'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                  "
                  @click="form.publishType = 'immediate'"
                >
                  <Zap class="h-4 w-4" />
                  <span class="text-sm font-medium">立即发布</span>
                </div>
                <div
                  class="flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors"
                  :class="[
                    form.publishType === 'scheduled'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-background text-muted-foreground',
                    isScheduleDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/50',
                  ]"
                  @click="!isScheduleDisabled && (form.publishType = 'scheduled')"
                >
                  <CalendarClock class="h-4 w-4" />
                  <span class="text-sm font-medium">定时发布</span>
                </div>
              </div>

              <div
                v-if="!form.isPrivate && form.publishType === 'scheduled'"
                class="mt-4 rounded-xl border border-border bg-muted/30 p-4"
              >
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <ScheduledPublishPicker v-model="form.publishTime" />
                  <p class="text-xs text-muted-foreground">
                    支持预约未来 5 分钟至 14 天内的发布时间。
                  </p>
                </div>
              </div>

              <div
                v-else-if="hasFutureOriginalPublishTime"
                class="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
              >
                保存后，将撤销原有的定时发布，改为立即生效。
              </div>
            </div>
          </section>
        </div>

        <aside class="sticky top-8 space-y-6">
          <section class="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-base font-semibold">视频封面</h2>
              <span
                v-if="form.coverFile"
                class="flex h-5 items-center rounded-full bg-primary/10 px-2 text-[10px] font-semibold text-primary"
              >
                待上传
              </span>
            </div>

            <label
              class="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-border/80 bg-muted/30 transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <img
                v-if="form.coverPreview"
                :src="form.coverPreview"
                :alt="form.title || '视频封面'"
                class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div
                v-else
                class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
              >
                <ImageIcon class="h-8 w-8 opacity-50" />
                <span class="text-sm">点击上传封面</span>
              </div>

              <div
                class="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100"
              >
                <span
                  class="rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white shadow-sm"
                >
                  {{ form.coverFile ? '更换文件' : '替换封面' }}
                </span>
              </div>
              <input type="file" accept="image/*" class="hidden" @change="handleCoverChange" />
            </label>

            <div class="mt-4 flex items-center justify-between">
              <p class="text-xs text-muted-foreground">建议尺寸 1920x1080 (16:9)</p>
              <Button
                v-if="form.coverFile"
                variant="ghost"
                size="sm"
                class="h-auto py-1 text-xs"
                @click="restoreOriginalCover"
              >
                恢复原图
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>

    <div
      v-if="!loading && !loadError"
      class="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/80 p-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
    >
      <div class="mx-auto flex max-w-6xl items-center justify-end gap-4 px-4 sm:px-6 lg:px-8">
        <Button variant="ghost" as-child class="rounded-full">
          <router-link to="/creator/content">取消</router-link>
        </Button>
        <Button
          class="rounded-full px-8 shadow-md transition-transform hover:-translate-y-0.5 active:translate-y-0"
          :disabled="saving"
          @click="handleSave"
        >
          <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
          {{ saving ? '保存中...' : '保存更改' }}
        </Button>
      </div>
    </div>
  </div>
</template>
