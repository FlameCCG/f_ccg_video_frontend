<script setup lang="ts">
/**
 * 滑块验证码
 *
 * 状态机（与点选验证码同构）：
 *   idle →（释放滑块）verifying →（父组件问过后端）success | fail
 *
 * 动效上的四个刻意选择：
 * 1. 拖拽期零 transition、零响应式：位移经 rAF 合并后直接写根节点的 --sc-x / --sc-fill，
 *    组件本身在整段拖拽里不 patch（aria 值按 150ms 节流同步）。
 * 2. 扫描光带绑在 verifying —— 真正在等后端的那一段才需要「有事在发生」，
 *    判定动画是收尾，不该抢等待的戏。
 * 3. 成功不盖遮罩：遮罩淡出，让「拼图坐进缺口」这个唯一的高潮点露出来，
 *    对勾降级成右下角小徽标，画完 emit settled，由弹层决定关窗时机。
 * 4. 失败分两拍：先原地 recoil（140ms），再沿路径撤回（420ms out-quint），
 *    两段不叠在一起互相打架。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RefreshCw } from 'lucide-vue-next'
import { getSlideCaptcha, type SlideCaptcha } from '@/api/captcha'
import { CAPTCHA_RECOIL_DURATION, captchaTipText, useCaptchaState } from './useCaptchaState'
import { clamp, useFrameWriter } from './captchaGeometry'

interface Props {
  /** 是否显示/激活（用于弹层挂载时再拉码） */
  visible?: boolean
}

interface CaptchaResult {
  token: string
  x: number
  y: number
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
})

const emit = defineEmits<{
  success: [result: CaptchaResult]
  confirm: [result: CaptchaResult]
  fail: []
  refresh: []
  /** 成功动画播完。弹层据此关窗，而不是靠魔法数字把动画拦腰砍断 */
  settled: []
}>()

const DEFAULT_CONTAINER_WIDTH = 280
const DEFAULT_HANDLE_WIDTH = 44
/** 拖拽期 aria 值的同步间隔：屏幕阅读器不需要每帧播报，但也不能整段拖拽都是旧值 */
const ARIA_SYNC_INTERVAL = 150
/** 与 scss 里 --cap-slow 的回撤时长对齐，用来摘掉 --returning */
const RETURN_DURATION = 420
const KEYBOARD_ACTIVE_HOLD = 900
const IDLE_TIP = '按住滑块，把拼图推进缺口'

const captchaData = ref<SlideCaptcha | null>(null)
const loading = ref(false)
const loadFailed = ref(false)
const isDragging = ref(false)
const isReturning = ref(false)
const isRecoiling = ref(false)
const isNudging = ref(false)
const isKeyboardActive = ref(false)
/** 仅供 aria / 提交用；拖拽热路径不写它 */
const sliderX = ref(0)
const maxSlide = ref(DEFAULT_CONTAINER_WIDTH - DEFAULT_HANDLE_WIDTH)
/** 首次出图后锁住舞台高度，之后刷新不再塌陷再弹回 */
const stageMinHeight = ref(0)
const lastResult = ref<CaptchaResult | null>(null)

const rootRef = ref<HTMLDivElement | null>(null)
const sliderRef = ref<HTMLDivElement | null>(null)
const masterRef = ref<HTMLImageElement | null>(null)

/** 非响应式度量：热路径只读这个对象 */
const metrics = { container: DEFAULT_CONTAINER_WIDTH, handle: DEFAULT_HANDLE_WIDTH, scale: 1 }
let rawX = 0
let dragging = false
let pointerOrigin = 0
let lastAriaSync = 0
let resizeObserver: ResizeObserver | undefined
let captchaRequestId = 0

const timers = new Set<ReturnType<typeof setTimeout>>()

function later(job: () => void, delay: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    job()
  }, delay)
  timers.add(timer)
}

function clearLocalTimers(): void {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
}

