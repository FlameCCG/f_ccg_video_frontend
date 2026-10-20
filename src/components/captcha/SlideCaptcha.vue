<script setup lang="ts">
/** 与管理端使用相同的滑块交互和判定动效。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'

import { getSlideCaptcha, type CaptchaScene, type SlideCaptcha } from '@/api/captcha'

interface Props {
  /** 是否显示验证码 */
  visible?: boolean
  scene?: CaptchaScene
  autoRetry?: boolean
}

interface CaptchaResult {
  /** 验证码 Token */
  token: string
  /** 滑块 X 坐标 */
  x: number
  /** 滑块 Y 坐标 */
  y: number
}

type VerifyStatus = 'idle' | 'verifying' | 'success' | 'fail'

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  scene: 'register',
  autoRetry: true,
})

const emit = defineEmits<{
  /** 验证成功 */
  success: [result: CaptchaResult]
  /** 确认验证（用户释放滑块） */
  confirm: [result: CaptchaResult]
  /** 验证失败 */
  fail: []
  /** 刷新验证码 */
  refresh: []
  /** 成功画面已完成，可以开始弹层离场 */
  settled: []
  retry: []
}>()

const DEFAULT_SLIDER_WIDTH = 44
const FAILURE_RESET_DELAY = 1100
const RECOIL_DURATION = 200
const ARIA_SYNC_INTERVAL = 150
const SUCCESS_HOLD_DURATION = 280
const SUCCESS_FALLBACK_DURATION = 1400

const captchaData = ref<SlideCaptcha | null>(null)
const loading = ref(false)
const failMessage = ref('')
const isDragging = ref(false)
const isReturning = ref(false)
const imageHeight = ref(160)
const sliderX = ref(0)
const scale = ref(1)
const verifyStatus = ref<VerifyStatus>('idle')
const containerWidth = ref(280)
const sliderWidth = ref(DEFAULT_SLIDER_WIDTH)
const lastResult = ref<CaptchaResult | null>(null)
const masterImageReady = ref(false)
const tileImageReady = ref(false)
const imageFailed = ref(false)

const containerRef = ref<HTMLDivElement | null>(null)
const sliderRef = ref<HTMLDivElement | null>(null)
const masterImageRef = ref<HTMLImageElement | null>(null)

let resizeObserver: ResizeObserver | undefined
let failureResetTimer: ReturnType<typeof setTimeout> | undefined
let returnTimer: ReturnType<typeof setTimeout> | undefined
let settleTimer: ReturnType<typeof setTimeout> | undefined
let settleArmed = false
let captchaRequestId = 0
let rawX = 0
let pointerOrigin = 0
let pointerScale = 1
let activePointerId: number | null = null
let dragFrame = 0
let lastAriaSync = 0

const maxSlideDistance = computed(() => Math.max(containerWidth.value - sliderWidth.value, 0))
const maxSlideDistanceRounded = computed(() => Math.round(maxSlideDistance.value))
const progressPercentage = computed(() => {
  if (maxSlideDistance.value <= 0) return 0
  return Math.round((sliderX.value / maxSlideDistance.value) * 100)
})
const showSuccessResult = computed(() => verifyStatus.value === 'success')
const imagesReady = computed(
  () => masterImageReady.value && tileImageReady.value && !imageFailed.value
)
const isPreparing = computed(
  () => loading.value || (Boolean(captchaData.value) && !imagesReady.value && !imageFailed.value)
)
const isInteractive = computed(
  () => props.visible && !isPreparing.value && imagesReady.value && verifyStatus.value === 'idle'
)
const canRefresh = computed(
  () => !loading.value && verifyStatus.value !== 'verifying' && verifyStatus.value !== 'success'
)
const tipText = computed(() => {
  switch (verifyStatus.value) {
    case 'verifying':
      return '正在核验安全凭证'
    case 'success':
      return '验证成功'
    case 'fail':
      return failMessage.value || '验证失败，请重试'
    default:
      return '请拖动滑块完成验证'
  }
})
const tileStyle = computed(() => ({
  transform: `translate3d(var(--captcha-x, 0px), ${(captchaData.value?.thumbY ?? 0) * scale.value}px, 0) scale(${scale.value})`,
  transformOrigin: 'left top',
}))

