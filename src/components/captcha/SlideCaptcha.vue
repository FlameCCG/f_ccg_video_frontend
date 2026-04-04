<script setup lang="ts">
/**
 * 客户端滑块验证码（对齐管理端交互与状态机）
 * 拖拽释放后 emit confirm，由父组件请求后端校验，再调用 success()/fail()
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import { getSlideCaptcha, type SlideCaptcha } from '@/api/captcha'

interface Props {
  /** 是否显示/激活（用于弹层挂载时再拉码） */
  visible?: boolean
}

interface CaptchaResult {
  token: string
  x: number
  y: number
}

type VerifyStatus = 'idle' | 'verifying' | 'success' | 'fail'

const props = withDefaults(defineProps<Props>(), {
  visible: true,
})

const emit = defineEmits<{
  success: [result: CaptchaResult]
  confirm: [result: CaptchaResult]
  fail: []
  refresh: []
}>()

const DEFAULT_SLIDER_WIDTH = 44
const FAILURE_RESET_DELAY = 1100

const captchaData = ref<SlideCaptcha | null>(null)
const loading = ref(false)
const isDragging = ref(false)
const sliderX = ref(0)
const scale = ref(1)
const startX = ref(0)
const verifyStatus = ref<VerifyStatus>('idle')
const containerWidth = ref(280)
const sliderWidth = ref(DEFAULT_SLIDER_WIDTH)
const lastResult = ref<CaptchaResult | null>(null)

const containerRef = ref<HTMLDivElement | null>(null)
const sliderRef = ref<HTMLDivElement | null>(null)
const masterImageRef = ref<HTMLImageElement | null>(null)

let resizeObserver: ResizeObserver | undefined
let failureResetTimer: ReturnType<typeof setTimeout> | undefined
let captchaRequestId = 0

const maxSlideDistance = computed(() => Math.max(containerWidth.value - sliderWidth.value, 0))
const maxSlideDistanceRounded = computed(() => Math.round(maxSlideDistance.value))
const progressPercentage = computed(() => {
  if (maxSlideDistance.value <= 0) return 0
  return Math.round((sliderX.value / maxSlideDistance.value) * 100)
})
const fillScale = computed(() => {
  if (containerWidth.value <= 0) return 0
  return Math.min((sliderX.value + sliderWidth.value) / containerWidth.value, 1)
})
const showSuccessResult = computed(() => verifyStatus.value === 'success')
const isInteractive = computed(
  () => !loading.value && Boolean(captchaData.value) && verifyStatus.value === 'idle'
)
const tipText = computed(() => {
  switch (verifyStatus.value) {
    case 'verifying':
      return '正在核验安全凭证'
    case 'success':
      return '验证成功'
    case 'fail':
      return '验证失败，请重试'
    default:
      return '向右拖动滑块完成验证'
  }
})
const sliderStyle = computed(() => ({
  transform: `translate3d(${sliderX.value}px, 0, 0)`,
}))
const tileStyle = computed(() => ({
  transform: `translate3d(${sliderX.value}px, ${(captchaData.value?.thumbY ?? 0) * scale.value}px, 0) scale(${scale.value})`,
  transformOrigin: 'left top',
}))
const fillStyle = computed(() => ({
  transform: `scaleX(${fillScale.value})`,
}))

function clearFailureTimers(): void {
  if (failureResetTimer) clearTimeout(failureResetTimer)
  failureResetTimer = undefined
}

function measureCaptcha(): void {
  if (containerRef.value) {
    containerWidth.value = containerRef.value.getBoundingClientRect().width
  }
  if (sliderRef.value) {
    sliderWidth.value = sliderRef.value.getBoundingClientRect().width || DEFAULT_SLIDER_WIDTH
  }
  if (masterImageRef.value?.naturalWidth) {
    scale.value =
      masterImageRef.value.getBoundingClientRect().width / masterImageRef.value.naturalWidth
  }
  sliderX.value = Math.min(sliderX.value, maxSlideDistance.value)
}

