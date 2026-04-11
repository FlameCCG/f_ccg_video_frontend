<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Loader2 } from 'lucide-vue-next'
import { getSlideCaptcha, type SlideCaptcha } from '@/api/captcha'
import { Button } from '@/components/ui/button'

defineProps<{
  modelValue?: { token: string; x: number; y: number }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: { token: string; x: number; y: number }): void
  (e: 'verified', value: { token: string; x: number; y: number }): void
}>()

// State
const captchaData = ref<SlideCaptcha | null>(null)
const isLoading = ref(false)
const isDragging = ref(false)
const sliderX = ref(0)
const startX = ref(0)
const containerRef = ref<HTMLDivElement | null>(null)
const imageRef = ref<HTMLImageElement | null>(null)
const isVerified = ref(false)
const imageScale = ref({ x: 1, y: 1 })

const onImageLoad = () => {
  if (imageRef.value && imageRef.value.naturalWidth > 0) {
    imageScale.value = {
      x: imageRef.value.clientWidth / imageRef.value.naturalWidth,
      y: imageRef.value.clientHeight / imageRef.value.naturalHeight,
    }
  }
}

// Computed
const sliderStyle = computed(() => ({
  transform: `translateX(${sliderX.value}px)`,
}))

const tileStyle = computed(() => {
  const thumbY = captchaData.value?.thumbY ?? 0
  return {
    left: `${sliderX.value}px`,
    top: `${Math.round(thumbY * imageScale.value.y)}px`,
  }
})

const currentValue = computed(() => ({
  token: captchaData.value?.token || '',
  x: Math.round(sliderX.value / imageScale.value.x),
  y: captchaData.value?.thumbY ?? 0,
}))

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  sliderX.value = 0
  isVerified.value = false
  try {
    captchaData.value = await getSlideCaptcha()
    emit('update:modelValue', { token: captchaData.value.token, x: 0, y: captchaData.value.thumbY })
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
  const containerWidth = containerRef.value.offsetWidth - 44 // slider width
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
    emit('update:modelValue', currentValue.value)
    emit('verified', currentValue.value)
  }
}

const reset = () => {
  sliderX.value = 0
  isVerified.value = false
  emit('update:modelValue', {
    token: captchaData.value?.token || '',
    x: 0,
    y: captchaData.value?.thumbY ?? 0,
  })
}

// Lifecycle
onMounted(() => {
  void loadCaptcha()
})

// Expose methods
defineExpose({
  loadCaptcha,
  reset,
})
</script>

<template>
  <div class="space-y-3">
    <!-- Captcha Image Container -->
    <div class="relative overflow-hidden rounded-lg border bg-muted">
      <Transition mode="out-in" name="fade">
        <!-- Loading State -->
        <div v-if="isLoading" key="loading" class="flex h-[160px] items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Captcha Image -->
        <div v-else-if="captchaData" key="captcha" class="relative overflow-hidden">
          <!-- Background Image -->
          <img
            ref="imageRef"
            :src="captchaData.masterImage"
            alt="滑块验证码"
            class="w-full select-none"
            draggable="false"
            @load="onImageLoad"
          />

          <!-- Tile Image (sliding piece) -->
          <div
            class="absolute origin-top-left"
            :style="{
              ...tileStyle,
              transform: `scale(${imageScale.x}, ${imageScale.y})`,
            }"
          >
            <img
              :src="captchaData.tileImage"
              alt="滑块"
              class="h-auto select-none"
              draggable="false"
            />
          </div>
        </div>
      </Transition>
    </div>

    <!-- Slider Track -->
    <div ref="containerRef" class="relative h-11 overflow-hidden rounded-lg border bg-secondary">
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
      <Button type="button" variant="outline" size="sm" :disabled="isLoading" @click="loadCaptcha">
        <RefreshCw class="mr-1 h-4 w-4" />
        刷新
      </Button>
      <span v-if="isVerified" class="text-xs text-[var(--status-success-ink)]"> 验证已完成 </span>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