function clearFailureTimers(): void {
  if (failureResetTimer) clearTimeout(failureResetTimer)
  if (returnTimer) clearTimeout(returnTimer)
  failureResetTimer = undefined
  returnTimer = undefined
}

function clearSettleTimer(): void {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = undefined
  settleArmed = false
}

function handleSettled(): void {
  if (!settleArmed || verifyStatus.value !== 'success' || !props.visible) return
  clearSettleTimer()
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  settleTimer = setTimeout(
    () => {
      settleTimer = undefined
      if (props.visible && verifyStatus.value === 'success') emit('settled')
    },
    reducedMotion ? 0 : SUCCESS_HOLD_DURATION
  )
}

function flushPosition(): void {
  dragFrame = 0
  const root = containerRef.value
  if (!root) return
  root.style.setProperty('--captcha-x', `${rawX}px`)
  root.style.setProperty(
    '--captcha-fill',
    String(Math.min((rawX + sliderWidth.value) / (containerWidth.value || 1), 1))
  )
}

function cancelFrame(): void {
  if (dragFrame) cancelAnimationFrame(dragFrame)
  dragFrame = 0
}

function stopDragging(): void {
  const pointerId = activePointerId
  activePointerId = null
  isDragging.value = false
  cancelFrame()
  if (pointerId !== null && sliderRef.value?.hasPointerCapture?.(pointerId)) {
    sliderRef.value.releasePointerCapture(pointerId)
  }
}

function measureCaptcha(): void {
  if (containerRef.value) {
    // 使用布局尺寸，避免弹窗缩放入场时把视觉缩放误算进验证码坐标。
    containerWidth.value = containerRef.value.clientWidth || containerWidth.value
  }
  if (sliderRef.value) {
    sliderWidth.value = sliderRef.value.offsetWidth || DEFAULT_SLIDER_WIDTH
  }
  if (masterImageRef.value?.naturalWidth) {
    const image = masterImageRef.value
    if (image.clientWidth > 0) {
      scale.value = image.clientWidth / image.naturalWidth
      imageHeight.value = image.naturalHeight * scale.value
    }
  }
  moveSliderTo(rawX)
}

async function fetchCaptcha(): Promise<void> {
  if (!props.visible) return
  const requestId = ++captchaRequestId
  clearFailureTimers()
  clearSettleTimer()
  stopDragging()
  loading.value = true
  masterImageReady.value = false
  tileImageReady.value = false
  imageFailed.value = false
  verifyStatus.value = 'idle'
  failMessage.value = ''
  isReturning.value = false
  moveSliderTo(0)
  lastResult.value = null

  try {
    const data = await getSlideCaptcha(props.scene)
    if (requestId !== captchaRequestId) return
    captchaData.value = data
    await nextTick()
    measureCaptcha()
  } catch {
    if (requestId === captchaRequestId) captchaData.value = null
    // 错误已在 request 层归一化处理
  } finally {
    if (requestId === captchaRequestId) loading.value = false
  }
}

function handleRefresh(): void {
  if (!canRefresh.value) return
  clearFailureTimers()
  emit('refresh')
  if (props.autoRetry) void fetchCaptcha()
  else emit('retry')
}

function onImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth) return
  masterImageReady.value = true
  measureCaptcha()
}

function onImageError(): void {
  imageFailed.value = true
}

function moveSliderTo(position: number): void {
  cancelFrame()
  rawX = Math.max(0, Math.min(position, maxSlideDistance.value))
  sliderX.value = rawX
  flushPosition()
}

function handlePointerDown(event: PointerEvent): void {
  if (!isInteractive.value || isDragging.value || event.button !== 0 || event.isPrimary === false)
    return

  activePointerId = event.pointerId
  isDragging.value = true
  measureCaptcha()
  const root = containerRef.value
  pointerScale = root?.clientWidth ? root.getBoundingClientRect().width / root.clientWidth : 1
  pointerScale = pointerScale || 1
  pointerOrigin = event.clientX - rawX * pointerScale
  lastAriaSync = 0
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  event.preventDefault()
}

