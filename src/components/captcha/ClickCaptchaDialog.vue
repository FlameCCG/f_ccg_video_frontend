<script setup lang="ts">
/**
 * 点选验证码弹层
 *
 * 与滑块验证码同构的状态机：
 *   idle →（点「确定」）verifying →（父组件问过后端）success | fail
 *
 * 这里修的是一个功能性 bug，不只是动画：原实现在 setTimeout(500) 后直接把 isVerified 置真、
 * 播成功遮罩、关窗，然后才让父组件去登录 —— 服务端说验证码错了的时候，
 * 用户已经看完成功动画了，而且没有失败态、不能原地重试。
 *
 * 现在：确定只负责 emit('confirm')，等父组件调 success() / fail()；
 * 失败原地反馈并自动换一张，成功等判定动画播完再 emit('verified') 关窗。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RefreshCw, Target } from 'lucide-vue-next'
import { getClickCaptcha, type ClickCaptcha } from '@/api/captcha'
import type { ClickCaptchaPoint } from '@/api/user'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  CAPTCHA_RECOIL_DURATION,
  captchaTipText,
  useCaptchaState,
  useSettleSignal,
} from './useCaptchaState'
import { toNaturalPoint, useFrameWriter } from './captchaGeometry'

interface PlacedPoint {
  key: number
  /** 原图坐标，提交给后端 */
  x: number
  y: number
  /** 相对底图的百分比，用来做纯 transform 定位 */
  px: number
  py: number
}

interface ClickCaptchaSubmission {
  token: string
  dots: ClickCaptchaPoint[]
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 用户提交选点，等待父组件后端校验 */
  (e: 'confirm', value: ClickCaptchaSubmission): void
  /** 校验通过且判定动画已播完 */
  (e: 'verified', value: ClickCaptchaSubmission): void
  (e: 'cancel'): void
}>()

/** 后端没有返回「要点几个字」，所以不设下限门槛；这里只防手滑连点 */
const MAX_POINTS = 6
const IDLE_TIP = '按提示顺序点击文字'

const captchaData = ref<ClickCaptcha | null>(null)
const isLoading = ref(false)
const hasError = ref(false)
const points = ref<PlacedPoint[]>([])
const isHovering = ref(false)
const isRecoiling = ref(false)

const canvasRef = ref<HTMLDivElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
/** 首次出图后锁住高度，换一张时骨架与图片一样高，弹窗不会跟着跳 */
const bedHeight = ref(0)

let pointKey = 0
let captchaRequestId = 0
let hoverRect: DOMRect | null = null
let glowX = 0
let glowY = 0
/** 父组件透传的失败原因（如「密码错误」）；为空时用通用文案 */
const failMessage = ref('')
let recoilTimer: ReturnType<typeof setTimeout> | undefined
const lastSubmission = ref<ClickCaptchaSubmission | null>(null)

const frame = useFrameWriter()
const state = useCaptchaState({
  onReset: () => {
    void loadCaptcha()
  },
})
const status = state.status
const isIdle = state.isIdle
const isVerifying = state.isVerifying
const isSettled = state.isSettled

const settle = useSettleSignal(() => {
  const submission = lastSubmission.value
  emit('update:open', false)
  if (submission) emit('verified', submission)
})

const isReady = computed(() => !isLoading.value && !hasError.value && Boolean(captchaData.value))
const canPick = computed(() => isReady.value && isIdle.value)
const canConfirm = computed(() => canPick.value && points.value.length > 0)
const canRefresh = computed(
  () => !isLoading.value && status.value !== 'verifying' && status.value !== 'success'
)
const tipText = computed(() => {
  // 失败可能来自验证码，也可能来自它守着的那次请求（比如密码错）。
  // 父组件用 silent 抑制了 toast，把真实原因通过 fail(message) 递进来，
  // 这里优先显示它；拿不到才退回通用文案。
  if (status.value === 'fail') return failMessage.value || '没有通过，已为你换一张'
  if (status.value !== 'idle') return captchaTipText(status.value, IDLE_TIP)
  if (points.value.length === 0) return IDLE_TIP
  return `已选 ${points.value.length} 个 · 点错可以点掉重选`
})
const tipKey = computed(() =>
  status.value === 'idle' ? `idle-${points.value.length > 0 ? 'picked' : 'empty'}` : status.value
)
const stageClass = computed(() => ({
  'cap-stage--verifying': status.value === 'verifying',
  'cap-stage--success': status.value === 'success',
  'cap-stage--fail': status.value === 'fail',
}))
const rootStyle = computed(() =>
  bedHeight.value > 0 ? { '--cc-bed': `${bedHeight.value}px` } : undefined
)