const frame = useFrameWriter()
const state = useCaptchaState({
  onReset: () => {
    void fetchCaptcha()
  },
})
const status = state.status

const isInteractive = computed(
  () => !loading.value && !loadFailed.value && Boolean(captchaData.value) && status.value === 'idle'
)
const canRefresh = computed(
  () => !loading.value && status.value !== 'verifying' && status.value !== 'success'
)
const isActiveInput = computed(() => isDragging.value || isKeyboardActive.value)
const tipText = computed(() => captchaTipText(status.value, IDLE_TIP))
const progressPercentage = computed(() => {
  if (maxSlide.value <= 0) return 0
  return Math.round((sliderX.value / maxSlide.value) * 100)
})
const stageStyle = computed(() =>
  stageMinHeight.value > 0 ? { '--sc-stage-min': `${stageMinHeight.value}px` } : undefined
)
const stageClass = computed(() => ({
  'cap-stage--active': isActiveInput.value,
  'cap-stage--verifying': status.value === 'verifying',
  'cap-stage--success': status.value === 'success',
  'cap-stage--fail': status.value === 'fail',
}))

/** 位移与进度条一起落到 CSS 变量上，一帧一次 */
function writeSliderX(x: number): void {
  const root = rootRef.value
  if (!root) return
  root.style.setProperty('--sc-x', `${x}px`)
  root.style.setProperty(
    '--sc-fill',
    metrics.container > 0 ? String(Math.min((x + metrics.handle) / metrics.container, 1)) : '0'
  )
}

const flushX = (): void => writeSliderX(rawX)

function applyMetrics(): void {
  const root = rootRef.value
  if (!root) return
  root.style.setProperty('--sc-scale', String(metrics.scale))
  root.style.setProperty('--sc-tile-y', `${(captchaData.value?.thumbY ?? 0) * metrics.scale}px`)
}

function setSliderX(next: number): void {
  rawX = clamp(next, 0, maxSlide.value)
  sliderX.value = rawX
  writeSliderX(rawX)
}

function measure(): void {
  const root = rootRef.value
  if (root) metrics.container = root.getBoundingClientRect().width || DEFAULT_CONTAINER_WIDTH
  const handle = sliderRef.value
  if (handle) metrics.handle = handle.getBoundingClientRect().width || DEFAULT_HANDLE_WIDTH

  const image = masterRef.value
  if (image?.naturalWidth) {
    const width = image.getBoundingClientRect().width
    if (width > 0) metrics.scale = width / image.naturalWidth
  }

  maxSlide.value = Math.max(metrics.container - metrics.handle, 0)
  applyMetrics()
  setSliderX(rawX)
}

function handleMasterLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth) return
  const rect = image.getBoundingClientRect()
  if (rect.width > 0) metrics.scale = rect.width / image.naturalWidth
  if (rect.height > 0) stageMinHeight.value = Math.round(rect.height)
  applyMetrics()
}

async function fetchCaptcha(): Promise<void> {
  const requestId = ++captchaRequestId
  clearLocalTimers()
  state.toIdle()
  loading.value = true
  loadFailed.value = false
  dragging = false
  isDragging.value = false
  isReturning.value = false
  isRecoiling.value = false
  isNudging.value = false
  lastResult.value = null
  setSliderX(0)

  try {
    const data = await getSlideCaptcha()
    if (requestId !== captchaRequestId) return
    captchaData.value = data
    await nextTick()
    measure()
  } catch {
    if (requestId === captchaRequestId) {
      captchaData.value = null
      loadFailed.value = true
    }
  } finally {
    if (requestId === captchaRequestId) loading.value = false
  }
}

function handleRefresh(): void {
  if (!canRefresh.value) return
  emit('refresh')
  void fetchCaptcha()
}

function markKeyboardActive(): void {
  isKeyboardActive.value = true
  later(() => {
    isKeyboardActive.value = false
  }, KEYBOARD_ACTIVE_HOLD)
}

