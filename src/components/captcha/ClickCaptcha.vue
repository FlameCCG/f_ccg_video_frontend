<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { RefreshCw, Loader2 } from 'lucide-vue-next'
import { getClickCaptcha, type ClickCaptcha } from '@/api/captcha'
import type { ClickCaptchaPoint } from '@/api/user'
import { Button } from '@/components/ui/button'

defineProps<{
  modelValue?: {
    token: string
    dots: ClickCaptchaPoint[]
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: { token: string; dots: ClickCaptchaPoint[] }): void
  (e: 'verified', value: { token: string; dots: ClickCaptchaPoint[] }): void
}>()

// State
const captchaData = ref<ClickCaptcha | null>(null)
const isLoading = ref(false)
const clickedPoints = ref<ClickCaptchaPoint[]>([])
const imageRef = ref<HTMLImageElement | null>(null)

// Computed
const currentValue = computed(() => ({
  token: captchaData.value?.token || '',
  dots: clickedPoints.value,
}))

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  clickedPoints.value = []
  try {
    captchaData.value = await getClickCaptcha()
    emit('update:modelValue', { token: captchaData.value.token, dots: [] })
  } catch {
    // Error handled by request interceptor
  } finally {
    isLoading.value = false
  }
}

const handleImageClick = (event: MouseEvent) => {
  if (!imageRef.value) return

  const rect = imageRef.value.getBoundingClientRect()
  const visualX = event.clientX - rect.left
  const visualY = event.clientY - rect.top
  const scaleX = imageRef.value.naturalWidth / rect.width
  const scaleY = imageRef.value.naturalHeight / rect.height

  const x = Math.round(visualX * scaleX)
  const y = Math.round(visualY * scaleY)

  const point: ClickCaptchaPoint = {
    index: clickedPoints.value.length,
    x,
    y,
  }

  clickedPoints.value.push(point)

  // Update model value
  emit('update:modelValue', currentValue.value)
}

const handleConfirmDots = () => {
  if (clickedPoints.value.length > 0) {
    emit('verified', currentValue.value)
  }
}

const removeLastPoint = () => {
  if (clickedPoints.value.length > 0) {
    clickedPoints.value.pop()
    emit('update:modelValue', currentValue.value)
  }
}

const reset = () => {
  clickedPoints.value = []
  emit('update:modelValue', { token: captchaData.value?.token || '', dots: [] })
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
        <div v-if="isLoading" key="loading" class="flex h-[200px] items-center justify-center">
          <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
        </div>

        <!-- Captcha Image -->
        <div v-else-if="captchaData" key="captcha" class="flex flex-col">
          <div class="relative">
            <img
              ref="imageRef"
              :src="captchaData.masterImage"
              alt="点击验证码"
              class="w-full h-auto object-contain cursor-crosshair select-none"
              draggable="false"
              @click="handleImageClick"
            />

            <!-- Clicked Points -->
            <div
              v-for="(point, index) in clickedPoints"
              :key="index"
              class="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-md transition-all animate-in zoom-in-50 duration-300"
              :style="{ left: `${point.x / (imageRef?.naturalWidth || 1) * 100}%`, top: `${point.y / (imageRef?.naturalHeight || 1) * 100}%` }"
            >
              {{ index + 1 }}
            </div>
          </div>

          <!-- Thumb Image (hint) -->
          <div class="flex items-center flex-wrap gap-2 border-t bg-background/80 p-2">
            <span class="text-xs shrink-0 text-muted-foreground">请依次点击:</span>
            <img :src="captchaData.thumbImage" alt="提示" class="h-8 w-auto min-w-0 object-contain rounded shrink-0" />
          </div>
        </div>
      </Transition>
    </div>

    <!-- Controls -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
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
        <Button
          v-if="clickedPoints.length > 0"
          type="button"
          variant="ghost"
          size="sm"
          @click="removeLastPoint"
        >
          撤销
        </Button>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted-foreground"> 已点击 {{ clickedPoints.length }} 个点 </span>
        <Button
          v-if="clickedPoints.length > 0"
          type="button"
          variant="default"
          size="sm"
          @click="handleConfirmDots"
        >
          确定
        </Button>
      </div>
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
