<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { RefreshCw, Target, ShieldCheck, ShieldAlert } from 'lucide-vue-next'
import { getClickCaptcha, type ClickCaptcha } from '@/api/captcha'
import type { ClickCaptchaPoint } from '@/api/user'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'verified', value: { token: string; dots: ClickCaptchaPoint[] }): void
  (e: 'cancel'): void
}>()

// State
const captchaData = ref<ClickCaptcha | null>(null)
const isLoading = ref(false)
const hasError = ref(false)
const clickedPoints = ref<ClickCaptchaPoint[]>([])
const imageRef = ref<HTMLImageElement | null>(null)
const isVerified = ref(false)

// UI State
const mousePos = ref({ x: 0, y: 0 })
const isHovering = ref(false)
const MIN_REQUIRED_POINTS = 2

// Methods
const loadCaptcha = async () => {
  isLoading.value = true
  hasError.value = false
  isVerified.value = false
  clickedPoints.value = []
  try {
    captchaData.value = await getClickCaptcha()
  } catch {
    hasError.value = true
  } finally {
    isLoading.value = false
  }
}

const handleMouseMove = (event: MouseEvent) => {
  if (!imageRef.value || isVerified.value) return
  const rect = imageRef.value.getBoundingClientRect()
  mousePos.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

const handleMouseEnter = () => {
  isHovering.value = true
}

const handleMouseLeave = () => {
  isHovering.value = false
}

const handleImageClick = (event: MouseEvent) => {
  if (!imageRef.value || isVerified.value) return

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
}

const handleConfirmDots = () => {
  if (clickedPoints.value.length < MIN_REQUIRED_POINTS || isVerified.value) return
  isVerified.value = true

  setTimeout(() => {
    emit('verified', {
      token: captchaData.value?.token || '',
      dots: clickedPoints.value,
    })
    emit('update:open', false)
    setTimeout(() => {
      isVerified.value = false
      clickedPoints.value = []
    }, 300)
  }, 500)
}

const removeLastPoint = () => {
  if (clickedPoints.value.length > 0 && !isVerified.value) {
    clickedPoints.value.pop()
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
    <DialogContent
      class="max-w-[340px] gap-0 overflow-hidden rounded-[24px] border border-border/20 bg-background/95 p-0 shadow-[var(--shadow-cinematic)] backdrop-blur-[var(--glass-blur)] sm:max-w-[400px]"
      @escape-key-down="handleCancel"
    >
      <div class="px-6 pb-5 pt-6">
        <!-- Header -->
        <div class="mb-4 flex items-center justify-between">
          <h2 class="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
            <Target class="h-5 w-5 text-primary" />
            点选验证
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

        <p class="mb-5 text-sm font-medium text-muted-foreground">请依次点击文字完成验证</p>

        <div class="space-y-4">
          <!-- Captcha Image Container -->
          <div
            class="relative overflow-hidden rounded-xl border border-border/30 bg-muted/30 shadow-inner group"
          >
            <Transition mode="out-in" name="fade">
              <!-- Loading State -->
              <div
                v-if="isLoading"
                key="loading"
                class="flex h-[200px] flex-col items-center justify-center gap-3 bg-muted/20"
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
                class="flex h-[200px] flex-col items-center justify-center gap-2 bg-muted/20"
              >
                <ShieldAlert class="h-8 w-8 text-destructive/80" />
                <span class="text-xs text-muted-foreground">加载失败，请刷新重试</span>
              </div>

              <!-- Captcha Image -->
              <div v-else-if="captchaData" key="captcha" class="flex flex-col">
                <div
                  class="relative cursor-none overflow-hidden"
                  @mousemove="handleMouseMove"
                  @mouseenter="handleMouseEnter"
                  @mouseleave="handleMouseLeave"
                  @click="handleImageClick"
                >
                  <img
                    ref="imageRef"
                    :src="captchaData.masterImage"
                    alt="点击验证码"
                    class="w-full h-auto object-contain select-none"
                    draggable="false"
                  />

                  <!-- Simulated Custom Cursor (Crosshair) -->
                  <div
                    v-if="isHovering && !isVerified"
                    class="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150"
                    :class="{ 'opacity-100': isHovering }"
                    :style="{ left: `${mousePos.x}px`, top: `${mousePos.y}px` }"
                  >
                    <div
                      class="absolute inset-0 rounded-full border border-primary/60 bg-transparent mix-blend-difference"
                    ></div>
                    <div
                      class="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-primary mix-blend-difference"
                    ></div>
                    <div
                      class="absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-primary mix-blend-difference"
                    ></div>
                  </div>

                  <!-- Clicked Points -->
                  <div
                    v-for="(point, index) in clickedPoints"
                    :key="index"
                    class="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-all animate-in zoom-in-50 duration-300"
                    :class="{
                      'ring-2 ring-white/50': !isVerified,
                      'scale-110 bg-green-500': isVerified,
                    }"
                    :style="{
                      left: `${(point.x / (imageRef?.naturalWidth || 1)) * 100}%`,
                      top: `${(point.y / (imageRef?.naturalHeight || 1)) * 100}%`,
                    }"
                  >
                    <span class="text-sm">{{ index + 1 }}</span>
                    <div
                      class="absolute inset-0 rounded-full animate-ping bg-primary/40"
                      style="animation-duration: 1.5s; animation-iteration-count: 1"
                    ></div>
                  </div>

                  <!-- Verified Overlay -->
                  <div
                    class="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 opacity-0 backdrop-blur-[1px] transition-opacity duration-300"
                    :class="{ 'opacity-100': isVerified }"
                  >
                    <div
                      class="scale-0 rounded-full bg-background/90 p-3 shadow-lg transition-transform delay-100 duration-300"
                      :class="{ 'scale-100': isVerified }"
                    >
                      <ShieldCheck class="h-8 w-8 text-[var(--status-success-ink)]" />
                    </div>
                  </div>
                </div>

                <!-- Thumb Image / Action Bar (HUD Style) -->
                <div
                  class="flex items-center justify-between border-t border-border/40 bg-muted/40 p-3 backdrop-blur-md"
                >
                  <div class="flex items-center flex-wrap gap-3">
                    <span
                      class="text-xs shrink-0 font-semibold tracking-wider text-muted-foreground/80"
                      >点击:</span
                    >
                    <img
                      :src="captchaData.thumbImage"
                      alt="提示"
                      class="h-8 w-auto min-w-0 shrink-0 object-contain object-left rounded-[4px] shadow-sm mix-blend-multiply dark:mix-blend-screen"
                      draggable="false"
                    />
                  </div>

                  <div class="flex items-center gap-3 shrink-0">
                    <Button
                      v-if="clickedPoints.length > 0 && !isVerified"
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      @click="removeLastPoint"
                    >
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                      </svg>
                    </Button>
                    <Button
                      v-if="clickedPoints.length > 0 && !isVerified"
                      type="button"
                      variant="default"
                      size="sm"
                      class="h-7 px-3 text-xs font-semibold"
                      :disabled="clickedPoints.length < MIN_REQUIRED_POINTS"
                      @click="handleConfirmDots"
                    >
                      确定
                    </Button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
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
