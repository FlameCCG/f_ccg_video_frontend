<script setup lang="ts">
/**
 * 滑块验证码弹层
 * 内部复用管理端同款 SlideCaptcha：释放后 emit confirm，由父组件校验后调用 success/fail
 */
import { ref, watch } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import SlideCaptcha from '@/components/captcha/SlideCaptcha.vue'

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
const SUCCESS_CLOSE_DELAY = 480
let successCloseTimer: ReturnType<typeof setTimeout> | undefined

function clearSuccessTimer(): void {
  if (successCloseTimer) clearTimeout(successCloseTimer)
  successCloseTimer = undefined
}

function handleConfirm(result: SlideCaptchaResult): void {
  emit('confirm', result)
}

function handleCancel(): void {
  clearSuccessTimer()
  emit('cancel')
  emit('update:open', false)
}

function handleOpenChange(value: boolean): void {
  if (!value) {
    clearSuccessTimer()
    emit('cancel')
  }
  emit('update:open', value)
}

watch(
  () => props.open,
  (open) => {
    if (!open) clearSuccessTimer()
  }
)

defineExpose({
  success: (result?: SlideCaptchaResult) => {
    captchaRef.value?.success()
    if (result) emit('success', result)
    clearSuccessTimer()
    successCloseTimer = setTimeout(() => {
      emit('update:open', false)
    }, SUCCESS_CLOSE_DELAY)
  },
  fail: () => {
    clearSuccessTimer()
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
      class="max-w-[340px] gap-0 overflow-hidden rounded-[24px] border border-border/20 bg-background/95 p-0 shadow-[var(--shadow-cinematic)] backdrop-blur-[var(--glass-blur)] sm:max-w-[380px]"
      :hide-close="false"
      @escape-key-down="handleCancel"
      @pointer-down-outside="(e: Event) => e.preventDefault()"
    >
      <div class="px-6 pb-5 pt-6">
        <div class="mb-3 flex items-center gap-2">
          <ShieldCheck class="h-5 w-5 text-primary" />
          <h2 class="text-lg font-bold tracking-tight text-foreground">安全验证</h2>
        </div>
        <p class="mb-4 text-sm font-medium text-muted-foreground">请拖动滑块完成拼图验证</p>

        <div class="flex justify-center">
          <SlideCaptcha ref="captchaRef" :visible="open" @confirm="handleConfirm" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
