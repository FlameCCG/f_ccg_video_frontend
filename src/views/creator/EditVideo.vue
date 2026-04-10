<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Clock3, Image as ImageIcon, Loader2, Lock } from 'lucide-vue-next'
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
        className: 'bg-[var(--status-success-soft)] text-[var(--status-success-ink)]',
      }
    case 2:
      return {
        label: '私密',
        className: 'bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]',
      }
    case 4:
      return {
        label: '审核中',
        className: 'bg-[var(--status-info-soft)] text-[var(--status-info-ink)]',
      }
    case 3:
      return {
        label: '已删除',
        className: 'bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]',
      }
    default:
      return {
        label: '草稿信息',
        className: 'bg-muted text-muted-foreground',
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
  <div class="mx-auto max-w-6xl px-4 py-8">
    <div
      class="overflow-hidden rounded-[32px] border border-border/60 bg-[radial-gradient(circle_at_top_left,_color-mix(in_oklch,var(--primary)_18%,transparent),transparent_32%),linear-gradient(180deg,color-mix(in_oklch,var(--background)_90%,var(--muted)_10%),color-mix(in_oklch,var(--background)_96%,var(--muted)_4%))] shadow-[0_30px_90px_-60px_color-mix(in_oklch,var(--foreground)_32%,transparent)]"
    >
      <div class="border-b border-border/60 px-6 py-5 sm:px-8">
        <Button
          variant="ghost"
          as-child
          class="-ml-3 h-9 px-3 text-muted-foreground hover:text-foreground"
        >
          <router-link to="/creator/content">
            <ArrowLeft class="mr-2 h-4 w-4" />
            返回视频管理
          </router-link>
        </Button>

        <div v-if="loading" class="mt-5 space-y-3">
          <div class="h-9 w-40 animate-pulse rounded-xl bg-muted"></div>
          <div class="h-5 w-72 animate-pulse rounded-xl bg-muted"></div>
        </div>

        <div v-else-if="loadError" class="mt-5 space-y-3">
          <h1 class="text-3xl font-bold tracking-tight">更新视频</h1>
          <p class="text-sm text-destructive">{{ loadError }}</p>
          <Button variant="outline" @click="loadVideo">重新加载</Button>
        </div>

        <div v-else class="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <h1 class="text-3xl font-bold tracking-tight">更新视频</h1>
              <span
                class="rounded-full px-3 py-1 text-xs font-medium"
                :class="currentStatusMeta.className"
              >
                {{ currentStatusMeta.label }}
              </span>
              <span
                v-if="form.isPrivate"
                class="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                定时发布已锁定
              </span>
            </div>
            <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
              这里专注调整视频对外展示的信息。视频源、分 P
              与已有数据保持不动，保存后会直接回到创作中心列表。
            </p>
            <div
              v-if="partialLoadWarning"
              class="max-w-2xl rounded-2xl border border-[var(--status-warning-border)] bg-[var(--status-warning-soft)]/70 px-4 py-3 text-sm leading-6 text-[var(--status-warning-ink)]"
            >
              {{ partialLoadWarning }}
            </div>
          </div>

          <div
            class="rounded-2xl border border-border/60 bg-background/70 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur"
          >
            <div class="flex items-center gap-2 font-medium text-foreground">
              <Clock3 class="h-4 w-4 text-primary" />
              发布时间策略
            </div>
            <p class="mt-1 leading-6">公开视频支持立即发布或定时发布，私密视频只允许立即生效。</p>
          </div>
        </div>
      </div>

      <div v-if="loading" class="grid gap-6 px-6 py-6 sm:px-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-5 rounded-[28px] border border-border/60 bg-background/80 p-6">
          <div class="h-12 animate-pulse rounded-2xl bg-muted"></div>
          <div class="h-32 animate-pulse rounded-3xl bg-muted"></div>
          <div class="h-48 animate-pulse rounded-3xl bg-muted"></div>
        </div>
        <div
          class="h-[420px] animate-pulse rounded-[28px] border border-border/60 bg-muted/50"
        ></div>
      </div>

      <div
        v-else-if="!loadError"
        class="grid gap-6 px-6 py-6 sm:px-8 xl:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div
          class="space-y-6 rounded-[28px] border border-border/60 bg-background/80 p-6 shadow-sm backdrop-blur"
        >
          <div class="space-y-2">
            <Label for="edit-video-title" class="text-base">
              标题 <span class="text-red-500">*</span>
            </Label>
            <Input
              id="edit-video-title"
              :model-value="form.title"
              placeholder="给视频起一个更容易被记住的标题"
              class="h-12 text-base"
              @update:model-value="form.title = String($event)"
            />
            <div class="text-right text-xs text-muted-foreground">{{ form.title.length }}/80</div>
          </div>

          <div class="space-y-2">
            <Label for="edit-video-desc" class="text-base">简介</Label>
            <textarea
              id="edit-video-desc"
              v-model="form.description"
              class="min-h-[140px] w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="补充创作背景、补档说明或你希望观众看到的信息"
              rows="5"
            ></textarea>
          </div>

          <div class="space-y-3">
            <Label class="text-base">分区 <span class="text-red-500">*</span></Label>
            <div class="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-5">
              <button
                v-for="partition in partitions"
                :key="partition.id"
                type="button"
                class="rounded-2xl border px-3 py-2.5 text-sm transition-all"
                :class="
                  form.partitionId === partition.id
                    ? 'scale-[1.02] border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                    : 'border-border/70 bg-muted/20 text-foreground hover:border-primary/35 hover:bg-muted/40'
                "
                @click="form.partitionId = partition.id"
              >
                {{ partition.name }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <Label class="text-base">标签</Label>
            <TagInput v-model="form.tags" :max="10" />
            <p class="text-xs text-muted-foreground">
              保存时会自动把你输入的标签创建为站内标签，并同步到视频信息里。
            </p>
          </div>

          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-3 rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <Label class="text-base">类型</Label>
              <div class="flex flex-wrap gap-5">
                <label class="flex items-center gap-2 text-sm">
                  <input
                    v-model="form.isOriginal"
                    type="radio"
                    :value="true"
                    class="h-4 w-4 accent-primary"
                  />
                  <span>自制</span>
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input
                    v-model="form.isOriginal"
                    type="radio"
                    :value="false"
                    class="h-4 w-4 accent-primary"
                  />
                  <span>转载</span>
                </label>
              </div>
            </div>

            <div class="space-y-3 rounded-[24px] border border-border/60 bg-muted/15 p-4">
              <Label class="text-base">可见性</Label>
              <label class="flex items-start gap-3">
                <input
                  v-model="form.isPrivate"
                  type="checkbox"
                  class="mt-1 h-4 w-4 accent-primary"
                />
                <div class="space-y-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-medium text-foreground">设为私密视频</span>
                    <span
                      class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      :class="
                        form.isPrivate
                          ? 'bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)]'
                          : 'bg-[var(--status-success-soft)] text-[var(--status-success-ink)]'
                      "
                    >
                      {{ form.isPrivate ? '仅自己可见' : '公开展示' }}
                    </span>
                  </div>
                  <p class="text-sm leading-6 text-muted-foreground">
                    私密后不会出现在公开流量入口里，同时会强制关闭定时发布。
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div class="space-y-3 rounded-[24px] border border-border/60 bg-muted/15 p-4">
            <Label class="text-base">发布时间</Label>
            <div class="flex flex-wrap gap-5">
              <label class="flex items-center gap-2 text-sm">
                <input
                  v-model="form.publishType"
                  type="radio"
                  value="immediate"
                  class="h-4 w-4 accent-primary"
                />
                <span>立即发布</span>
              </label>
              <label
                class="flex items-center gap-2 text-sm transition-opacity"
                :class="isScheduleDisabled ? 'cursor-not-allowed opacity-50' : ''"
              >
                <input
                  v-model="form.publishType"
                  type="radio"
                  value="scheduled"
                  class="h-4 w-4 accent-primary"
                  :disabled="isScheduleDisabled"
                />
                <span>定时发布</span>
              </label>
            </div>

            <div
              v-if="isScheduleDisabled"
              class="rounded-2xl border border-dashed border-border/60 bg-background/65 px-4 py-3 text-sm text-muted-foreground"
            >
              私密视频不能定时。取消私密后，可重新设定最早 5 分钟、最晚 14 天的发布时间。
            </div>

            <div
              v-if="!form.isPrivate && form.publishType === 'scheduled'"
              class="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/70 p-4 lg:flex-row lg:items-center"
            >
              <ScheduledPublishPicker v-model="form.publishTime" />
              <p class="text-sm text-muted-foreground">
                当前窗口支持最早 5 分钟后发布，最晚可预约到未来 14 天。
              </p>
            </div>

            <div
              v-else-if="hasFutureOriginalPublishTime"
              class="rounded-2xl border border-border/60 bg-background/65 px-4 py-3 text-sm text-muted-foreground"
            >
              该视频原本存在未来发布时间。保存当前设置后，会改为立即生效。
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <div
            class="rounded-[28px] border border-border/60 bg-background/80 p-5 shadow-sm backdrop-blur"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-foreground">封面预览</p>
                <p class="mt-1 text-xs text-muted-foreground">支持直接替换，不会影响原视频文件。</p>
              </div>
              <span
                v-if="form.coverFile"
                class="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
              >
                待上传
              </span>
            </div>

            <label
              class="group relative mt-4 flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-border/70 bg-muted/20 transition hover:border-primary/45"
            >
              <img
                v-if="form.coverPreview"
                :src="form.coverPreview"
                :alt="form.title || '视频封面'"
                class="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <div
                v-else
                class="flex flex-col items-center gap-2 px-6 text-center text-sm text-muted-foreground"
              >
                <ImageIcon class="h-8 w-8 opacity-60" />
                <span>点击上传新封面</span>
              </div>
              <div
                class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 via-black/15 to-transparent px-4 py-3 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <span>{{ form.coverFile ? '重新选择封面' : '替换当前封面' }}</span>
                <span>建议比例 16:9</span>
              </div>
              <input
                type="file"
                accept="image/*"
                class="absolute inset-0 opacity-0"
                @change="handleCoverChange"
              />
            </label>

            <div class="mt-4 flex flex-wrap gap-3">
              <Button
                v-if="form.coverFile"
                variant="outline"
                size="sm"
                class="rounded-full"
                @click="restoreOriginalCover"
              >
                恢复原封面
              </Button>
              <p class="text-xs leading-6 text-muted-foreground">
                没有变更封面时，将继续使用现在的封面地址。
              </p>
            </div>
          </div>

          <div class="rounded-[28px] border border-border/60 bg-muted/15 p-5">
            <div class="flex items-center gap-2 text-sm font-medium text-foreground">
              <Lock class="h-4 w-4 text-primary" />
              保存后会发生什么
            </div>
            <div class="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
              <p>1. 标题、简介、分区、标签和封面会立即更新到前台展示层。</p>
              <p>2. 私密状态会直接影响可见范围，并同步约束发布时间策略。</p>
              <p>3. 现有视频文件、分 P 顺序、弹幕和播放数据都不会被这次编辑重置。</p>
            </div>
          </div>
        </aside>
      </div>

      <div
        v-if="!loading && !loadError"
        class="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 px-6 py-5 sm:px-8"
      >
        <Button variant="outline" as-child class="rounded-full px-5">
          <router-link to="/creator/content">取消</router-link>
        </Button>
        <Button class="rounded-full px-6" :disabled="saving" @click="handleSave">
          <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
          保存修改
        </Button>
      </div>
    </div>
  </div>
</template>
