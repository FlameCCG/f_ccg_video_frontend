<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { RotateCw, ZoomIn, ZoomOut, X } from 'lucide-vue-next'
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

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      zoom.value = 1
      rotate.value = 0
      position.value = { x: 0, y: 0 }
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
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm transition-all overflow-hidden"
      @click="close"
      @wheel.prevent="handleWheel"
    >
      <!-- Toolbar -->
      <div
        class="absolute top-6 right-6 z-10 flex items-center gap-4 rounded-full bg-black/50 px-4 py-2 text-white/80 shadow-lg backdrop-blur-md"
        @click.stop
      >
        <button
          class="hover:text-white transition-colors p-1"
          title="放大 (滚轮上)"
          @click="handleZoomIn"
        >
          <ZoomIn class="h-5 w-5" />
        </button>
        <button
          class="hover:text-white transition-colors p-1"
          title="缩小 (滚轮下)"
          @click="handleZoomOut"
        >
          <ZoomOut class="h-5 w-5" />
        </button>
        <button class="hover:text-white transition-colors p-1" title="旋转" @click="handleRotate">
          <RotateCw class="h-5 w-5" />
        </button>
        <div class="h-4 w-px bg-white/20 mx-1"></div>
        <button class="hover:text-white transition-colors p-1" title="关闭" @click="close">
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Image Box -->
      <div class="absolute inset-0 flex items-center justify-center">
        <img
          :src="src"
          :style="{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotate}deg)`,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
          }"
          class="max-h-[90vh] max-w-[90vw] select-none object-contain"
          :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
          style="will-change: transform"
          alt="预览图片"
          draggable="false"
          @click.stop
          @pointerdown.stop="handlePointerDown"
        />
      </div>
    </div>
  </Teleport>
</template>