/** 没拖动就想提交时给一次「往右」的提示，而不是静默无反应 */
function nudge(): void {
  if (isNudging.value) return
  isNudging.value = true
  later(() => {
    isNudging.value = false
  }, 320)
}

function handlePointerDown(event: PointerEvent): void {
  if (!isInteractive.value) return

  dragging = true
  isDragging.value = true
  pointerOrigin = event.clientX - rawX
  lastAriaSync = 0
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  event.preventDefault()
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragging) return
  rawX = clamp(event.clientX - pointerOrigin, 0, maxSlide.value)
  frame.schedule(flushX)

  // aria 值节流同步：拖拽期不做字符串拼接，也不让读屏整段播报
  const now = event.timeStamp
  if (now - lastAriaSync >= ARIA_SYNC_INTERVAL) {
    lastAriaSync = now
    sliderX.value = rawX
  }
  event.preventDefault()
}

function releasePointer(event: PointerEvent): void {
  if (
    event.currentTarget instanceof HTMLElement &&
    event.currentTarget.hasPointerCapture?.(event.pointerId)
  ) {
    event.currentTarget.releasePointerCapture(event.pointerId)
  }
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragging) return
  dragging = false
  isDragging.value = false
  releasePointer(event)
  frame.cancel()
  setSliderX(rawX)
  verifySlider()
}

function handlePointerCancel(event: PointerEvent): void {
  if (!dragging) return
  dragging = false
  isDragging.value = false
  releasePointer(event)
  frame.cancel()
  setSliderX(rawX)
}

function handleSliderKeydown(event: KeyboardEvent): void {
  if (!isInteractive.value) return

  const step = Math.max(Math.round(maxSlide.value / 20), 1)
  let handled = true

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      setSliderX(rawX + step)
      markKeyboardActive()
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      setSliderX(rawX - step)
      markKeyboardActive()
      break
    case 'Home':
      setSliderX(0)
      markKeyboardActive()
      break
    case 'End':
      setSliderX(maxSlide.value)
      markKeyboardActive()
      break
    case 'Enter':
    case ' ':
      verifySlider()
      break
    default:
      handled = false
  }

  if (handled) event.preventDefault()
}

function verifySlider(): void {
  const data = captchaData.value
  if (!data || !isInteractive.value) return
  if (rawX <= 0) {
    nudge()
    return
  }

  const result: CaptchaResult = {
    token: data.token,
    x: Math.round(rawX / (metrics.scale || 1)),
    y: data.thumbY,
  }

  lastResult.value = result
  state.toVerifying()
  emit('confirm', result)
}

function handleSettleEnd(): void {
  if (status.value !== 'success') return
  emit('settled')
}

function reset(): void {
  void fetchCaptcha()
}

function success(): void {
  clearLocalTimers()
  dragging = false
  isDragging.value = false
  state.toSuccess()
  if (lastResult.value) emit('success', lastResult.value)
}

/**
 * 失败：两拍。
 * 第一拍 recoil 原地被弹回一下（拒绝的动作），第二拍才沿路径撤回（被退回来的过程）。
 * 减动效下直接归零，不播任何一拍。
 */
function fail(): void {
  clearLocalTimers()
  dragging = false
  isDragging.value = false
  emit('fail')
  state.toFail()

  isRecoiling.value = true
  later(() => {
    isRecoiling.value = false
  }, CAPTCHA_RECOIL_DURATION)

  later(() => {
    if (status.value !== 'fail') return
    isReturning.value = true
    void nextTick(() => {
      requestAnimationFrame(() => {
        if (status.value !== 'fail') return
        setSliderX(0)
      })
    })
    later(() => {
      isReturning.value = false
    }, RETURN_DURATION + 80)
  }, CAPTCHA_RECOIL_DURATION)
}

onMounted(() => {
  measure()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure)
    if (rootRef.value) resizeObserver.observe(rootRef.value)
  }

  if (props.visible) void fetchCaptcha()
})

