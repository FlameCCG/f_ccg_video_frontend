<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue'
import { Film, ImagePlus, RotateCcw, UploadCloud, ZoomIn } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast/use-toast'

interface CoverPayload {
  file: File
  preview: string
}

const props = defineProps<{
  open: boolean
  videoUrl: string
  initialPreview: string
  initialFile: File | null
  title: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [payload: CoverPayload]
}>()

const { toast } = useToast()
const videoRef = useTemplateRef<HTMLVideoElement>('cover-video')
const canvasRef = useTemplateRef<HTMLCanvasElement>('cover-canvas')

const sourceKind = shallowRef<'video' | 'image'>('video')
const sourceImage = shallowRef<HTMLImageElement | null>(null)
const zoom = shallowRef(1)
const panX = shallowRef(0)
const panY = shallowRef(0)
const videoError = shallowRef(false)
const manualFileName = shallowRef('')
const dragging = shallowRef(false)
const hasRenderedPreview = shallowRef(false)

const previewAvailable = computed(() => {
  if (sourceKind.value === 'image') return Boolean(sourceImage.value)
  const video = videoRef.value
  return (
    hasRenderedPreview.value ||
    Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !videoError.value)
  )
})
const canPan = computed(() => previewAvailable.value && zoom.value > 1.001)
const cropInstruction = computed(() =>
  canPan.value ? '拖动画面调整构图' : '放大到 100% 以上后可移动'
)

let sourceObjectUrl = ''
let renderFrame: number | null = null
let dragPointerId: number | null = null
let dragStartX = 0
let dragStartY = 0
let dragStartPanX = 0
let dragStartPanY = 0

const revokeSourceObjectUrl = () => {
  if (!sourceObjectUrl) return
  URL.revokeObjectURL(sourceObjectUrl)
  sourceObjectUrl = ''
}

const getSource = (): {
  element: CanvasImageSource
  width: number
  height: number
} | null => {
  if (sourceKind.value === 'image' && sourceImage.value) {
    return {
      element: sourceImage.value,
      width: sourceImage.value.naturalWidth,
      height: sourceImage.value.naturalHeight,
    }
  }

  const video = videoRef.value
  if (
    sourceKind.value === 'video' &&
    video &&
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return {
      element: video,
      width: video.videoWidth,
      height: video.videoHeight,
    }
  }

  return null
}

const clampPan = (sourceWidth: number, sourceHeight: number) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const baseScale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight)
  const drawWidth = sourceWidth * baseScale * zoom.value
  const drawHeight = sourceHeight * baseScale * zoom.value
  const limitX = Math.max((drawWidth - canvas.width) / 2, 0)
  const limitY = Math.max((drawHeight - canvas.height) / 2, 0)

  panX.value = Math.min(Math.max(panX.value, -limitX), limitX)
  panY.value = Math.min(Math.max(panY.value, -limitY), limitY)
}

const renderCrop = () => {
  renderFrame = null
  const canvas = canvasRef.value
  const source = getSource()
  if (!canvas || !source || source.width <= 0 || source.height <= 0) return

  const context = canvas.getContext('2d')
  if (!context) return

  clampPan(source.width, source.height)
  const baseScale = Math.max(canvas.width / source.width, canvas.height / source.height)
  const scale = baseScale * zoom.value
  const drawWidth = source.width * scale
  const drawHeight = source.height * scale
  const drawX = (canvas.width - drawWidth) / 2 + panX.value
  const drawY = (canvas.height - drawHeight) / 2 + panY.value

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source.element, drawX, drawY, drawWidth, drawHeight)
  hasRenderedPreview.value = true
}

const scheduleRender = () => {
  if (renderFrame !== null) return
  renderFrame = window.requestAnimationFrame(renderCrop)
}

const resetTransform = () => {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  scheduleRender()
}

const loadImageSource = async (url: string, fileName = '') => {
  const image = new Image()
  image.decoding = 'async'
  image.crossOrigin = 'anonymous'

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('封面图片读取失败'))
    image.src = url
  })

  sourceImage.value = image
  sourceKind.value = 'image'
  manualFileName.value = fileName
  resetTransform()
}

const initializeEditor = async () => {
  videoError.value = false
  hasRenderedPreview.value = false
  sourceImage.value = null
  manualFileName.value = ''
  revokeSourceObjectUrl()
  resetTransform()
  await nextTick()

  try {
    if (props.initialFile) {
      sourceObjectUrl = URL.createObjectURL(props.initialFile)
      await loadImageSource(sourceObjectUrl, props.initialFile.name)
    } else if (props.initialPreview) {
      await loadImageSource(props.initialPreview)
    } else {
      sourceKind.value = 'video'
      scheduleRender()
    }
  } catch {
    sourceKind.value = 'video'
    scheduleRender()
  }
}

