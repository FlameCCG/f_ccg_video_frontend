<script setup lang="ts">
/**
 * 滑块验证码弹层
 *
 * 只做三件事：拉起 SlideCaptcha、把 confirm 抛给父组件、等父组件给结论。
 * 关窗时机不再用魔法数字（原来 480ms，正好把成功动画拦腰砍断），
 * 改成等 SlideCaptcha 的 settled（判定动画 animationend），减动效下走兜底 timer。
 */
import { ref, watch } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import SlideCaptcha from '@/components/captcha/SlideCaptcha.vue'
import type { CaptchaScene } from '@/api/captcha'

export interface SlideCaptchaResult {
  token: string
  x: number
  y: number
}

interface CaptchaExposed {
  reset: () => void
  refresh: () => void
  fail: (message?: string) => void
  success: () => void
}

const props = withDefaults(
  defineProps<{
    open: boolean
    scene?: CaptchaScene
  }>(),
  { scene: 'register' }
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 用户释放滑块，等待父组件后端校验 */
  (e: 'confirm', value: SlideCaptchaResult): void
  (e: 'success', value: SlideCaptchaResult): void
  (e: 'verified', value: SlideCaptchaResult): void
  (e: 'cancel'): void
}>()

const captchaRef = ref<CaptchaExposed | null>(null)

let lastResult: SlideCaptchaResult | null = null
let pendingVerified = false

function handleConfirm(result: SlideCaptchaResult): void {
  lastResult = result
  emit('confirm', result)
}

function handleSettled(): void {
  if (pendingVerified) emit('update:open', false)
}

function handleAfterLeave(): void {
  if (!props.open && pendingVerified && lastResult) {
    const result = lastResult
    pendingVerified = false
    lastResult = null
    emit('verified', result)
  }
}

function handleOpenChange(value: boolean): void {
  if (!value) {
    pendingVerified = false
    emit('cancel')
  }
  emit('update:open', value)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      lastResult = null
      pendingVerified = false
    }
  }
)

defineExpose({
  success: (result?: SlideCaptchaResult) => {
    if (!props.open) return
    pendingVerified = true
    captchaRef.value?.success()
    if (result) lastResult = result
    if (lastResult) emit('success', lastResult)
  },
  fail: (message?: string) => {
    if (!props.open) return
    pendingVerified = false
    captchaRef.value?.fail(message)
  },
  refresh: () => {
    captchaRef.value?.refresh()
  },
  reset: () => {
    captchaRef.value?.reset()
  },
})
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="cap-dialog max-w-[min(100vw-1.5rem,340px)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-cinematic sm:max-w-[368px]"
      overlay-class="cap-dialog-overlay"
      :hide-close="false"
      @after-leave="handleAfterLeave"
      @pointer-down-outside="(e: Event) => e.preventDefault()"
    >
      <div class="cap-shell">
        <DialogTitle class="cap-shell__title">
          <ShieldCheck class="cap-shell__title-icon" aria-hidden="true" />
          安全验证
        </DialogTitle>
        <DialogDescription class="cap-shell__subtitle">
          拖动滑块，将拼图移至缺口
        </DialogDescription>

        <div class="cap-shell__stage">
          <SlideCaptcha
            ref="captchaRef"
            :visible="open"
            :scene="scene"
            @confirm="handleConfirm"
            @settled="handleSettled"
          />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
@use './captcha-shell';
</style>