onBeforeUnmount(() => {
  captchaRequestId += 1
  resizeObserver?.disconnect()
  clearLocalTimers()
})

watch(
  () => props.visible,
  (visible) => {
    if (visible) void fetchCaptcha()
  }
)

defineExpose({
  reset,
  refresh: handleRefresh,
  success,
  fail,
})
</script>

<template>
  <div ref="rootRef" class="slide-captcha cap-scope" :style="stageStyle">
    <div class="slide-captcha__stage cap-stage cap-rise" :class="stageClass">
      <Transition name="cap-media" mode="out-in">
        <div v-if="loading" key="loading" class="slide-captcha__skeleton" aria-hidden="true">
          <div class="skeleton-shimmer slide-captcha__skeleton-bed"></div>
          <div class="skeleton-shimmer slide-captcha__skeleton-notch"></div>
        </div>

        <div v-else-if="loadFailed" key="error" class="slide-captcha__fallback">
          <p class="slide-captcha__fallback-text">验证码没加载出来</p>
          <button type="button" class="slide-captcha__fallback-action" @click="handleRefresh">
            重新加载
          </button>
        </div>

        <div
          v-else-if="captchaData"
          key="media"
          class="slide-captcha__media"
          :class="{ 'slide-captcha__media--locked': status === 'verifying' }"
        >
          <img
            ref="masterRef"
            :src="captchaData.masterImage"
            class="slide-captcha__master"
            alt="滑块验证码底图"
            draggable="false"
            @load="handleMasterLoad"
          />

          <div
            class="slide-captcha__tile"
            :class="{
              'slide-captcha__tile--dragging': isDragging,
              'slide-captcha__tile--returning': isReturning,
            }"
            aria-hidden="true"
          >
            <!-- 收尾信号取「拼图坐进缺口」这一下：它是整段成功动画里最后结束、
                 也最该被看完的一帧，弹层据此关窗 -->
            <img
              :src="captchaData.tileImage"
              class="slide-captcha__tile-img"
              :class="{
                'slide-captcha__tile-img--seated': status === 'success',
                'slide-captcha__tile-img--dimmed': status === 'fail',
              }"
              alt=""
              draggable="false"
              @animationend="handleSettleEnd"
            />
          </div>
        </div>
      </Transition>

      <Transition name="cap-veil">
        <div v-if="status === 'verifying'" class="cap-veil" aria-hidden="true">
          <span class="cap-scan"></span>
        </div>
      </Transition>

      <div
        v-if="status === 'success' || status === 'fail'"
        class="cap-badge"
        :class="{ 'cap-badge--fail': status === 'fail' }"
        aria-hidden="true"
      >
        <svg class="cap-badge__mark" viewBox="0 0 24 24">
          <path v-if="status === 'success'" d="m5.5 12.4 4.4 4.4 8.6-9.2" />
          <path v-else d="M8 8l8 8M16 8l-8 8" />
        </svg>
      </div>

      <button
        type="button"
        class="slide-captcha__refresh cap-iconbtn"
        :disabled="!canRefresh"
        aria-label="换一张验证码"
        @click="handleRefresh"
      >
        <RefreshCw class="slide-captcha__refresh-icon" />
      </button>
    </div>

    <div
      class="slide-captcha__track cap-rise cap-rise--late"
      :class="{
        'slide-captcha__track--active': isActiveInput,
        'slide-captcha__track--dragging': isDragging,
        'slide-captcha__track--verifying': status === 'verifying',
        'slide-captcha__track--success': status === 'success',
        'slide-captcha__track--fail': status === 'fail',
      }"
    >
      <div class="slide-captcha__fill" aria-hidden="true"></div>

      <!-- 播报区常驻：live region 必须先在 DOM 里，读屏才会播报后来的内容变化 -->
      <div
        class="slide-captcha__tip"
        :class="{ 'slide-captcha__tip--muted': isActiveInput }"
        role="status"
        :aria-live="status === 'fail' ? 'assertive' : 'polite'"
      >
        <Transition name="cap-tip" mode="out-in">
          <span :key="status" class="slide-captcha__tip-text" :class="`cap-ink--${status}`">
            {{ tipText }}
          </span>
        </Transition>
      </div>

      <div
        ref="sliderRef"
        class="slide-captcha__slider"
        :class="{
          'slide-captcha__slider--dragging': isDragging,
          'slide-captcha__slider--returning': isReturning,
        }"
        role="slider"
        :tabindex="isInteractive ? 0 : -1"
        aria-label="向右拖动滑块完成验证"
        aria-valuemin="0"
        :aria-valuemax="Math.round(maxSlide)"
        :aria-valuenow="Math.round(sliderX)"
        :aria-valuetext="isDragging ? undefined : `${progressPercentage}% · ${tipText}`"
        :aria-disabled="!isInteractive"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
        @keydown="handleSliderKeydown"
      >
        <span
          class="slide-captcha__handle"
          :class="{
            'slide-captcha__handle--dragging': isDragging,
            'slide-captcha__handle--verifying': status === 'verifying',
            'slide-captcha__handle--success': status === 'success',
            'slide-captcha__handle--fail': status === 'fail',
            'slide-captcha__handle--recoil': isRecoiling,
            'slide-captcha__handle--nudge': isNudging,
          }"
        >
          <svg class="slide-captcha__handle-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              v-if="status === 'verifying'"
              class="slide-captcha__handle-spinner motion-spin"
              cx="12"
              cy="12"
              r="8"
            />
            <path
              v-else-if="status === 'success'"
              class="slide-captcha__handle-mark"
              d="m7 12.5 3.25 3.25L17.5 8.5"
            />
            <path
              v-else-if="status === 'fail'"
              class="slide-captcha__handle-mark"
              d="M8.5 8.5l7 7M15.5 8.5l-7 7"
            />
            <path v-else d="M6.5 12h11m-4-4 4 4-4 4" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use './captcha-kit';

