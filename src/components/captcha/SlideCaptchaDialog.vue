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
import { useSettleSignal } from './useCaptchaState'

export interface SlideCaptchaResult {
  token: string
  x: number
  y: number
}

interface CaptchaExposed {
  reset: () => void
  refresh: () => void
  fail: () => void
  success: () => void
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  /** 用户释放滑块，等待父组件后端校验 */
  (e: 'confirm', value: SlideCaptchaResult): void
  (e: 'success', value: SlideCaptchaResult): void
  (e: 'cancel'): void
}>()

const captchaRef = ref<CaptchaExposed | null>(null)

const settle = useSettleSignal(() => {
  emit('update:open', false)
})

function handleConfirm(result: SlideCaptchaResult): void {
  emit('confirm', result)
}

function handleSettled(): void {
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

watch(
  () => props.open,
  (open) => {
    if (!open) settle.disarm()
  }
)

defineExpose({
  success: (result?: SlideCaptchaResult) => {
    captchaRef.value?.success()
    if (result) emit('success', result)
    // 判定动画播完（或兜底超时）再关窗
    settle.arm()
  },
  fail: () => {
    settle.disarm()
    captchaRef.value?.fail()
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
      class="max-w-[min(100vw-1.5rem,340px)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-cinematic sm:max-w-[368px]"
      :hide-close="false"
      @escape-key-down="handleCancel"
      @pointer-down-outside="(e: Event) => e.preventDefault()"
    >
      <div class="cap-shell">
        <DialogTitle class="cap-shell__title">
          <ShieldCheck class="cap-shell__title-icon" aria-hidden="true" />
          安全验证
        </DialogTitle>
        <DialogDescription class="cap-shell__subtitle">
          把右边缺了一块的图补上，就能继续
        </DialogDescription>

        <div class="cap-shell__stage">
          <SlideCaptcha
            ref="captchaRef"
            :visible="open"
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