function handlePointerMove(event: PointerEvent): void {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  rawX = Math.max(
    0,
    Math.min((event.clientX - pointerOrigin) / pointerScale, maxSlideDistance.value)
  )
  if (!dragFrame) dragFrame = requestAnimationFrame(flushPosition)
  if (event.timeStamp - lastAriaSync >= ARIA_SYNC_INTERVAL) {
    lastAriaSync = event.timeStamp
    sliderX.value = rawX
  }
  event.preventDefault()
}

function handlePointerUp(event: PointerEvent): void {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  moveSliderTo((event.clientX - pointerOrigin) / pointerScale)
  stopDragging()
  verifySlider()
}

function handlePointerCancel(event: PointerEvent): void {
  if (!isDragging.value || event.pointerId !== activePointerId) return
  stopDragging()
  moveSliderTo(rawX)
}

function handleSliderKeydown(event: KeyboardEvent): void {
  if (!isInteractive.value || isDragging.value) return

  const step = event.shiftKey ? 1 : Math.max(Math.round(maxSlideDistance.value / 20), 1)
  let handled = true

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      moveSliderTo(sliderX.value + step)
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      moveSliderTo(sliderX.value - step)
      break
    case 'Home':
      moveSliderTo(0)
      break
    case 'End':
      moveSliderTo(maxSlideDistance.value)
      break
    case 'Enter':
    case ' ':
      if (sliderX.value > 0) verifySlider()
      break
    default:
      handled = false
  }

  if (handled) event.preventDefault()
}

function verifySlider(): void {
  if (!captchaData.value || !isInteractive.value || rawX <= 0) return

  const result: CaptchaResult = {
    token: captchaData.value.token,
    x: Math.round(sliderX.value / scale.value),
    y: captchaData.value.thumbY,
  }

  lastResult.value = result
  verifyStatus.value = 'verifying'
  emit('confirm', result)
}

function reset(): void {
  void fetchCaptcha()
}

onMounted(() => {
  measureCaptcha()

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measureCaptcha)
    if (containerRef.value) resizeObserver.observe(containerRef.value)
    if (sliderRef.value) resizeObserver.observe(sliderRef.value)
  }

  if (props.visible) void fetchCaptcha()
})

onBeforeUnmount(() => {
  captchaRequestId += 1
  stopDragging()
  resizeObserver?.disconnect()
  clearFailureTimers()
  clearSettleTimer()
})

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void fetchCaptcha()
      return
    }
    captchaRequestId += 1
    stopDragging()
    clearFailureTimers()
    clearSettleTimer()
  }
)

defineExpose({
  reset,
  refresh: handleRefresh,
  success: () => {
    if (!props.visible || verifyStatus.value !== 'verifying') return
    clearFailureTimers()
    clearSettleTimer()
    stopDragging()
    verifyStatus.value = 'success'
    settleArmed = true
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // animationend 正常收尾，减动效或动画被打断时由定时器兜底。
    settleTimer = setTimeout(handleSettled, reducedMotion ? 160 : SUCCESS_FALLBACK_DURATION)
    if (lastResult.value) emit('success', lastResult.value)
  },
  fail: (message?: string) => {
    failMessage.value = message || ''
    if (!props.visible) return
    clearFailureTimers()
    clearSettleTimer()
    verifyStatus.value = 'fail'
    stopDragging()
    emit('fail')

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      moveSliderTo(0)
    } else {
      returnTimer = setTimeout(() => {
        isReturning.value = true
        void nextTick(() => {
          if (verifyStatus.value === 'fail') moveSliderTo(0)
        })
      }, RECOIL_DURATION)
    }

    failureResetTimer = setTimeout(() => {
      if (!props.visible) return
      if (props.autoRetry) void fetchCaptcha()
      else emit('retry')
    }, FAILURE_RESET_DELAY)
  },
})
</script>