function clearRecoil(): void {
  if (recoilTimer) clearTimeout(recoilTimer)
  recoilTimer = undefined
}

function resetPicks(): void {
  points.value = []
  pointKey = 0
}

async function loadCaptcha(): Promise<void> {
  failMessage.value = ''
  // 弹层已经关了就别再拉一张：关窗后父组件的请求仍可能回来并触发 fail() 的自动换图
  if (!props.open) return

  const requestId = ++captchaRequestId
  clearRecoil()
  state.toIdle()
  isLoading.value = true
  hasError.value = false
  isRecoiling.value = false
  resetPicks()

  try {
    const data = await getClickCaptcha()
    if (requestId !== captchaRequestId) return
    captchaData.value = data
  } catch {
    if (requestId === captchaRequestId) {
      captchaData.value = null
      hasError.value = true
    }
  } finally {
    if (requestId === captchaRequestId) isLoading.value = false
  }
}

function handleRefresh(): void {
  if (!canRefresh.value) return
  void loadCaptcha()
}

function cacheHoverRect(): void {
  hoverRect = canvasRef.value?.getBoundingClientRect() ?? null
}

function handleImageLoad(): void {
  cacheHoverRect()
  const height = imageRef.value?.getBoundingClientRect().height ?? 0
  if (height > 0) bedHeight.value = Math.round(height)
}

const flushGlow = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  canvas.style.setProperty('--cc-gx', `${glowX}px`)
  canvas.style.setProperty('--cc-gy', `${glowY}px`)
}

/** 只有真鼠标才有跟随柔光；触屏靠「点下即出现序号点」的落点确认 */
function handlePointerEnter(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || !canPick.value) return
  cacheHoverRect()
  isHovering.value = true
}

function handlePointerMove(event: PointerEvent): void {
  if (!isHovering.value) return
  const rect = hoverRect
  if (!rect) return
  glowX = event.clientX - rect.left
  glowY = event.clientY - rect.top
  frame.schedule(flushGlow)
}

function handlePointerLeave(): void {
  isHovering.value = false
}

function handleCanvasClick(event: MouseEvent): void {
  const image = imageRef.value
  if (!canPick.value || !image) return
  if (points.value.length >= MAX_POINTS) return

  const natural = toNaturalPoint(image, event.clientX, event.clientY)
  if (!natural) return

  points.value.push({
    key: pointKey++,
    x: natural.x,
    y: natural.y,
    px: Number(((natural.x / image.naturalWidth) * 100).toFixed(3)),
    py: Number(((natural.y / image.naturalHeight) * 100).toFixed(3)),
  })
}

function removePoint(index: number): void {
  if (!canPick.value) return
  points.value.splice(index, 1)
}

function removeLastPoint(): void {
  if (!canPick.value || points.value.length === 0) return
  points.value.pop()
}

function handleConfirm(): void {
  if (!canConfirm.value) return

  const submission: ClickCaptchaSubmission = {
    token: captchaData.value?.token ?? '',
    dots: points.value.map((point, index) => ({ index, x: point.x, y: point.y })),
  }

  lastSubmission.value = submission
  isHovering.value = false
  state.toVerifying()
  emit('confirm', submission)
}

/** 最后一个序号点的对勾画完 = 整段判定动画结束 */
function handleDotSettled(index: number): void {
  if (status.value !== 'success') return
  if (index !== points.value.length - 1) return
  settle.fire()
}

function handleCancel(): void {
  settle.disarm()
  emit('cancel')
  emit('update:open', false)
}

function handleOpenChange(value: boolean): void {
  if (!value) {
    settle.disarm()
    emit('cancel')
  }
  emit('update:open', value)
}

function success(): void {
  clearRecoil()
  isHovering.value = false
  state.toSuccess()
  settle.arm()
}

