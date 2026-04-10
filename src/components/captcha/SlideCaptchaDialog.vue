<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-vue-next'
import { getSlideCaptcha, type SlideCaptcha } from '@/api/captcha'
import { Dialog, DialogContent } from '@/components/ui/dialog'

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
const hasError = ref(false)

// Computed
const tileStyle = computed(() => ({
  left: `${sliderX.value}px`,
  top: `${captchaData.value?.thumbY ?? 0}px`,
}))

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  sliderX.value = 0
  isVerified.value = false
  hasError.value = false
  try {
    captchaData.value = await getSlideCaptcha()
  } catch {
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

const handleMouseDown = (e: MouseEvent) => {
  if (isVerified.value || isLoading.value || hasError.value) return
  isDragging.value = true
  startX.value = e.clientX - sliderX.value
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

const handleTouchStart = (e: TouchEvent) => {
  if (isVerified.value || isLoading.value || hasError.value) return
  const touch = e.touches[0]
  if (!touch) return
  isDragging.value = true
  startX.value = touch.clientX - sliderX.value
  document.addEventListener('touchmove', handleTouchMove, { passive: false })
  document.addEventListener('touchend', handleTouchEnd)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value || !containerRef.value) return
  const containerWidth = containerRef.value.offsetWidth - 48 // 48 is slider handle width
  const newX = Math.max(0, Math.min(e.clientX - startX.value, containerWidth))
  sliderX.value = newX
}

const handleTouchMove = (e: TouchEvent) => {
  if (!isDragging.value || !containerRef.value) return
  e.preventDefault() // prevent scroll
  const touch = e.touches[0]
  if (!touch) return
  const containerWidth = containerRef.value.offsetWidth - 48
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

    setTimeout(() => {
      emit('verified', {
        token: captchaData.value?.token || '',
        x: Math.round(sliderX.value),
        y: captchaData.value?.thumbY ?? 0,
      })
      emit('update:open', false)
      setTimeout(() => {
        sliderX.value = 0
        isVerified.value = false
      }, 300)
    }, 400)
  } else {
    sliderX.value = 0
  }
}