<template>
  <div
    ref="containerRef"
    class="slide-captcha"
    :class="{
      'slide-captcha--returning': isReturning,
      'slide-captcha--ready': imagesReady && !loading,
      'slide-captcha--success': showSuccessResult,
      'slide-captcha--dragging': isDragging,
    }"
    :style="{ '--captcha-image-height': `${imageHeight}px` }"
    :aria-busy="isPreparing || verifyStatus === 'verifying'"
  >
    <div
      class="slide-captcha__image-wrapper"
      :class="{
        'slide-captcha__image-wrapper--dragging': isDragging,
      }"
    >
      <div class="slide-captcha__loading-shell">
        <div v-if="isPreparing" class="slide-captcha__loading" role="status" aria-label="加载中">
          <Loader2 class="h-6 w-6 animate-spin" />
        </div>
        <div class="slide-captcha__image-container">
          <div class="slide-captcha__scene">
            <img
              v-if="captchaData?.masterImage"
              :key="`master-${captchaData.token}`"
              ref="masterImageRef"
              :src="captchaData.masterImage"
              class="slide-captcha__master-image"
              alt="安全验证"
              draggable="false"
              @load="onImageLoad"
              @error="onImageError"
            />

            <img
              v-if="captchaData?.tileImage"
              :key="`tile-${captchaData.token}`"
              :src="captchaData.tileImage"
              class="slide-captcha__tile-image"
              :class="{ 'slide-captcha__tile-image--dragging': isDragging }"
              :style="tileStyle"
              alt=""
              draggable="false"
              @load="tileImageReady = true"
              @error="onImageError"
            />
          </div>

          <div v-if="(!captchaData || imageFailed) && !loading" class="slide-captcha__placeholder">
            <button
              type="button"
              class="slide-captcha__retry"
              :disabled="!canRefresh"
              @click="handleRefresh"
            >
              {{ '刷新验证码' }}
            </button>
          </div>

          <Transition name="captcha-result">
            <div v-if="verifyStatus === 'verifying'" class="slide-captcha__scan" aria-hidden="true">
              <div class="slide-captcha__result-scan" />
            </div>
          </Transition>

          <Transition name="captcha-result">
            <div
              v-if="showSuccessResult"
              class="slide-captcha__result slide-captcha__result--success"
              role="status"
              aria-live="polite"
            >
              <div class="slide-captcha__result-halo" aria-hidden="true" />
              <div class="slide-captcha__result-orbit" aria-hidden="true" />
              <svg class="slide-captcha__result-mark" viewBox="0 0 64 64" aria-hidden="true">
                <circle class="slide-captcha__result-disc" cx="32" cy="32" r="29" />
                <circle class="slide-captcha__result-ring" cx="32" cy="32" r="25" />
                <path
                  class="slide-captcha__result-symbol slide-captcha__result-symbol--check"
                  d="M20 33.5 28.5 42 45 23.5"
                />
              </svg>
              <span class="slide-captcha__result-text">
                {{ tipText }}
              </span>
              <span class="slide-captcha__result-caption" @animationend.self="handleSettled">
                {{ '安全校验完成，可以继续' }}
              </span>
            </div>
          </Transition>
        </div>
      </div>

      <button
        type="button"
        class="slide-captcha__refresh-btn"
        :disabled="!canRefresh"
        @click="handleRefresh"
      >
        <RefreshCw class="h-4 w-4" aria-hidden="true" />
        <span class="sr-only">{{ '刷新验证码' }}</span>
      </button>
    </div>

    <div
      class="slide-captcha__track"
      :class="{
        'slide-captcha__track--dragging': isDragging,
        'slide-captcha__track--verifying': verifyStatus === 'verifying',
        'slide-captcha__track--success': verifyStatus === 'success',
        'slide-captcha__track--fail': verifyStatus === 'fail',
      }"
    >
      <div class="slide-captcha__track-fill" aria-hidden="true" />
      <div class="slide-captcha__track-shimmer" aria-hidden="true" />

      <Transition name="captcha-tip" mode="out-in">
        <span
          :key="verifyStatus"
          class="slide-captcha__tip"
          :class="`slide-captcha__tip--${verifyStatus}`"
          :role="verifyStatus === 'fail' ? 'alert' : undefined"
          :aria-live="verifyStatus === 'fail' ? 'assertive' : undefined"
        >
          {{ tipText }}
        </span>
      </Transition>

      <div
        ref="sliderRef"
        class="slide-captcha__slider"
        :class="{
          'slide-captcha__slider--dragging': isDragging,
          'slide-captcha__slider--verifying': verifyStatus === 'verifying',
          'slide-captcha__slider--success': verifyStatus === 'success',
          'slide-captcha__slider--fail': verifyStatus === 'fail',
        }"
        role="slider"
        :tabindex="isInteractive ? 0 : -1"
        aria-label="请拖动滑块完成验证"
        aria-valuemin="0"
        :aria-valuemax="maxSlideDistanceRounded"
        :aria-valuenow="Math.round(sliderX)"
        :aria-valuetext="`${progressPercentage}% · ${tipText}`"
        :aria-disabled="!isInteractive"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
        @lostpointercapture="handlePointerCancel"
        @keydown="handleSliderKeydown"
      >
        <svg class="slide-captcha__slider-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            v-if="verifyStatus === 'verifying'"
            class="slide-captcha__slider-spinner"
            cx="12"
            cy="12"
            r="8"
          />
          <path
            v-else-if="verifyStatus === 'success'"
            class="slide-captcha__slider-check"
            d="m7 12.5 3.25 3.25L17.5 8.5"
          />
          <path v-else class="slide-captcha__slider-arrow" d="M6.5 12h11m-4-4 4 4-4 4" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.slide-captcha {
  --captcha-slider-size: calc(40px + 4px);
  --captcha-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --captcha-spring: cubic-bezier(0.2, 1.35, 0.4, 1);

  width: 100%;
  user-select: none;

  &__image-wrapper {
    position: relative;
    margin-bottom: 16px;
    animation: captcha-stage-enter 560ms 90ms var(--captcha-ease) both;
  }

  &__image-container {
    position: relative;
    width: 100%;
    min-height: var(--captcha-image-height);
    overflow: hidden;
    isolation: isolate;
    background-color: var(--bg-surface-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-xl);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bg-surface-1) 12%, transparent);
    transform: translateZ(0);
    transition:
      border-color 200ms cubic-bezier(0.25, 1, 0.5, 1),
      box-shadow 200ms cubic-bezier(0.25, 1, 0.5, 1),
      transform 320ms var(--captcha-ease);
  }

  &__image-wrapper--dragging &__image-container {
    border-color: color-mix(in srgb, var(--brand-blue) 62%, var(--border-color));
    box-shadow: var(--shadow-raised-value);
    transform: translateY(-2px);
  }

  &__scene {
    position: relative;
    opacity: 0;
    transform: scale(1.045);
    transition:
      opacity 360ms ease,
      transform 680ms var(--captcha-ease);
  }

  &--ready &__scene {
    opacity: 1;
    transform: scale(1);
  }

  &--dragging &__scene {
    transform: scale(1);
    transition: none;
  }

  &--success &__scene {
    opacity: 0.12;
    transform: scale(1.06);
    transition:
      opacity 500ms 100ms ease,
      transform 900ms var(--captcha-ease);
  }

  &__master-image {
    display: block;
    width: 100%;
    height: auto;
  }

  &__tile-image {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(0 4px 8px color-mix(in srgb, var(--text-1) 28%, transparent));
    transition: transform 100ms cubic-bezier(0.16, 1, 0.3, 1);

    &--dragging {
      will-change: transform;
      transition: none;
    }
  }

  &__placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: calc(80px * 2);
    color: var(--text-2);
    font-size: var(--text-sm);
  }

  &__loading-shell {
    position: relative;
  }

  &__loading {
    position: absolute;
    inset: 0;
    z-index: 11;
    display: grid;
    place-items: center;
    color: var(--brand-blue);
    background: var(--bg-surface-2);
    border-radius: var(--radius-xl);
  }

  &__retry {
    padding: 8px 16px;
    cursor: pointer;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
  }

  &__refresh-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 12;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    cursor: pointer;
    border: 0;
    border-radius: 50%;
    color: var(--bg-surface-1);
    background-color: color-mix(in srgb, var(--text-1) 52%, transparent);
    box-shadow: var(--shadow-surface-value);
    transition:
      background-color 100ms cubic-bezier(0.25, 1, 0.5, 1),
      opacity 100ms cubic-bezier(0.25, 1, 0.5, 1),
      transform 100ms cubic-bezier(0.25, 1, 0.5, 1);

    &:hover:not(:disabled) {
      background-color: color-mix(in srgb, var(--text-1) 72%, transparent);
      transform: rotate(18deg) scale(1.04);
    }

    &:active:not(:disabled) {
      transform: rotate(18deg) scale(0.94);
    }
  }

  &--success &__refresh-btn {
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
  }

  &__track {
    position: relative;
    height: var(--captcha-slider-size);
    overflow: hidden;
    background-color: var(--bg-surface-2);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-surface-1) 55%, transparent);
    animation: captcha-stage-enter 560ms 180ms var(--captcha-ease) both;
    transition:
      background-color 200ms cubic-bezier(0.25, 1, 0.5, 1),
      border-color 200ms cubic-bezier(0.25, 1, 0.5, 1),
      box-shadow 200ms cubic-bezier(0.25, 1, 0.5, 1);

    &--dragging,
    &--verifying {
      border-color: color-mix(in srgb, var(--brand-blue) 68%, var(--border-color));
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, var(--bg-surface-1) 55%, transparent),
        0 0 0 3px color-mix(in srgb, var(--brand-blue) 10%, transparent);
    }

    &--success {
      background-color: color-mix(in srgb, var(--status-success) 5%, var(--bg-surface-1));
      border-color: color-mix(in srgb, var(--status-success) 32%, var(--border-color));
    }

    &--fail {
      background-color: color-mix(in srgb, var(--status-danger-soft) 68%, var(--bg-surface-1));
      border-color: var(--status-danger);
      animation: captcha-error-recoil 200ms cubic-bezier(0.25, 1, 0.5, 1);
    }
  }

  &__track-fill {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--brand-blue) 10%, transparent),
      color-mix(in srgb, var(--brand-blue) 22%, transparent)
    );
    pointer-events: none;
    transform: scaleX(var(--captcha-fill, 0));
    transform-origin: left center;
    transition:
      background-color 200ms cubic-bezier(0.25, 1, 0.5, 1),
      transform 100ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  &__track--dragging &__track-fill {
    will-change: transform;
    transition: none;
  }

  &__track--success &__track-fill {
    background: color-mix(in srgb, var(--status-success) 9%, transparent);
    transform: scaleX(1);
    transition: transform 560ms var(--captcha-ease);
  }

  &__track--fail &__track-fill {
    background: color-mix(in srgb, var(--status-danger) 14%, transparent);
  }

  &__track-shimmer {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 25%,
      color-mix(in srgb, var(--brand-blue) 9%, transparent) 48%,
      transparent 70%
    );
    opacity: 0;
    transform: translateX(-100%);
    pointer-events: none;
  }

  &--ready:not(.slide-captcha--dragging, .slide-captcha--success) &__track-shimmer {
    animation: captcha-track-invitation 1800ms 600ms var(--captcha-ease) 2;
  }

  &__tip {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: calc(100% - 64px);
    overflow: hidden;
    color: var(--text-2);
    font-size: var(--text-sm);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition:
      color 200ms cubic-bezier(0.25, 1, 0.5, 1),
      opacity 100ms cubic-bezier(0.25, 1, 0.5, 1);

    &--verifying {
      color: var(--brand-blue);
    }

    &--success {
      color: var(--status-success);
      font-weight: 600;
    }

    &--fail {
      color: var(--status-danger);
    }
  }

  &__track--dragging &__tip {
    opacity: 0;
  }

  &__track--success &__tip {
    max-width: calc(100% - 16px);
  }

  &__slider {
    position: absolute;
    top: -1px;
    left: -1px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--captcha-slider-size);
    height: var(--captcha-slider-size);
    color: var(--brand-blue);
    touch-action: none;
    cursor: grab;
    background-color: var(--bg-surface-1);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-surface-value);
    transform: translate3d(var(--captcha-x, 0), 0, 0);
    transition:
      color 100ms cubic-bezier(0.25, 1, 0.5, 1),
      background-color 100ms cubic-bezier(0.25, 1, 0.5, 1),
      border-color 100ms cubic-bezier(0.25, 1, 0.5, 1),
      box-shadow 100ms cubic-bezier(0.25, 1, 0.5, 1),
      opacity 220ms ease,
      transform 100ms cubic-bezier(0.16, 1, 0.3, 1);

    &:hover:not([aria-disabled='true']) {
      color: var(--bg-surface-1);
      background-color: var(--brand-blue);
      border-color: var(--brand-blue);
      box-shadow: var(--shadow-raised-value);
    }

    &:active:not([aria-disabled='true']) {
      box-shadow: var(--shadow-surface-value);
    }

    &:focus-visible {
      outline: 2px solid var(--brand-blue);
      outline-offset: -3px;
    }

    &--dragging {
      color: var(--bg-surface-1);
      cursor: grabbing;
      background-color: var(--brand-blue);
      border-color: var(--brand-blue);
      box-shadow: var(--shadow-raised-value);
      will-change: transform;
      transition:
        color 100ms cubic-bezier(0.25, 1, 0.5, 1),
        background-color 100ms cubic-bezier(0.25, 1, 0.5, 1),
        border-color 100ms cubic-bezier(0.25, 1, 0.5, 1),
        box-shadow 100ms cubic-bezier(0.25, 1, 0.5, 1);
    }

    &--verifying {
      color: var(--bg-surface-1);
      cursor: wait;
      background-color: var(--brand-blue);
      border-color: var(--brand-blue);
    }

    &--success {
      color: var(--bg-surface-1);
      cursor: default;
      background-color: var(--status-success);
      border-color: var(--status-success);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--status-success) 14%, transparent);
      opacity: 0;
      pointer-events: none;
    }

    &--fail {
      color: var(--bg-surface-1);
      cursor: default;
      background-color: var(--status-danger);
      border-color: var(--status-danger);
    }
  }

  &__slider-icon {
    width: 24px;
    height: 24px;
    overflow: visible;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
    transition: transform 280ms var(--captcha-spring);
  }

  &__slider:hover &__slider-icon {
    transform: translateX(2px);
  }

  &__slider--dragging &__slider-icon {
    transform: translateX(2px) scale(0.88);
  }

  &--returning &__slider,
  &--returning &__tile-image,
  &--returning &__track-fill {
    transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  &__slider-arrow,
  &__slider-check {
    transition:
      opacity 100ms cubic-bezier(0.25, 1, 0.5, 1),
      transform 100ms cubic-bezier(0.25, 1, 0.5, 1);
  }

  &__slider-check {
    stroke-dasharray: 18;
    stroke-dashoffset: 18;
    animation: captcha-draw-symbol 300ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
  }

  &__slider-spinner {
    stroke-dasharray: 34 18;
    transform-origin: center;
    animation: captcha-spin 500ms linear infinite;
  }

  &__result {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 12px;
    background:
      radial-gradient(
        ellipse at 50% 40%,
        color-mix(in srgb, var(--status-success) 9%, transparent),
        transparent 72%
      ),
      color-mix(in srgb, var(--bg-surface-1) 94%, transparent);
    pointer-events: none;

    &--success {
      color: var(--status-success);
    }
  }

  &__result-halo,
  &__result-orbit {
    position: absolute;
    top: calc(50% - 28px);
    left: 50%;
    width: 112px;
    height: 112px;
    margin: -56px 0 0 -56px;
    border: 1px solid color-mix(in srgb, var(--status-success) 20%, transparent);
    border-radius: 50%;
    opacity: 0;
    animation: captcha-success-ripple 900ms 120ms var(--captcha-ease) both;
  }

  &__result-orbit {
    animation-delay: 260ms;
  }

  &__scan {
    position: absolute;
    inset: 0;
    z-index: 3;
    overflow: hidden;
    color: var(--brand-blue);
    pointer-events: none;
  }

  &__result-scan {
    position: absolute;
    inset: 0 auto 0 0;
    width: 28%;
    pointer-events: none;
    opacity: 0;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, currentcolor 22%, transparent),
      transparent
    );
  }

  &__scan &__result-scan {
    animation: captcha-security-scan calc(500ms * 2) cubic-bezier(0.25, 1, 0.5, 1) infinite;
  }

  &__result-mark {
    flex-shrink: 0;
    width: 64px;
    height: 64px;
    margin-bottom: 2px;
    overflow: visible;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: captcha-success-mark 620ms 80ms var(--captcha-spring) both;
  }

  &__result-disc {
    fill: color-mix(in srgb, var(--status-success) 10%, var(--bg-surface-1));
    stroke: none;
  }

  &__result-ring {
    opacity: 0.5;
    stroke-width: 1.5;
    stroke-dasharray: 158;
    stroke-dashoffset: 158;
    transform: rotate(-90deg);
    transform-origin: center;
    animation: captcha-draw-ring 560ms 160ms var(--captcha-ease) forwards;
  }

  &__result-symbol {
    stroke-width: 3;
    stroke-dasharray: 42;
    stroke-dashoffset: 42;
    animation: captcha-draw-symbol 360ms 300ms var(--captcha-ease) forwards;
  }

  &__result-text {
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: 0.025em;
    opacity: 0;
    transform: translateY(8px);
    animation: captcha-result-copy 420ms 300ms var(--captcha-ease) forwards;
  }

  &__result-caption {
    color: var(--text-2);
    font-size: var(--text-xs);
    line-height: 1.5;
    opacity: 0;
    transform: translateY(6px);
    animation: captcha-result-copy 360ms 520ms var(--captcha-ease) forwards;
  }
}

