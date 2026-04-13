<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { RotateCw, ZoomIn, ZoomOut, X, Maximize } from 'lucide-vue-next'
import { useScrollLock } from '@vueuse/core'

const props = defineProps<{
  modelValue: boolean
  src: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const zoom = ref(1)
const rotate = ref(0)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const isLocked = useScrollLock(document.body)

// 重置图片状态
const resetImage = () => {
  zoom.value = 1
  rotate.value = 0
  position.value = { x: 0, y: 0 }
}

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      resetImage()
      isLocked.value = true
    } else {
      isLocked.value = false
    }
  }
)

onUnmounted(() => {
  isLocked.value = false
})

const close = () => {
  emit('update:modelValue', false)
}

const handleZoomIn = () => {
  zoom.value += 0.25
}

const handleZoomOut = () => {
  zoom.value = Math.max(0.25, zoom.value - 0.25)
}

const handleRotate = () => {
  rotate.value += 90
}

const handleWheel = (e: WheelEvent) => {
  if (e.deltaY < 0) {
    handleZoomIn()
  } else {
    handleZoomOut()
  }
}

const handlePointerDown = (e: PointerEvent) => {
  e.preventDefault()
  isDragging.value = true
  dragStart.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y,
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

const handlePointerMove = (e: PointerEvent) => {
  if (!isDragging.value) return
  position.value = {
    x: e.clientX - dragStart.value.x,
    y: e.clientY - dragStart.value.y,
  }
}

const handlePointerUp = () => {
  isDragging.value = false
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="viewer">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[100100] flex items-center justify-center overflow-hidden bg-zinc-50/95 backdrop-blur-2xl transition-all dark:bg-zinc-950/95"
        @click="close"
        @wheel.prevent="handleWheel"
      >
        <!-- 右上角：独立的关闭按钮 -->
        <!-- 浅色模式：纯白背景 + 细边框 + 阴影；深色模式：半透明黑 -->
        <button
          class="absolute top-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-zinc-600 shadow-lg ring-1 ring-zinc-200/80 backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-zinc-100 hover:text-zinc-900 active:scale-95 dark:bg-zinc-800/80 dark:text-zinc-400 dark:shadow-none dark:ring-white/10 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          title="关闭 (Esc)"
          @click.stop="close"
        >
          <X class="h-6 w-6" />
        </button>

        <!-- 底部居中：浮动操作药丸 -->
        <!-- 浅色模式：增强的弥散阴影，更干净的纯白背景 -->
        <div
          class="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 shadow-[0_12px_40px_rgb(0,0,0,0.08)] ring-1 ring-zinc-200/80 backdrop-blur-2xl dark:bg-zinc-900/95 dark:shadow-[0_12px_40px_rgb(0,0,0,0.5)] dark:ring-white/10"
          @click.stop
        >
          <button
            class="group relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 active:scale-90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="放大 (滚轮上)"
            @click="handleZoomIn"
          >
            <ZoomIn class="h-5 w-5" />
          </button>
          <button
            class="group relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 active:scale-90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="缩小 (滚轮下)"
            @click="handleZoomOut"
          >
            <ZoomOut class="h-5 w-5" />
          </button>

          <!-- 分割线 -->
          <div class="mx-1 h-5 w-px bg-zinc-200 dark:bg-zinc-700/80"></div>

          <button
            class="group relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 active:scale-90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="旋转"
            @click="handleRotate"
          >
            <RotateCw class="h-5 w-5" />
          </button>

          <button
            class="group relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-900 active:scale-90 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="重置"
            @click="resetImage"
          >
            <Maximize class="h-5 w-5" />
          </button>
        </div>

        <!-- 图片展示区 -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <img
            :src="src"
            :style="{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotate}deg)`,
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0, 0, 1)',
            }"
            class="max-h-[90vh] max-w-[90vw] select-none object-contain pointer-events-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
            style="will-change: transform"
            alt="预览图片"
            draggable="false"
            @click.stop
            @dblclick.stop="resetImage"
            @pointerdown.stop="handlePointerDown"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 定义 Vue Transition 动画 */
.viewer-enter-active,
.viewer-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    backdrop-filter 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.viewer-enter-from,
.viewer-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
}

.viewer-enter-active img,
.viewer-leave-active img {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}

.viewer-enter-from img,
.viewer-leave-to img {
  transform: scale(0.9) !important;
}
</style>