async function fetchCaptcha(): Promise<void> {
  const requestId = ++captchaRequestId
  clearFailureTimers()
  loading.value = true
  verifyStatus.value = 'idle'
  isDragging.value = false
  sliderX.value = 0
  lastResult.value = null

  try {
    const data = await getSlideCaptcha()
    if (requestId !== captchaRequestId) return
    captchaData.value = data
    await nextTick()
    measureCaptcha()
  } catch {
    // 错误已在 request 层处理
  } finally {
    if (requestId === captchaRequestId) loading.value = false
  }
}

function handleRefresh(): void {
  emit('refresh')
  void fetchCaptcha()
}

function onImageLoad(event: Event): void {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth) return
  scale.value = image.getBoundingClientRect().width / image.naturalWidth
}

function moveSliderTo(position: number): void {
  sliderX.value = Math.max(0, Math.min(position, maxSlideDistance.value))
}

function handlePointerDown(event: PointerEvent): void {
  if (!isInteractive.value) return

  isDragging.value = true
  startX.value = event.clientX - sliderX.value
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  event.preventDefault()
}

function handlePointerMove(event: PointerEvent): void {
  if (!isDragging.value) return
  moveSliderTo(event.clientX - startX.value)
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
  if (!isDragging.value) return
  isDragging.value = false
  releasePointer(event)
  verifySlider()
}

function handlePointerCancel(event: PointerEvent): void {
  if (!isDragging.value) return
  isDragging.value = false
  releasePointer(event)
}

function handleSliderKeydown(event: KeyboardEvent): void {
  if (!isInteractive.value) return

  const step = Math.max(Math.round(maxSlideDistance.value / 20), 1)
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
  if (!captchaData.value || !isInteractive.value) return

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
  resizeObserver?.disconnect()
  clearFailureTimers()
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
  success: () => {
    clearFailureTimers()
    isDragging.value = false
    verifyStatus.value = 'success'
    if (lastResult.value) emit('success', lastResult.value)
  },
  fail: () => {
    clearFailureTimers()
    verifyStatus.value = 'fail'
    isDragging.value = false
    sliderX.value = 0
    emit('fail')

    failureResetTimer = setTimeout(() => {
      void fetchCaptcha()
    }, FAILURE_RESET_DELAY)
  },
})
</script>

<template>
  <div ref="containerRef" class="slide-captcha">
    <div
      class="slide-captcha__image-wrapper"
      :class="{
        'slide-captcha__image-wrapper--dragging': isDragging,
      }"
    >
      <div class="slide-captcha__image-container">
        <div v-if="loading" class="slide-captcha__loading">
          <Loader2 class="slide-captcha__loading-icon" />
          <span>加载中...</span>
        </div>

        <template v-else>
          <img
            v-if="captchaData?.masterImage"
            ref="masterImageRef"
            :src="captchaData.masterImage"
            class="slide-captcha__master-image"
            alt="滑块验证码"
            draggable="false"
            @load="onImageLoad"
          />

          <img
            v-if="captchaData?.tileImage"
            :src="captchaData.tileImage"
            class="slide-captcha__tile-image"
            :class="{ 'slide-captcha__tile-image--dragging': isDragging }"
            :style="tileStyle"
            alt=""
            draggable="false"
          />

          <div v-if="!captchaData" class="slide-captcha__placeholder">加载中...</div>
        </template>

        <Transition name="captcha-result">
          <div
            v-if="showSuccessResult"
            class="slide-captcha__result slide-captcha__result--success"
            role="status"
            aria-live="polite"
          >
            <div class="slide-captcha__result-scan" aria-hidden="true" />
            <svg class="slide-captcha__result-mark" viewBox="0 0 64 64" aria-hidden="true">
              <circle class="slide-captcha__result-ring" cx="32" cy="32" r="25" />
              <path
                class="slide-captcha__result-symbol slide-captcha__result-symbol--check"
                d="M20 33.5 28.5 42 45 23.5"
              />
            </svg>
            <span class="slide-captcha__result-text">{{ tipText }}</span>
          </div>
        </Transition>
      </div>

      <button
        type="button"
        class="slide-captcha__refresh-btn"
        :disabled="loading || verifyStatus === 'verifying' || verifyStatus === 'success'"
        aria-label="刷新验证码"
        @click="handleRefresh"
      >
        <RefreshCw class="slide-captcha__refresh-icon" />
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
      <div class="slide-captcha__track-fill" :style="fillStyle" />

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
        :style="sliderStyle"
        role="slider"
        :tabindex="isInteractive ? 0 : -1"
        aria-label="向右拖动滑块完成验证"
        aria-valuemin="0"
        :aria-valuemax="maxSlideDistanceRounded"
        :aria-valuenow="Math.round(sliderX)"
        :aria-valuetext="`${progressPercentage}% · ${tipText}`"
        :aria-disabled="!isInteractive"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerCancel"
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