.captcha-result-enter-active {
  transition: opacity 420ms cubic-bezier(0.25, 1, 0.5, 1);
}

.captcha-result-leave-active {
  transition: opacity 100ms ease-in;
}

.captcha-result-enter-from {
  opacity: 0;
}

.captcha-result-leave-to {
  opacity: 0;
}

.captcha-tip-enter-active,
.captcha-tip-leave-active {
  transition:
    opacity 100ms cubic-bezier(0.25, 1, 0.5, 1),
    transform 100ms cubic-bezier(0.25, 1, 0.5, 1);
}

.captcha-tip-enter-from {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 4px));
}

.captcha-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% - 4px));
}

@keyframes captcha-stage-enter {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes captcha-track-invitation {
  0% {
    opacity: 0;
    transform: translateX(-100%);
  }

  25% {
    opacity: 1;
  }

  75%,
  100% {
    opacity: 0;
    transform: translateX(100%);
  }
}

@keyframes captcha-success-mark {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.66) rotate(-12deg);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(0);
  }
}

@keyframes captcha-success-ripple {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }

  30% {
    opacity: 0.6;
  }

  100% {
    opacity: 0;
    transform: scale(1.5);
  }
}

@keyframes captcha-security-scan {
  0% {
    opacity: 0;
    transform: translateX(-100%);
  }

  24% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(460%);
  }
}