.slide-captcha {
  /* 拖拽热路径只改前两个变量，组件本身不参与 patch */
  --sc-x: 0;
  --sc-fill: 0;
  --sc-scale: 1;
  --sc-tile-y: 0;

  width: 100%;
  max-width: 20rem;
  user-select: none;

  &__stage {
    min-height: var(--sc-stage-min, 10rem);
    margin-bottom: 0.75rem;
  }

  &__skeleton {
    position: relative;
    min-height: var(--sc-stage-min, 10rem);
  }

  &__skeleton-bed {
    position: absolute;
    inset: 0;
    border-radius: 0;
  }

  /* 骨架不是一块灰板：它预告了「图上有个缺口」这件事 */
  &__skeleton-notch {
    position: absolute;
    top: 32%;
    left: 46%;
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 0.5rem;
    opacity: 0.55;
  }

  &__fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: var(--sc-stage-min, 10rem);
    gap: 0.5rem;
    padding: 1rem;
  }

  &__fallback-text {
    color: var(--cap-text-muted);
    font-size: 0.8125rem;
  }

  &__fallback-action {
    color: var(--cap-primary);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity var(--cap-fast) linear;

    &:hover {
      opacity: 0.78;
    }
  }

  &__media {
    position: relative;
    transition: filter var(--cap-normal) linear;

    /* 核验中：整图降饱和 = 「已锁定，正在核验」，与扫描光带同时起效 */
    &--locked {
      filter: saturate(0.72);
    }
  }

  &__master {
    display: block;
    width: 100%;
    height: auto;
  }

  &__tile {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    pointer-events: none;
    transform: translate3d(var(--sc-x), 0, 0);
    transition: transform var(--cap-fast) var(--cap-expo);

    &--dragging {
      transition: none;
      will-change: transform;
    }

    /* 失败第二拍：沿原路撤回，单向缓出、无过冲 */
    &--returning {
      transition: transform var(--cap-slow) var(--cap-quint);
    }
  }

  &__tile-img {
    display: block;
    transform: translate3d(0, var(--sc-tile-y), 0) scale(var(--sc-scale));
    transform-origin: left top;
    filter: drop-shadow(0 2px 6px color-mix(in oklch, var(--cap-text) 30%, transparent)) saturate(1);
    transition: filter var(--cap-normal) linear;

    /* 成功：阴影收拢 + 一记极轻的下沉，读作「这块终于坐进去了」 */
    &--seated {
      animation: sc-seat var(--cap-slow) var(--cap-quint) both;
    }

    /* 失败回撤途中失效感。filter 函数序列与基态一致，否则无法插值 */
    &--dimmed {
      filter: drop-shadow(0 1px 3px color-mix(in oklch, var(--cap-text) 20%, transparent))
        saturate(0.5);
    }
  }

  &__refresh {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 6;
  }

  &__refresh-icon {
    width: 0.95rem;
    height: 0.95rem;
    transition: transform var(--cap-normal) var(--cap-quint);
  }

  &__refresh:hover:not(:disabled) &__refresh-icon {
    transform: rotate(-90deg);
  }

  &__track {
    position: relative;
    height: 2.75rem;
    overflow: hidden;
    background-color: var(--cap-sunken);
    border: 1px solid var(--cap-border);
    border-radius: var(--cap-radius);
    transition:
      background-color var(--cap-normal) var(--cap-out),
      border-color var(--cap-normal) var(--cap-out);

    &--active,
    &--verifying {
      border-color: color-mix(in oklch, var(--cap-primary) 62%, var(--cap-border));
    }

    &--success {
      background-color: color-mix(in oklch, var(--status-success-soft) 70%, var(--cap-surface));
      border-color: var(--cap-success-border);
    }

    &--fail {
      background-color: color-mix(in oklch, var(--status-danger-soft) 70%, var(--cap-surface));
      border-color: var(--cap-danger-border);
    }
  }

  &__fill {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: linear-gradient(
      90deg,
      color-mix(in oklch, var(--cap-primary) 10%, transparent),
      color-mix(in oklch, var(--cap-primary) 22%, transparent)
    );
    transform: scaleX(var(--sc-fill));
    transform-origin: left center;
    transition: transform var(--cap-fast) var(--cap-expo);
  }

  /* 只有指针拖拽才关掉过渡（完全跟手）；键盘步进保留 140ms，看得清是走了一步 */
  &__track--dragging &__fill {
    transition: none;
    will-change: transform;
  }

  &__track--fail &__fill {
    background-image: linear-gradient(
      90deg,
      color-mix(in oklch, var(--cap-danger) 10%, transparent),
      color-mix(in oklch, var(--cap-danger) 20%, transparent)
    );
    transition: transform var(--cap-slow) var(--cap-quint);
  }

  &__track--success &__fill {
    background-image: linear-gradient(
      90deg,
      color-mix(in oklch, var(--cap-success) 12%, transparent),
      color-mix(in oklch, var(--cap-success) 22%, transparent)
    );
  }

  &__tip {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: calc(100% - 4.5rem);
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition: opacity var(--cap-fast) var(--cap-out);

    /* 手里正忙的时候，提示语让位 */
    &--muted {
      opacity: 0.4;
    }
  }

  &__tip-text {
    display: block;
    overflow: hidden;
    font-size: 0.8125rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__slider {
    position: absolute;
    top: -1px;
    left: -1px;
    z-index: 3;
    width: 2.75rem;
    height: 2.75rem;
    touch-action: none;
    outline: none;
    transform: translate3d(var(--sc-x), 0, 0);
    transition: transform var(--cap-fast) var(--cap-expo);

    &--dragging {
      transition: none;
      will-change: transform;
    }

    &--returning {
      transition: transform var(--cap-slow) var(--cap-quint);
    }
  }

  /* 焦点环画在手柄内侧：轨道是 overflow:hidden，外扩 outline 会被裁掉一半。
     颜色仍是全站统一的 --color-ring，只是 offset 取负。 */
  &__slider:focus-visible &__handle {
    outline: 2px solid var(--color-ring, var(--brand-blue));
    outline-offset: -3px;
  }

  &__handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--cap-primary);
    cursor: grab;
    background-color: var(--cap-surface);
    border: 1px solid color-mix(in oklch, var(--cap-border) 70%, var(--cap-text));
    border-radius: var(--cap-radius);
    box-shadow: var(--shadow-surface-value);
    transition:
      color var(--cap-fast) var(--cap-out),
      background-color var(--cap-fast) var(--cap-out),
      border-color var(--cap-fast) var(--cap-out),
      transform var(--cap-fast) var(--cap-quint);

    &:hover {
      color: var(--cap-on-signal);
      background-color: var(--cap-primary);
      border-color: var(--cap-primary);
    }

    &--dragging {
      color: var(--cap-on-signal);
      cursor: grabbing;
      background-color: var(--cap-primary);
      border-color: var(--cap-primary);
      box-shadow: var(--shadow-raised-value);
    }

    &--verifying {
      color: var(--cap-on-signal);
      cursor: wait;
      background-color: var(--cap-primary);
      border-color: var(--cap-primary);
    }

    &--success {
      color: var(--cap-on-signal);
      cursor: default;
      background-color: var(--cap-success);
      border-color: var(--cap-success);
    }

    &--fail {
      color: var(--cap-on-signal);
      cursor: default;
      background-color: var(--cap-danger);
      border-color: var(--cap-danger);
    }

    /* 失败第一拍：原地被弹回一下，只作用在手柄本体，不动轨道 */
    &--recoil {
      animation: cap-recoil var(--cap-fast) var(--cap-out);
    }

    /* 一步没动就提交：提示往右推，而不是静默无反应 */
    &--nudge {
      animation: sc-nudge var(--cap-normal) var(--cap-quint);
    }
  }

  &__handle-icon {
    width: 1.5rem;
    height: 1.5rem;
    overflow: visible;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  &__handle-mark {
    stroke-dasharray: 26;
    stroke-dashoffset: 26;
    animation: cap-draw var(--cap-normal) var(--cap-out) forwards;
  }

  &__handle-spinner {
    stroke-dasharray: 34 18;
    transform-origin: center;
    animation: cap-spin var(--cap-spin) linear infinite;
  }
}