<style scoped lang="scss">
.slide-captcha {
  --sc-slider-size: 2.75rem;
  --sc-primary: var(--color-primary);
  --sc-surface: var(--color-card);
  --sc-surface-hover: var(--color-muted);
  --sc-border: var(--color-border);
  --sc-border-strong: color-mix(in oklch, var(--color-border) 70%, var(--color-foreground));
  --sc-text: var(--color-foreground);
  --sc-text-muted: var(--color-muted-foreground);
  --sc-success: var(--status-success, oklch(64% 0.12 165deg));
  --sc-success-light: var(
    --status-success-soft,
    color-mix(in oklch, var(--sc-success) 18%, var(--sc-surface))
  );
  --sc-danger: var(--status-danger, var(--color-destructive));
  --sc-danger-light: color-mix(in oklch, var(--sc-danger) 16%, var(--sc-surface));
  --sc-radius: var(--radius-lg, 0.75rem);
  --sc-space-1: 0.25rem;
  --sc-space-2: 0.5rem;
  --sc-space-3: 0.75rem;
  --sc-space-6: 1.5rem;
  --sc-space-16: 4rem;
  --sc-duration-fast: var(--duration-fast, 140ms);
  --sc-duration-normal: var(--duration-normal, 240ms);
  --sc-duration-slow: var(--duration-slow, 420ms);
  --sc-easing-out: var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
  --sc-easing-expo: var(--ease-out-expo, cubic-bezier(0.16, 1, 0.3, 1));

  width: 100%;
  max-width: 20rem;
  user-select: none;

  &__image-wrapper {
    position: relative;
    margin-bottom: var(--sc-space-3);
    animation: captcha-stage-enter var(--sc-duration-slow) var(--sc-easing-expo) both;

    &--dragging .slide-captcha__image-container {
      border-color: color-mix(in oklch, var(--sc-primary) 62%, var(--sc-border));
      box-shadow: var(--shadow-raised, 0 4px 12px rgb(0 0 0 / 0.08));
      transform: translateZ(0) scale(1.004);
    }
  }

  &__image-container {
    position: relative;
    width: 100%;
    min-height: 10rem;
    overflow: hidden;
    isolation: isolate;
    background-color: var(--sc-surface-hover);
    border: 1px solid color-mix(in oklch, var(--sc-border) 80%, transparent);
    border-radius: var(--sc-radius);
    box-shadow: var(--shadow-surface, 0 1px 2px rgb(0 0 0 / 0.05));
    transform: translateZ(0);
    transition:
      border-color var(--sc-duration-normal) var(--sc-easing-out),
      box-shadow var(--sc-duration-normal) var(--sc-easing-out),
      transform var(--sc-duration-normal) var(--sc-easing-out);
  }

  &__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sc-space-2);
    min-height: 10rem;
    color: var(--sc-text-muted);
    font-size: 0.8125rem;

    &-icon {
      width: 1.75rem;
      height: 1.75rem;
      animation: captcha-spin 0.8s linear infinite;
    }
  }

  &__master-image {
    display: block;
    width: 100%;
    height: auto;
    animation: captcha-image-reveal var(--sc-duration-slow) var(--sc-easing-out) both;
  }

  &__tile-image {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    object-fit: contain;
    pointer-events: none;
    filter: drop-shadow(
      0 var(--sc-space-1) var(--sc-space-2) color-mix(in oklch, var(--sc-text) 28%, transparent)
    );
    transition: transform var(--sc-duration-fast) var(--sc-easing-expo);

    &--dragging {
      will-change: transform;
      transition: none;
    }
  }

  &__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 10rem;
    color: var(--sc-text-muted);
    font-size: 0.875rem;
  }

  &__refresh-btn {
    position: absolute;
    top: var(--sc-space-2);
    right: var(--sc-space-2);
    z-index: 12;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    color: var(--sc-surface);
    cursor: pointer;
    background-color: color-mix(in oklch, var(--sc-text) 52%, transparent);
    border: none;
    border-radius: 999px;
    box-shadow: var(--shadow-surface, 0 1px 2px rgb(0 0 0 / 0.08));
    transition:
      background-color var(--sc-duration-fast) var(--sc-easing-out),
      opacity var(--sc-duration-fast) var(--sc-easing-out),
      transform var(--sc-duration-fast) var(--sc-easing-out);

    &:hover:not(:disabled) {
      background-color: color-mix(in oklch, var(--sc-text) 72%, transparent);
      transform: rotate(18deg) scale(1.04);
    }

    &:active:not(:disabled) {
      transform: rotate(18deg) scale(0.94);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  &__refresh-icon {
    width: 0.95rem;
    height: 0.95rem;
  }

  &__track {
    position: relative;
    height: var(--sc-slider-size);
    overflow: hidden;
    background-color: var(--sc-surface-hover);
    border: 1px solid var(--sc-border);
    border-radius: var(--sc-radius);
    box-shadow: inset 0 1px 0 color-mix(in oklch, var(--sc-surface) 55%, transparent);
    animation: captcha-stage-enter var(--sc-duration-slow) var(--sc-duration-fast)
      var(--sc-easing-expo) both;
    transition:
      background-color var(--sc-duration-normal) var(--sc-easing-out),
      border-color var(--sc-duration-normal) var(--sc-easing-out),
      box-shadow var(--sc-duration-normal) var(--sc-easing-out);

    &--success {
      background-color: color-mix(in oklch, var(--sc-success-light) 68%, var(--sc-surface));
      border-color: var(--sc-success);

      .slide-captcha__track-fill {
        background: color-mix(in oklch, var(--sc-success) 16%, transparent);
      }
    }

    &--fail {
      background-color: color-mix(in oklch, var(--sc-danger-light) 68%, var(--sc-surface));
      border-color: var(--sc-danger);
      animation: captcha-error-recoil var(--sc-duration-normal) var(--sc-easing-out);

      .slide-captcha__track-fill {
        background: color-mix(in oklch, var(--sc-danger) 14%, transparent);
      }
    }

    &-fill {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        90deg,
        color-mix(in oklch, var(--sc-primary) 10%, transparent),
        color-mix(in oklch, var(--sc-primary) 22%, transparent)
      );
      pointer-events: none;
      transform: scaleX(0);
      transform-origin: left center;
      transition:
        background-color var(--sc-duration-normal) var(--sc-easing-out),
        transform var(--sc-duration-fast) var(--sc-easing-expo);
    }

    &--dragging .slide-captcha__track-fill {
      will-change: transform;
      transition: none;
    }

    &--dragging .slide-captcha__tip {
      opacity: 0.42;
    }
  }

  &__tip {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: calc(100% - 4rem);
    overflow: hidden;
    color: var(--sc-text-muted);
    font-size: 0.8125rem;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
    transform: translate(-50%, -50%);
    transition:
      color var(--sc-duration-normal) var(--sc-easing-out),
      opacity var(--sc-duration-fast) var(--sc-easing-out);

    &--verifying {
      color: var(--sc-primary);
    }

    &--success {
      color: var(--sc-success);
      font-weight: 600;
    }

    &--fail {
      color: var(--sc-danger);
    }
  }

  &__slider {
    position: absolute;
    top: -1px;
    left: -1px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--sc-slider-size);
    height: var(--sc-slider-size);
    color: var(--sc-primary);
    touch-action: none;
    cursor: grab;
    background-color: var(--sc-surface);
    border: 1px solid var(--sc-border-strong);
    border-radius: var(--sc-radius);
    box-shadow: var(--shadow-surface, 0 1px 3px rgb(0 0 0 / 0.08));
    transform: translate3d(0, 0, 0);
    transition:
      color var(--sc-duration-fast) var(--sc-easing-out),
      background-color var(--sc-duration-fast) var(--sc-easing-out),
      border-color var(--sc-duration-fast) var(--sc-easing-out),
      box-shadow var(--sc-duration-fast) var(--sc-easing-out),
      transform var(--sc-duration-fast) var(--sc-easing-expo);

    &:hover:not([aria-disabled='true']) {
      color: var(--color-primary-foreground, #fff);
      background-color: var(--sc-primary);
      border-color: var(--sc-primary);
      box-shadow: var(--shadow-raised, 0 4px 12px rgb(0 0 0 / 0.1));
    }

    &:active:not([aria-disabled='true']) {
      box-shadow: var(--shadow-surface, 0 1px 2px rgb(0 0 0 / 0.08));
    }

    &--dragging {
      color: var(--color-primary-foreground, #fff);
      cursor: grabbing;
      background-color: var(--sc-primary);
      border-color: var(--sc-primary);
      box-shadow: var(--shadow-raised, 0 4px 12px rgb(0 0 0 / 0.1));
      will-change: transform;
      transition:
        color var(--sc-duration-fast) var(--sc-easing-out),
        background-color var(--sc-duration-fast) var(--sc-easing-out),
        border-color var(--sc-duration-fast) var(--sc-easing-out),
        box-shadow var(--sc-duration-fast) var(--sc-easing-out);
    }

    &--verifying {
      color: var(--color-primary-foreground, #fff);
      cursor: wait;
      background-color: var(--sc-primary);
      border-color: var(--sc-primary);
    }

    &--success {
      color: #fff;
      cursor: default;
      background-color: var(--sc-success);
      border-color: var(--sc-success);
      box-shadow: 0 0 0 4px color-mix(in oklch, var(--sc-success) 14%, transparent);
    }

    &--fail {
      color: #fff;
      cursor: default;
      background-color: var(--sc-danger);
      border-color: var(--sc-danger);
    }

    &-icon {
      width: 1.5rem;
      height: 1.5rem;
      overflow: visible;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-width: 1.8;
    }

    &-check {
      stroke-dasharray: 18;
      stroke-dashoffset: 18;
      animation: captcha-draw-symbol var(--sc-duration-slow) var(--sc-easing-out) forwards;
    }

    &-spinner {
      stroke-dasharray: 34 18;
      transform-origin: center;
      animation: captcha-spin 0.9s linear infinite;
    }
  }

  &__result {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: color-mix(in oklch, var(--sc-surface) 91%, transparent);
    backdrop-filter: blur(2px);

    &--success {
      color: var(--sc-success);

      .slide-captcha__result-scan {
        animation: captcha-security-scan 0.9s var(--sc-easing-out) both;
      }
    }

    &-scan {
      position: absolute;
      inset: 0 auto 0 0;
      width: 28%;
      pointer-events: none;
      opacity: 0;
      background: linear-gradient(
        90deg,
        transparent,
        color-mix(in oklch, currentcolor 22%, transparent),
        transparent
      );
    }

    &-mark {
      width: var(--sc-space-16);
      height: var(--sc-space-16);
      overflow: visible;
      fill: none;
      stroke: currentcolor;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    &-ring {
      opacity: 0.34;
      stroke-width: 1.5;
      stroke-dasharray: 158;
      stroke-dashoffset: 158;
      transform: rotate(-90deg);
      transform-origin: center;
      animation: captcha-draw-ring 0.7s var(--ease-out-quint, cubic-bezier(0.22, 1, 0.36, 1))
        forwards;
    }

    &-symbol {
      stroke-width: 3;
      stroke-dasharray: 42;
      stroke-dashoffset: 42;
      animation: captcha-draw-symbol var(--sc-duration-slow) var(--sc-duration-normal)
        var(--sc-easing-out) forwards;
    }

    &-text {
      margin-top: var(--sc-space-2);
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      opacity: 0;
      transform: translateY(var(--sc-space-1));
      animation: captcha-result-copy var(--sc-duration-slow) var(--sc-duration-normal)
        var(--sc-easing-out) forwards;
    }
  }
}

.slide-captcha__track--dragging,
.slide-captcha__track--verifying {
  border-color: color-mix(in oklch, var(--sc-primary) 68%, var(--sc-border));
  box-shadow:
    inset 0 1px 0 color-mix(in oklch, var(--sc-surface) 55%, transparent),
    0 0 0 3px color-mix(in oklch, var(--sc-primary) 10%, transparent);
}

.captcha-result-enter-active {
  transition:
    opacity var(--sc-duration-normal) var(--sc-easing-out),
    transform var(--sc-duration-normal) var(--sc-easing-out);
}

.captcha-result-leave-active {
  transition: opacity var(--sc-duration-fast) ease-in;
}

.captcha-result-enter-from {
  opacity: 0;
  transform: scale(0.985);
}

.captcha-result-leave-to {
  opacity: 0;
}

.captcha-tip-enter-active,
.captcha-tip-leave-active {
  transition:
    opacity var(--sc-duration-fast) var(--sc-easing-out),
    transform var(--sc-duration-fast) var(--sc-easing-out);
}

.captcha-tip-enter-from {
  opacity: 0;
  transform: translate(-50%, calc(-50% + var(--sc-space-1)));
}

.captcha-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% - var(--sc-space-1)));
}

