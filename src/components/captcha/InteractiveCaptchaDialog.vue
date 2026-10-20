<script setup lang="ts">
import { ref, watch } from 'vue'
import { ShieldCheck } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import ClickCaptchaDialog from './ClickCaptchaDialog.vue'
import SlideCaptcha from './SlideCaptcha.vue'
import type { CaptchaScene, InteractiveCaptchaPayload } from '@/api/captcha'
import type { ClickCaptchaPoint } from '@/api/user'

const props = defineProps<{
  open: boolean
  type: 'click' | 'slide'
  scene: CaptchaScene
  revision: number
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [value: InteractiveCaptchaPayload]
  retry: []
  verified: []
  cancel: []
}>()
interface CaptchaHandle {
  success: () => void
  fail: (message?: string) => void
  reset: () => void
}
const captchaRef = ref<CaptchaHandle | null>(null)
const busy = ref(false)
const pendingVerified = ref(false)
function confirm(value: InteractiveCaptchaPayload): void {
  busy.value = true
  emit('confirm', value)
}
function confirmClick(value: { token: string; dots: ClickCaptchaPoint[] }): void {
  confirm({ captchaToken: value.token, captchaDots: value.dots })
}
function confirmSlide(value: { token: string; x: number; y: number }): void {
  confirm({ slideCaptchaToken: value.token, slideCaptchaX: value.x, slideCaptchaY: value.y })
}
function settled(): void {
  if (pendingVerified.value && props.open) emit('update:open', false)
}
function close(open: boolean): void {
  if (!open) {
    if (busy.value || pendingVerified.value) return
    emit('cancel')
  }
  emit('update:open', open)
}
function afterLeave(): void {
  if (props.open || !pendingVerified.value) return
  pendingVerified.value = false
  emit('verified')
}
watch(
  () => props.open,
  (open) => {
    if (open) {
      busy.value = false
      pendingVerified.value = false
    }
  }
)
defineExpose({
  success: () => {
    if (!props.open) return
    busy.value = false
    pendingVerified.value = true
    captchaRef.value?.success()
  },
  fail: (message?: string) => {
    if (!props.open) return
    busy.value = false
    pendingVerified.value = false
    captchaRef.value?.fail(message)
  },
  reset: () => captchaRef.value?.reset(),
})
</script>

<template>
  <Dialog :open="open" @update:open="close">
    <DialogContent
      class="cap-dialog max-w-[min(100vw-1.5rem,400px)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-cinematic"
      overlay-class="cap-dialog-overlay"
      :hide-close="busy || pendingVerified"
      @after-leave="afterLeave"
      @pointer-down-outside="(event: Event) => event.preventDefault()"
      @escape-key-down="
        (event: Event) => {
          if (busy || pendingVerified) event.preventDefault()
        }
      "
    >
      <div class="captcha-switch-stage">
        <Transition name="captcha-switch" mode="out-in">
          <ClickCaptchaDialog
            v-if="type === 'click'"
            :key="`click-${revision}`"
            ref="captchaRef"
            :open="open"
            :scene="scene"
            embedded
            :auto-retry="false"
            @confirm="confirmClick"
            @retry="emit('retry')"
            @settled="settled"
          />
          <div v-else :key="`slide-${revision}`" class="cap-shell">
            <DialogTitle class="cap-shell__title"
              ><ShieldCheck class="cap-shell__title-icon" />安全验证</DialogTitle
            >
            <DialogDescription class="cap-shell__subtitle"
              >拖动滑块，将拼图移至缺口</DialogDescription
            >
            <div class="cap-shell__stage">
              <SlideCaptcha
                ref="captchaRef"
                :visible="open"
                :scene="scene"
                :auto-retry="false"
                @confirm="confirmSlide"
                @retry="emit('retry')"
                @settled="settled"
              />
            </div>
          </div>
        </Transition>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
@use './captcha-shell';
.captcha-switch-stage {
  min-height: 22rem;
}
.captcha-switch-enter-active {
  transition:
    opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.captcha-switch-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}
.captcha-switch-enter-from {
  opacity: 0;
  transform: translateY(6px) scale(0.99);
}
.captcha-switch-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}
@media (prefers-reduced-motion: reduce) {
  .captcha-switch-enter-active,
  .captcha-switch-leave-active {
    transition: opacity 1ms linear;
  }
  .captcha-switch-enter-from,
  .captcha-switch-leave-to {
    transform: none;
  }
}
</style>