/* 成功：阴影收拢 + 一记 0.8% 的下沉再回位。只动 transform / filter。 */
@keyframes sc-seat {
  0% {
    filter: drop-shadow(0 2px 6px color-mix(in oklch, var(--cap-text) 30%, transparent))
      brightness(1);
    transform: translate3d(0, var(--sc-tile-y), 0) scale(var(--sc-scale));
  }

  46% {
    filter: drop-shadow(0 0 0 transparent) brightness(1.06);
    transform: translate3d(0, var(--sc-tile-y), 0) scale(calc(var(--sc-scale) * 0.992));
  }

  100% {
    filter: drop-shadow(0 0 0 transparent) brightness(1);
    transform: translate3d(0, var(--sc-tile-y), 0) scale(var(--sc-scale));
  }
}

@keyframes sc-nudge {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  45% {
    transform: translate3d(7px, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-captcha__tile,
  .slide-captcha__tile-img,
  .slide-captcha__slider,
  .slide-captcha__fill,
  .slide-captcha__tip {
    transition: none;
  }

  .slide-captcha__tile-img--seated,
  .slide-captcha__handle--recoil,
  .slide-captcha__handle--nudge {
    animation: none;
  }

  /* 判定结果本身保留（是状态不是装饰），只是不再演出来 */
  .slide-captcha__tile-img--seated {
    filter: drop-shadow(0 0 0 transparent) saturate(1);
  }

  .slide-captcha__handle-mark {
    stroke-dashoffset: 0;
    animation: none;
  }
}
</style>