@keyframes captcha-stage-enter {
  from {
    opacity: 0;
    transform: translateY(var(--sc-space-3));
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes captcha-image-reveal {
  from {
    opacity: 0;
    transform: scale(1.015);
  }

  to {
    opacity: 1;
    transform: scale(1);
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
    transform: translateX(calc(var(--sc-space-1) * -0.75));
  }

  72% {
    transform: translateX(calc(var(--sc-space-1) * 0.4));
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-captcha__image-wrapper,
  .slide-captcha__master-image,
  .slide-captcha__track,
  .slide-captcha__slider-check,
  .slide-captcha__slider-spinner,
  .slide-captcha__result-ring,
  .slide-captcha__result-symbol,
  .slide-captcha__result-text,
  .slide-captcha__loading-icon {
    animation: none;
  }

  .slide-captcha__track--fail {
    animation: none;
  }

  .slide-captcha__tile-image,
  .slide-captcha__slider,
  .slide-captcha__result,
  .slide-captcha__tip {
    transition: none;
  }

  .slide-captcha__result-scan {
    display: none;
  }

  .slide-captcha__result-ring,
  .slide-captcha__result-symbol {
    stroke-dashoffset: 0;
  }

  .slide-captcha__result-text {
    opacity: 1;
    transform: none;
  }
}
</style>