@keyframes captcha-draw-ring {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes captcha-draw-symbol {
  to {
    stroke-dashoffset: 0;
  }
}

@keyframes captcha-result-copy {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes captcha-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes captcha-error-recoil {
  0%,
  100% {
    transform: translateX(0);
  }

  36% {
    transform: translateX(calc(4px * -0.75));
  }

  72% {
    transform: translateX(calc(4px * 0.4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-captcha {
    &__image-wrapper,
    &__master-image,
    &__track,
    &__slider-check,
    &__slider-spinner,
    &__result-mark,
    &__result-halo,
    &__result-orbit,
    &__result-ring,
    &__result-symbol,
    &__result-text,
    &__result-caption {
      animation: none;
    }

    &__track--fail {
      animation: none;
    }

    &__tile-image,
    &__slider,
    &__track-fill,
    &__scene,
    &__slider-icon,
    &__refresh-btn,
    &__image-container,
    &__result,
    &__tip {
      transition: none;
    }

    &__result-scan {
      display: none;
    }

    &__track-shimmer {
      display: none;
    }

    &__result-ring,
    &__result-symbol,
    &__slider-check {
      stroke-dashoffset: 0;
    }

    &--returning &__slider,
    &--returning &__tile-image,
    &--returning &__track-fill {
      transition: none;
    }

    &__result-text,
    &__result-caption {
      opacity: 1;
      transform: none;
    }

    &--ready &__scene,
    &--success &__scene,
    &__image-wrapper--dragging &__image-container {
      transform: none;
      transition: none;
    }

    &__track--success &__track-fill {
      transition: none;
    }
  }
}
</style>