function fail(message?: string): void {
  settle.disarm()
  clearRecoil()
  isHovering.value = false
  failMessage.value = (message || '').trim()
  state.toFail()
  isRecoiling.value = true
  recoilTimer = setTimeout(() => {
    isRecoiling.value = false
    recoilTimer = undefined
  }, CAPTCHA_RECOIL_DURATION)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void loadCaptcha()
      return
    }
    settle.disarm()
    clearRecoil()
    captchaRequestId += 1
    isLoading.value = false
    isHovering.value = false
    isRecoiling.value = false
    state.toIdle()
    resetPicks()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  captchaRequestId += 1
  clearRecoil()
})

defineExpose({
  success,
  fail,
  refresh: handleRefresh,
  reset: () => {
    void loadCaptcha()
  },
})
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="max-w-[min(100vw-1.5rem,360px)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-cinematic sm:max-w-[400px]"
      @escape-key-down="handleCancel"
      @pointer-down-outside="(e: Event) => e.preventDefault()"
    >
      <div class="cap-shell">
        <DialogTitle class="cap-shell__title">
          <Target class="cap-shell__title-icon" aria-hidden="true" />
          点选验证
        </DialogTitle>
        <DialogDescription class="cap-shell__subtitle">
          按下面提示的顺序，依次点击图中的文字
        </DialogDescription>

        <div class="cap-shell__stage">
          <div class="click-captcha cap-scope" :style="rootStyle">
            <div class="click-captcha__stage cap-stage" :class="stageClass">
              <Transition name="cap-media" mode="out-in">
                <div
                  v-if="isLoading"
                  key="loading"
                  class="click-captcha__skeleton"
                  aria-hidden="true"
                >
                  <div class="skeleton-shimmer click-captcha__skeleton-bed"></div>
                  <div class="click-captcha__skeleton-hud">
                    <div class="skeleton-shimmer click-captcha__skeleton-chip"></div>
                    <div class="skeleton-shimmer click-captcha__skeleton-chip"></div>
                    <div class="skeleton-shimmer click-captcha__skeleton-chip"></div>
                  </div>
                </div>

                <div v-else-if="hasError" key="error" class="click-captcha__fallback">
                  <p class="click-captcha__fallback-text">验证码没加载出来</p>
                  <button
                    type="button"
                    class="click-captcha__fallback-action"
                    @click="handleRefresh"
                  >
                    重新加载
                  </button>
                </div>

                <div v-else-if="captchaData" key="ready" class="click-captcha__ready">
                  <div
                    ref="canvasRef"
                    class="click-captcha__canvas"
                    :class="{
                      'click-captcha__canvas--pickable': canPick,
                      'click-captcha__canvas--hovering': isHovering,
                      'click-captcha__canvas--locked': isVerifying,
                    }"
                    @click="handleCanvasClick"
                    @pointerenter="handlePointerEnter"
                    @pointermove="handlePointerMove"
                    @pointerleave="handlePointerLeave"
                  >
                    <img
                      ref="imageRef"
                      :src="captchaData.masterImage"
                      class="click-captcha__image"
                      alt="点选验证码底图"
                      draggable="false"
                      @load="handleImageLoad"
                    />

                    <span class="click-captcha__glow" aria-hidden="true"></span>

                    <div
                      v-for="(point, index) in points"
                      :key="point.key"
                      class="click-captcha__anchor"
                      :style="{ '--cc-dx': point.px, '--cc-dy': point.py, '--cc-i': index }"
                    >
                      <button
                        type="button"
                        class="click-captcha__dot"
                        :class="{
                          'click-captcha__dot--verifying': status === 'verifying',
                          'click-captcha__dot--success': status === 'success',
                          'click-captcha__dot--fail': status === 'fail',
                          'click-captcha__dot--recoil': isRecoiling,
                        }"
                        :disabled="!canPick"
                        :aria-label="`取消第 ${index + 1} 个选点`"
                        @click.stop="removePoint(index)"
                      >
                        <span class="click-captcha__dot-index">{{ index + 1 }}</span>
                        <svg class="click-captcha__dot-mark" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m6 12.5 4 4 8-8.5" @animationend="handleDotSettled(index)" />
                        </svg>
                      </button>
                    </div>

                    <Transition name="cap-veil">
                      <div v-if="isVerifying" class="cap-veil" aria-hidden="true">
                        <span class="cap-scan"></span>
                      </div>
                    </Transition>

                    <div
                      v-if="isSettled"
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
                      class="click-captcha__refresh cap-iconbtn"
                      :disabled="!canRefresh"
                      aria-label="换一张验证码"
                      @click.stop="handleRefresh"
                    >
                      <RefreshCw class="click-captcha__refresh-icon" />
                    </button>
                  </div>

                  <div class="click-captcha__hud">
                    <div class="click-captcha__hint">
                      <span class="click-captcha__hint-label">依次点击</span>
                      <img
                        :src="captchaData.thumbImage"
                        class="click-captcha__hint-image"
                        alt="需要点击的文字"
                        draggable="false"
                      />
                    </div>

                    <div class="click-captcha__actions">
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        :disabled="!canPick || points.length === 0"
                        @click="removeLastPoint"
                      >
                        撤销
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        :disabled="!canConfirm"
                        @click="handleConfirm"
                      >
                        确定
                      </Button>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 播报区常驻：live region 必须先在 DOM 里，读屏才会播报后来的内容变化 -->
            <p
              class="click-captcha__status"
              role="status"
              :aria-live="status === 'fail' ? 'assertive' : 'polite'"
            >
              <Transition name="cap-tip" mode="out-in">
                <span :key="tipKey" class="click-captcha__tip" :class="`cap-ink--${status}`">
                  {{ tipText }}
                </span>
              </Transition>
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
@use './captcha-kit';
@use './captcha-shell';