const handleCancel = () => {
  emit('cancel')
  emit('update:open', false)
}

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
    <DialogContent
      class="max-w-[340px] gap-0 overflow-hidden rounded-[24px] border border-border/20 bg-background/95 p-0 shadow-[var(--shadow-cinematic)] backdrop-blur-[var(--glass-blur)] sm:max-w-[380px]"
      @escape-key-down="handleCancel"
    >
      <div class="px-6 pb-4 pt-6">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
            <ShieldCheck class="h-5 w-5 text-primary" />
            安全验证
          </h2>
          <button
            type="button"
            class="rounded-full p-2 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:scale-95"
            :disabled="isLoading || isVerified"
            @click="loadCaptcha"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
          </button>
        </div>

        <p class="mb-5 text-sm font-medium text-muted-foreground">请拖动滑块完成拼图验证</p>

        <div class="space-y-5">
          <!-- Captcha Image Container -->
          <div
            class="relative overflow-hidden rounded-xl border border-border/30 bg-muted/30 shadow-inner"
          >
            <Transition mode="out-in" name="fade">
              <!-- Loading State -->
              <div
                v-if="isLoading"
                key="loading"
                class="flex h-[160px] flex-col items-center justify-center gap-3 bg-muted/20"
              >
                <div
                  class="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
                ></div>
                <span class="animate-pulse text-xs text-muted-foreground">正在加载安全环境...</span>
              </div>

              <!-- Error State -->
              <div
                v-else-if="hasError"
                key="error"
                class="flex h-[160px] flex-col items-center justify-center gap-2 bg-muted/20"
              >
                <ShieldAlert class="h-8 w-8 text-destructive/80" />
                <span class="text-xs text-muted-foreground">加载失败，请刷新重试</span>
              </div>

              <!-- Captcha Image -->
              <div v-else-if="captchaData" key="captcha" class="relative">
                <!-- Background Image -->
                <img
                  :src="captchaData.masterImage"
                  alt="滑块验证码"
                  class="w-full select-none"
                  draggable="false"
                />

                <!-- Tile Image (sliding piece) -->
                <!-- Add subtle drop shadow to it so it separates nicely from the master -->
                <div class="absolute drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]" :style="tileStyle">
                  <img
                    :src="captchaData.tileImage"
                    alt="滑块"
                    class="h-auto w-[44px] select-none"
                    draggable="false"
                  />
                  <!-- Inner sleek border to give it a glass cut effect -->
                  <div
                    class="pointer-events-none absolute inset-0 rounded-[4px] ring-1 ring-white/30 shadow-[inset_0_1px_4px_rgba(255,255,255,0.4)]"
                  ></div>
                </div>

                <!-- Verified Overlay -->
                <div
                  class="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 opacity-0 backdrop-blur-[1px] transition-opacity duration-300"
                  :class="{ 'opacity-100': isVerified }"
                >
                  <div
                    class="scale-0 rounded-full bg-background/90 p-2 shadow-lg transition-transform delay-100 duration-300"
                    :class="{ 'scale-100': isVerified }"
                  >
                    <ShieldCheck class="h-6 w-6 text-primary" />
                  </div>
                </div>
              </div>
            </Transition>
          </div>

          <!-- Slider Track -->
          <div
            ref="containerRef"
            class="group relative h-12 overflow-hidden rounded-xl border border-border/40 bg-muted/40 shadow-inner"
          >
            <!-- Track Background Highlight -->
            <div
              class="absolute inset-y-0 left-0 transition-all"
              :class="isVerified ? 'bg-primary/20' : 'bg-primary/10'"
              :style="{
                width: `${sliderX + 48}px`,
                transition: isDragging
                  ? 'none'
                  : 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease',
              }"
            >
              <!-- Shine effect -->
              <div
                class="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-primary/20 to-transparent"
              ></div>
            </div>

            <!-- Slider Handle -->
            <div
              class="absolute bottom-0 left-0 top-0 box-border flex w-12 cursor-grab items-center justify-center rounded-xl border border-primary/20 bg-background/90 shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all"
              :class="{
                'border-primary bg-primary text-primary-foreground shadow-primary/30': isVerified,
                'scale-[1.02] cursor-grabbing border-primary shadow-lg': isDragging,
                'hover:border-primary/50 hover:bg-background hover:shadow-md':
                  !isDragging && !isVerified && !isLoading,
              }"
              :style="{
                transform: `translateX(${sliderX}px)`,
                transition: isDragging
                  ? 'none'
                  : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.3s ease, border-color 0.3s ease',
              }"
              @mousedown="handleMouseDown"
              @touchstart="handleTouchStart"
            >
              <div v-if="!isVerified" class="flex gap-1">
                <div
                  class="h-4 w-0.5 rounded-full bg-muted-foreground/40 transition-colors"
                  :class="{ 'bg-primary/60': isDragging }"
                ></div>
                <div
                  class="h-4 w-0.5 rounded-full bg-muted-foreground/40 transition-colors"
                  :class="{ 'bg-primary/60': isDragging }"
                ></div>
                <div
                  class="h-4 w-0.5 rounded-full bg-muted-foreground/40 transition-colors"
                  :class="{ 'bg-primary/60': isDragging }"
                ></div>
              </div>
              <svg v-else class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M5 13l4 4L19 7"
                  class="animate-[dash_0.4s_ease-out_forwards] [stroke-dasharray:30] [stroke-dashoffset:30]"
                />
              </svg>
            </div>

            <!-- Hint Text -->
            <span
              v-if="!isVerified && sliderX === 0 && !isDragging"
              class="pointer-events-none absolute inset-0 flex select-none items-center justify-center text-sm font-medium tracking-widest text-muted-foreground/70 transition-opacity"
            >
              向右滑动完成验证
            </span>
            <span
              v-else-if="isVerified"
              class="pointer-events-none absolute inset-0 flex select-none items-center justify-end pr-6 text-sm font-bold text-primary transition-opacity duration-300"
            >
              验证成功
            </span>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
@keyframes dash {
  to {
    stroke-dashoffset: 0;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