const useCurrentVideoFrame = () => {
  if (videoError.value) return
  sourceKind.value = 'video'
  sourceImage.value = null
  manualFileName.value = ''
  scheduleRender()
}

const onVideoLoadedData = () => {
  videoError.value = false
  if (!props.initialFile && !props.initialPreview) {
    useCurrentVideoFrame()
  }
}

const onManualCoverChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return

  revokeSourceObjectUrl()
  sourceObjectUrl = URL.createObjectURL(file)

  try {
    await loadImageSource(sourceObjectUrl, file.name)
  } catch {
    toast({ title: '图片读取失败，请换一张图片', variant: 'destructive' })
  }
}

const updateZoom = (value: number) => {
  const nextZoom = Math.min(Math.max(value, 1), 3)
  zoom.value = nextZoom
  if (nextZoom <= 1.001) {
    panX.value = 0
    panY.value = 0
    dragging.value = false
  }
  scheduleRender()
}

const onWheel = (event: WheelEvent) => {
  updateZoom(zoom.value + (event.deltaY > 0 ? -0.08 : 0.08))
}

const onPointerDown = (event: PointerEvent) => {
  if (!canPan.value) return
  const canvas = canvasRef.value
  if (!canvas) return

  event.preventDefault()
  dragPointerId = event.pointerId
  dragStartX = event.clientX
  dragStartY = event.clientY
  dragStartPanX = panX.value
  dragStartPanY = panY.value
  dragging.value = true
  canvas.setPointerCapture(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!canPan.value || !dragging.value || dragPointerId !== event.pointerId) return
  const canvas = canvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  panX.value = dragStartPanX + ((event.clientX - dragStartX) * canvas.width) / rect.width
  panY.value = dragStartPanY + ((event.clientY - dragStartY) * canvas.height) / rect.height
  scheduleRender()
}

const onPointerUp = (event: PointerEvent) => {
  if (dragPointerId !== event.pointerId) return
  dragging.value = false
  dragPointerId = null
  const canvas = canvasRef.value
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId)
  }
}

const onCanvasKeydown = (event: KeyboardEvent) => {
  const isPanKey = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
  if (isPanKey && !canPan.value) return

  const panStep = event.shiftKey ? 48 : 16
  switch (event.key) {
    case 'ArrowLeft':
      panX.value -= panStep
      break
    case 'ArrowRight':
      panX.value += panStep
      break
    case 'ArrowUp':
      panY.value -= panStep
      break
    case 'ArrowDown':
      panY.value += panStep
      break
    case '+':
    case '=':
      updateZoom(zoom.value + 0.1)
      event.preventDefault()
      return
    case '-':
      updateZoom(zoom.value - 0.1)
      event.preventDefault()
      return
    default:
      return
  }
  event.preventDefault()
  scheduleRender()
}

