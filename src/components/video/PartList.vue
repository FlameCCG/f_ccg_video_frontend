<script setup lang="ts">
import { computed } from 'vue'
import type { VideoPartItem } from '@/api/video'
import { Play } from 'lucide-vue-next'

const props = defineProps<{
  parts: VideoPartItem[]
  currentPartId?: number
}>()

const emit = defineEmits<{
  select: [partId: number]
}>()

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const hasParts = computed(() => props.parts.length > 1)
</script>

<template>
  <div
    v-if="hasParts"
    class="part-list-container rounded-xl bg-card p-3 shadow-sm border border-border/50"
  >
    <div class="mb-3 flex items-center justify-between px-1">
      <h3 class="text-[15px] font-bold text-foreground tracking-tight">
        视频选集
        <span class="ml-1.5 text-[13px] font-medium text-muted-foreground/70"
          >({{ parts.length }}P)</span
        >
      </h3>
    </div>

    <div class="part-scroll-area max-h-[380px] space-y-1.5 overflow-y-auto pr-2">
      <button
        v-for="(part, index) in parts"
        :key="part.id"
        class="part-item group w-full relative overflow-hidden"
        :class="{ 'is-active': part.id === currentPartId }"
        @click="emit('select', part.id)"
      >
        <div
          class="absolute inset-0 bg-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        ></div>
        <div class="relative flex items-center gap-3 z-10 w-full">
          <span
            class="shrink-0 w-6 flex justify-center text-[12px] font-semibold text-muted-foreground/70 transition-colors group-hover:text-primary/70"
          >
            <Play
              v-if="part.id === currentPartId"
              :size="14"
              class="text-primary playing-icon"
              stroke-width="3"
            />
            <span v-else>P{{ index + 1 }}</span>
          </span>
          <span
            class="flex-1 truncate text-left text-[13px] font-medium transition-colors group-hover:text-primary"
          >
            {{ part.title }}
          </span>
          <span
            class="shrink-0 text-[12px] font-medium text-muted-foreground/60 tabular-nums transition-colors group-hover:text-primary/60"
          >
            {{ formatDuration(part.duration) }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.part-list-container {
  transition: box-shadow 0.3s ease;
}

.part-list-container:hover {
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.04);
}

:global(.dark) .part-list-container:hover {
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
}

.part-scroll-area {
  scrollbar-width: thin;
  scrollbar-color: oklch(var(--muted-foreground) / 0.3) transparent;
}

.part-scroll-area::-webkit-scrollbar {
  width: 4px;
}

.part-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.part-scroll-area::-webkit-scrollbar-thumb {
  background: oklch(var(--muted-foreground) / 0.3);
  border-radius: 4px;
}

.part-scroll-area::-webkit-scrollbar-thumb:hover {
  background: oklch(var(--muted-foreground) / 0.5);
}

.part-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: oklch(var(--foreground));
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}

.part-item:hover {
  transform: translateX(2px);
  border-color: oklch(var(--border) / 0.5);
}

.part-item:active {
  transform: translateX(0) scale(0.99);
  transition-duration: 0.1s;
}

.part-item.is-active {
  background: oklch(var(--primary) / 0.08);
  border-color: oklch(var(--primary) / 0.2);
  color: var(--color-primary);
  box-shadow: 0 2px 8px oklch(var(--primary) / 0.1);
}

.part-item.is-active span {
  color: var(--color-primary) !important;
}

.playing-icon {
  animation: pulse-play 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse-play {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.7;
    transform: scale(0.9);
  }
}
</style>
