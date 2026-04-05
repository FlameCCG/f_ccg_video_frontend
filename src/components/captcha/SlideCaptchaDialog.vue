<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw, Loader2 } from 'lucide-vue-next'
import { getSlideCaptcha, type SlideCaptcha } from '@/api/captcha'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'verified', value: { token: string; x: number; y: number }): void
  (e: 'cancel'): void
}>()

// State
const captchaData = ref<SlideCaptcha | null>(null)
const isLoading = ref(false)
const isDragging = ref(false)
const sliderX = ref(0)
const startX = ref(0)
const containerRef = ref<HTMLDivElement | null>(null)
const isVerified = ref(false)

// Computed
const sliderStyle = computed(() => ({
  transform: `translateX(${sliderX.value}px)`,
}))

const tileStyle = computed(() => ({
  left: `${sliderX.value}px`,
  top: `${captchaData.value?.thumbY ?? 0}px`,
}))

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  sliderX.value = 0
  isVerified.value = false
  try {
    captchaData.value = await getSlideCaptcha()
  } catch {
    // Error handled by request interceptor
  } finally {
    isLoading.value = false
  }
}

const handleMouseDown = (e: MouseEvent) => {
  if (isVerified.value) return
  isDragging.value = true
  startX.value = e.clientX - sliderX.value
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleTouchStart = (e: TouchEvent) => {
  if (isVerified.value) return
  const touch = e.touches[0]
  if (!touch) return
  isDragging.value = true
  startX.value = touch.clientX - sliderX.value
  document.addEventListener('touchmove', handleTouchMove)
  document.addEventListener('touchend', handleTouchEnd)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !containerRef.value) return
  const containerWidth = containerRef.value.offsetWidth - 44
  const newX = Math.max(0, Math.min(e.clientX - startX.value, containerWidth))
  sliderX.value = newX
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value || !containerRef.value) return
  const touch = e.touches[0]
  if (!touch) return
  const containerWidth = containerRef.value.offsetWidth - 44
  const newX = Math.max(0, Math.min(touch.clientX - startX.value, containerWidth))
  sliderX.value = newX
}

const handleMouseUp = () => {
  if (!isDragging.value) return
  isDragging.value = false
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseup', handleMouseUp)
  verifySlide()
}

const handleTouchEnd = () => {
  if (!isDragging.value) return
  isDragging.value = false
  document.removeEventListener('touchmove', handleTouchMove)
  document.removeEventListener('touchend', handleTouchEnd)
  verifySlide()
}

const verifySlide = () => {
  if (sliderX.value > 10) {
    isVerified.value = true
    emit('verified', {
      token: captchaData.value?.token || '',
      x: Math.round(sliderX.value),
      y: captchaData.value?.thumbY ?? 0,
    })
    emit('update:open', false)
  }
}

const handleCancel = () => {
  emit('cancel')
  emit('update:open', false)
}

// Watch open state to load captcha
watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      void loadCaptcha()
    }
  }
)

onMounted(() => {
  if (props.open) {
    void loadCaptcha()
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md" @escape-key-down="handleCancel">
      <DialogHeader>
        <DialogTitle>安全验证</DialogTitle>
        <DialogDescription>请拖动滑块完成验证</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <!-- Captcha Image Container -->
        <div class="relative overflow-hidden rounded-lg border bg-muted">
          <!-- Loading State -->
          <div v-if="isLoading" class="flex h-[160px] items-center justify-center">
            <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
          </div>

          <!-- Captcha Image -->
          <template v-else-if="captchaData">
            <div class="relative">
              <!-- Background Image -->
              <img
                :src="captchaData.masterImage"
                alt="滑块验证码"
                class="w-full select-none"
                draggable="false"
              />

              <!-- Tile Image (sliding piece) -->
              <img
                :src="captchaData.tileImage"
                alt="滑块"
                class="absolute h-auto w-[44px] select-none"
                :style="tileStyle"
                draggable="false"
              />
            </div>
          </template>
        </div>

        <!-- Slider Track -->
        <div
          ref="containerRef"
          class="relative h-11 overflow-hidden rounded-lg border bg-secondary"
        >
          <!-- Track Background -->
          <div
            class="absolute inset-y-0 left-0 bg-primary/20 transition-all"
            :style="{ width: `${sliderX + 44}px` }"
          />

          <!-- Slider Handle -->
          <div
            class="absolute left-0 top-0 flex h-11 w-11 cursor-grab items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-md transition-colors active:cursor-grabbing"
            :class="{ 'bg-[var(--status-success)]': isVerified }"
            :style="sliderStyle"
            @mousedown="handleMouseDown"
            @touchstart="handleTouchStart"
          >
            <svg
              v-if="!isVerified"
              class="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
            <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <!-- Hint Text -->
          <span
            v-if="!isVerified && sliderX === 0"
            class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
          >
            向右拖动滑块完成验证
          </span>
          <span
            v-else-if="isVerified"
            class="absolute inset-0 flex items-center justify-center text-sm text-[var(--status-success-ink)]"
          >
            验证成功
          </span>
        </div>

        <!-- Controls -->
        <div class="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="isLoading"
            @click="loadCaptcha"
          >
            <RefreshCw class="mr-1 h-4 w-4" />
            刷新
          </Button>
          <span v-if="isVerified" class="text-xs text-[var(--status-success-ink)]">
            验证已完成
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