const confirmCover = async () => {
  renderCrop()
  const canvas = canvasRef.value
  if (!canvas || !previewAvailable.value) {
    toast({ title: '请先选择一个可用的封面画面', variant: 'destructive' })
    return
  }

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })
    if (!blob) throw new Error('封面生成失败')

    const preview = canvas.toDataURL('image/jpeg', 0.92)
    emit('confirm', {
      file: new File([blob], `cover-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      preview,
    })
    emit('update:open', false)
  } catch {
    toast({
      title: '封面生成失败',
      description: '当前视频源可能不允许浏览器读取画面，请改用手动上传。',
      variant: 'destructive',
    })
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) void initializeEditor()
  }
)

onBeforeUnmount(() => {
  revokeSourceObjectUrl()
  if (renderFrame !== null) window.cancelAnimationFrame(renderFrame)
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="cover-editor flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden p-0 sm:max-w-[980px]"
    >
      <DialogHeader class="cover-editor__header">
        <div class="cover-editor__title-row">
          <div>
            <DialogTitle>设置封面</DialogTitle>
            <DialogDescription class="mt-1">
              从视频选帧或上传图片，再完成最后的构图。
            </DialogDescription>
          </div>
          <span class="cover-editor__ratio">16:9 · 1280 × 720</span>
        </div>
      </DialogHeader>

      <div class="cover-editor__body">
        <div class="cover-editor__workspace">
          <section class="cover-editor__section">
            <div class="cover-editor__section-head">
              <span class="cover-editor__eyebrow">
                <Film class="h-4 w-4" />
                视频选帧
              </span>
              <span class="text-xs text-muted-foreground">拖动进度条换帧</span>
            </div>
            <div class="cover-editor__video-shell">
              <video
                v-if="videoUrl"
                ref="cover-video"
                :src="videoUrl"
                controls
                playsinline
                crossorigin="anonymous"
                class="cover-editor__video"
                @loadeddata="onVideoLoadedData"
                @play="useCurrentVideoFrame"
                @seeking="useCurrentVideoFrame"
                @seeked="useCurrentVideoFrame"
                @error="videoError = true"
              ></video>
              <div v-else class="cover-editor__video-empty">当前作品暂无可预览的视频源</div>
            </div>
            <p v-if="videoError" class="mt-2 text-xs text-destructive">
              当前视频无法读取画面，请上传封面图片。
            </p>
          </section>

          <section class="cover-editor__section">
            <div class="cover-editor__section-head">
              <span class="cover-editor__eyebrow">封面预览</span>
              <span id="cover-pan-hint" class="text-xs text-muted-foreground">
                {{ cropInstruction }}
              </span>
            </div>

            <div class="cover-editor__crop-shell">
              <canvas
                ref="cover-canvas"
                width="1280"
                height="720"
                class="cover-editor__canvas"
                :class="{ 'is-pannable': canPan, 'is-dragging': dragging }"
                tabindex="0"
                :aria-label="
                  canPan
                    ? '封面裁切预览，可拖动或使用方向键调整位置'
                    : '封面裁切预览，放大后可移动画面'
                "
                aria-describedby="cover-pan-hint"
                @wheel.prevent="onWheel"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
                @keydown="onCanvasKeydown"
              ></canvas>
              <div v-if="!previewAvailable" class="cover-editor__crop-empty">
                <ImagePlus class="h-7 w-7" />
                <span>选择视频画面或上传图片</span>
              </div>
              <div class="cover-editor__crop-guides" aria-hidden="true"></div>
              <span class="cover-editor__preview-badge" aria-hidden="true">封面预览</span>
            </div>

            <div class="cover-editor__controls">
              <ZoomIn class="h-4 w-4 shrink-0 text-muted-foreground" />
              <label for="cover-zoom" class="sr-only">封面缩放</label>
              <input
                id="cover-zoom"
                type="range"
                min="1"
                max="3"
                step="0.05"
                :value="zoom"
                class="cover-editor__range"
                @input="updateZoom(Number(($event.target as HTMLInputElement).value))"
              />
              <span class="tabular w-11 text-right text-xs text-muted-foreground">
                {{ Math.round(zoom * 100) }}%
              </span>
              <Button variant="ghost" size="sm" class="h-8 px-2" @click="resetTransform">
                <RotateCcw class="h-3.5 w-3.5" />
                重置
              </Button>
            </div>
          </section>
        </div>

        <aside class="cover-editor__manual">
          <div class="cover-editor__manual-head">
            <p class="text-sm font-semibold">上传图片</p>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">使用已经设计好的封面</p>
          </div>

          <label class="cover-editor__upload">
            <span class="cover-editor__upload-icon">
              <UploadCloud class="h-4 w-4" />
            </span>
            <span class="cover-editor__upload-copy">
              <strong>{{ manualFileName ? '更换图片' : '选择封面图片' }}</strong>
              <span class="cover-editor__file-name">
                {{ manualFileName || '点击从本地选择' }}
              </span>
            </span>
            <input type="file" accept="image/*" class="sr-only" @change="onManualCoverChange" />
          </label>

          <div class="cover-editor__specs">
            <div>
              <span>格式</span>
              <strong>JPG / PNG / WebP</strong>
            </div>
            <div>
              <span>输出</span>
              <strong>1280 × 720</strong>
            </div>
          </div>
        </aside>
      </div>

      <DialogFooter class="cover-editor__footer">
        <p class="cover-editor__footer-hint">
          {{ canPan ? '拖动预览微调主体位置' : '放大后即可移动画面' }}
        </p>
        <div class="flex items-center gap-2">
          <Button variant="outline" @click="emit('update:open', false)">取消</Button>
          <Button :disabled="!previewAvailable" @click="confirmCover">应用封面</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
.cover-editor__header {
  padding: 1.125rem 1.25rem;
  border-bottom: 1px solid var(--color-border);
}

.cover-editor__title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  padding-right: 1.75rem;
}

.cover-editor__ratio {
  display: inline-flex;
  min-height: 1.75rem;
  align-items: center;
  padding: 0 0.625rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background-color: color-mix(in oklch, var(--color-muted) 48%, transparent);
  color: var(--color-muted-foreground);
  font-size: 0.6875rem;
  font-weight: 500;
}

.cover-editor__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

@media (width >= 800px) {
  .cover-editor__body {
    grid-template-columns: minmax(0, 1fr) 14.5rem;
  }
}

.cover-editor__workspace {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  min-width: 0;
  padding: 1.25rem;
}

.cover-editor__section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.cover-editor__section-head {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  min-height: 1.5rem;
}

.cover-editor__eyebrow {
  display: inline-flex;
  gap: 0.375rem;
  align-items: center;
  color: var(--color-foreground);
  font-size: 0.8125rem;
  font-weight: 600;
}

.cover-editor__video-shell,
.cover-editor__crop-shell {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--media-overlay);
  box-shadow: var(--shadow-surface);
}

.cover-editor__video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.cover-editor__video-empty,
.cover-editor__crop-empty {
  display: flex;
  position: absolute;
  inset: 0;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  color: var(--media-overlay-text);
  font-size: 0.8125rem;
  text-align: center;
}

.cover-editor__canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: default;
  touch-action: none;

  &.is-pannable {
    cursor: grab;
  }

  &.is-dragging {
    cursor: grabbing;
  }

  &:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: -3px;
  }
}

.cover-editor__crop-guides {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &::before,
  &::after {
    position: absolute;
    border-color: color-mix(in oklch, var(--media-overlay-text) 18%, transparent);
    border-style: solid;
    content: '';
  }

  &::before {
    inset: 0 33.333%;
    border-width: 0 1px;
  }

  &::after {
    inset: 33.333% 0;
    border-width: 1px 0;
  }
}

.cover-editor__preview-badge {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm);
  background-color: var(--media-overlay);
  color: var(--media-overlay-text);
  font-size: 0.625rem;
  line-height: 1rem;
  pointer-events: none;
}

.cover-editor__controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-height: 2rem;
}

.cover-editor__range {
  flex: 1;
  min-width: 5rem;
  accent-color: var(--color-primary);
}

.cover-editor__manual {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1.25rem;
  border-top: 1px solid var(--color-border);
  background-color: color-mix(in oklch, var(--color-muted) 28%, var(--color-background));
}

@media (width >= 800px) {
  .cover-editor__manual {
    border-top: 0;
    border-left: 1px solid var(--color-border);
  }
}

.cover-editor__upload {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  min-height: 4.5rem;
  padding: 0.75rem;
  border: 1px dashed color-mix(in oklch, var(--color-primary) 38%, var(--color-border));
  border-radius: var(--radius-lg);
  background-color: var(--color-card);
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &:focus-within {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .cover-editor__upload:hover {
    border-color: var(--color-primary);
    background-color: color-mix(in oklch, var(--color-primary) 5%, var(--color-card));
  }
}

.cover-editor__upload-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-md);
  background-color: color-mix(in oklch, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.cover-editor__upload-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  color: var(--color-foreground);
  font-size: 0.75rem;
}

.cover-editor__file-name {
  display: block;
  max-width: 100%;
  overflow: hidden;
  color: var(--color-muted-foreground);
  font-size: 0.6875rem;
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cover-editor__specs {
  display: grid;
  gap: 0;
  border-top: 1px solid var(--color-border);

  > div {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0;
    color: var(--color-muted-foreground);
    font-size: 0.6875rem;

    + div {
      border-top: 1px solid var(--color-border);
    }
  }

  strong {
    color: var(--color-foreground);
    font-weight: 500;
  }
}

.cover-editor__footer {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-top: 1px solid var(--color-border);
}

.cover-editor__footer-hint {
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
}

@media (width < 800px) {
  .cover-editor__manual {
    display: block;
  }

  .cover-editor__manual-head {
    display: none;
  }

  .cover-editor__specs {
    display: none;
  }
}

@media (width < 560px) {
  .cover-editor__header {
    padding: 1rem;
  }

  .cover-editor__ratio,
  .cover-editor__footer-hint {
    display: none;
  }

  .cover-editor__workspace {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.875rem 1rem;
  }

  .cover-editor__manual {
    display: block;
    padding: 0.75rem 1rem;
  }

  .cover-editor__footer {
    justify-content: flex-end;
    padding: 0.75rem 1rem;
  }
}
</style>