.click-captcha {
  width: 100%;

  &__skeleton-bed {
    height: var(--cc-bed, 9.5rem);
    border-radius: 0;
  }

  &__skeleton-hud {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    height: 3rem;
    padding: 0 0.75rem;
    border-top: 1px solid color-mix(in oklch, var(--cap-border) 60%, transparent);
  }

  &__skeleton-chip {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 999px;
  }

  &__fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: calc(var(--cc-bed, 9.5rem) + 3rem);
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

  &__canvas {
    position: relative;
    overflow: hidden;
    transition: filter var(--cap-normal) linear;

    /* 系统光标零延迟，比 JS 画的准星准得多；跟随柔光只是辅助 */
    &--pickable {
      cursor: crosshair;
    }

    &--locked {
      filter: saturate(0.72);
    }
  }

  &__image {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
  }

  /* 跟随柔光：只在真鼠标下出现，纯 transform 定位，rAF 合并写入 */
  &__glow {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    width: 5.5rem;
    height: 5.5rem;
    margin: -2.75rem 0 0 -2.75rem;
    pointer-events: none;
    background-image: radial-gradient(
      circle closest-side,
      color-mix(in oklch, var(--cap-primary) 26%, transparent),
      transparent
    );
    opacity: 0;
    transform: translate3d(var(--cc-gx, 0), var(--cc-gy, 0), 0);
    transition: opacity var(--cap-fast) linear;
  }

  /* 0×0 锚点：百分比位移相对自身尺寸，所以要用一个和底图等大的盒子来承载 */
  &__anchor {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    transform: translate3d(calc(var(--cc-dx) * 1%), calc(var(--cc-dy) * 1%), 0);
  }

  &__dot {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    /* 用静态负 margin 居中，把 transform 整个让给动画 */
    width: 1.75rem;
    height: 1.75rem;
    margin: -0.875rem 0 0 -0.875rem;
    color: var(--cap-on-signal);
    font-size: 0.75rem;
    font-weight: 700;
    pointer-events: auto;
    cursor: pointer;
    background-color: var(--cap-primary);
    border-radius: 999px;
    box-shadow:
      0 0 0 2px color-mix(in oklch, var(--cap-on-signal) 40%, transparent),
      var(--shadow-raised-value);
    animation: cc-dot-in var(--cap-normal) var(--cap-quint) both;
    transition:
      background-color var(--cap-fast) var(--cap-out),
      box-shadow var(--cap-fast) var(--cap-out),
      transform var(--cap-fast) var(--cap-quint);

    &:disabled {
      cursor: default;
    }

    &:focus-visible {
      outline: 2px solid var(--color-ring, var(--brand-blue));
      outline-offset: 2px;
    }

    /* 核验中：按放置顺序依次呼吸，等待期才有的动作 */
    &--verifying {
      cursor: default;
      animation: cc-dot-pulse var(--cap-loop) calc(var(--cc-i, 0) * 90ms) var(--cap-out) infinite;
    }

    &--success {
      background-color: var(--cap-success);
      box-shadow:
        0 0 0 3px color-mix(in oklch, var(--cap-success) 26%, transparent),
        var(--shadow-raised-value);
      animation: cc-dot-settle var(--cap-normal) calc(var(--cc-i, 0) * 70ms) var(--cap-quint) both;
    }

    &--fail {
      background-color: var(--cap-danger);
      box-shadow:
        0 0 0 3px color-mix(in oklch, var(--cap-danger) 26%, transparent),
        var(--shadow-raised-value);
    }

    &--recoil {
      animation: cap-recoil var(--cap-fast) var(--cap-out);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &__canvas--hovering &__glow {
      opacity: 1;
    }

    /* 悬停时环变红：这一下点下去是「取消这个点」 */
    &__dot:not(:disabled):hover {
      box-shadow:
        0 0 0 3px color-mix(in oklch, var(--cap-danger) 42%, transparent),
        var(--shadow-raised-value);
      transform: scale(1.08);
    }
  }

  &__dot-index {
    transition: opacity var(--cap-fast) linear;
  }

  &__dot-mark {
    position: absolute;
    width: 0.95rem;
    height: 0.95rem;
    overflow: visible;
    fill: none;
    stroke: currentcolor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
    opacity: 0;

    path {
      stroke-dasharray: 26;
      stroke-dashoffset: 26;
    }
  }

  /* 成功：序号依次收敛成对勾 */
  &__dot--success &__dot-index {
    opacity: 0;
    transition-delay: calc(var(--cc-i, 0) * 70ms);
  }

  &__dot--success &__dot-mark {
    opacity: 1;
    transition: opacity var(--cap-fast) calc(var(--cc-i, 0) * 70ms + 40ms) linear;

    path {
      animation: cap-draw var(--cap-normal) calc(var(--cc-i, 0) * 70ms + 80ms) var(--cap-out)
        forwards;
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

  &__hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.625rem;
    background-color: color-mix(in oklch, var(--cap-surface) 72%, transparent);
    border-top: 1px solid color-mix(in oklch, var(--cap-border) 60%, transparent);
  }

  &__hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  &__hint-label {
    flex-shrink: 0;
    color: var(--cap-text-muted);
    font-size: 0.6875rem;
    letter-spacing: 0.04em;
  }

  /* 提示图是白底黑字的位图：亮色 multiply、暗色 screen，随 html.dark 走，不用 dark: */
  &__hint-image {
    flex-shrink: 0;
    height: 1.75rem;
    width: auto;
    min-width: 0;
    object-fit: contain;
    object-position: left center;
    border-radius: 0.25rem;
    mix-blend-mode: multiply;
  }

  &__actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 0.375rem;
  }

  &__status {
    min-height: 1.25rem;
    margin-top: 0.625rem;
  }

  &__tip {
    display: inline-block;
    font-size: 0.8125rem;
    line-height: 1.25;
  }
}

:global(html.dark) .click-captcha__hint-image {
  mix-blend-mode: screen;
}

@keyframes cc-dot-in {
  from {
    opacity: 0;
    transform: scale(0.4);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes cc-dot-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  46% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

@keyframes cc-dot-settle {
  0% {
    transform: scale(1);
  }

  42% {
    transform: scale(1.16);
  }

  100% {
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .click-captcha__dot,
  .click-captcha__glow,
  .click-captcha__canvas,
  .click-captcha__dot-index {
    transition: none;
  }

  .click-captcha__dot,
  .click-captcha__dot--verifying,
  .click-captcha__dot--success,
  .click-captcha__dot--recoil {
    animation: none;
  }

  .click-captcha__dot--success .click-captcha__dot-index {
    opacity: 0;
  }

  .click-captcha__dot--success .click-captcha__dot-mark {
    opacity: 1;
    transition: none;

    path {
      stroke-dashoffset: 0;
      animation: none;
    }
  }
}
</style>
