<script setup lang="ts">
/**
 * 拖拽落点选择层。
 *
 * 原来拖拽反馈只存在于「一个作品都没有」的空态里：已经有作品之后整页拖入零反馈，
 * 松手直接把文件静默追加成当前作品的 P2/P3 —— 用户以为在新建作品，结果是加分P，
 * 这是会让人丢文件的认知错误。这里在拖拽进入时把两种意图摆到台面上，由用户选。
 */
import { ref } from 'vue'
import { FilePlus2, Layers } from 'lucide-vue-next'
import { dataAttrs } from './upload-shared'

defineProps<{
  activeTitle: string
  remaining: number
}>()

const emit = defineEmits<{
  append: [event: DragEvent]
  newWorks: [event: DragEvent]
  miss: []
}>()

const hovered = ref<'append' | 'new' | null>(null)
</script>

<template>
  <div class="drop-overlay" role="presentation" @dragover.prevent @drop.prevent.stop="emit('miss')">
    <div class="drop-overlay__grid">
      <button
        type="button"
        class="drop-target"
        v-bind="dataAttrs({ 'data-hot': hovered === 'append' ? 'true' : 'false' })"
        @dragenter.prevent="hovered = 'append'"
        @dragover.prevent="hovered = 'append'"
        @dragleave="hovered = null"
        @drop.prevent.stop="emit('append', $event)"
      >
        <Layers class="drop-target__icon" aria-hidden="true" />
        <span class="drop-target__title">加为当前作品的分P</span>
        <span class="drop-target__desc">
          追加到《{{ activeTitle || '当前作品' }}》，共用同一套标题、封面与分区
        </span>
        <span
          class="drop-target__meta"
          :class="remaining <= 0 ? 'text-[var(--status-warning-ink)]' : ''"
        >
          {{ remaining > 0 ? `还可以再加 ${remaining} 个分P` : '已达分P上限' }}
        </span>
      </button>

      <button
        type="button"
        class="drop-target"
        v-bind="dataAttrs({ 'data-hot': hovered === 'new' ? 'true' : 'false' })"
        @dragenter.prevent="hovered = 'new'"
        @dragover.prevent="hovered = 'new'"
        @dragleave="hovered = null"
        @drop.prevent.stop="emit('newWorks', $event)"
      >
        <FilePlus2 class="drop-target__icon" aria-hidden="true" />
        <span class="drop-target__title">作为新的作品</span>
        <span class="drop-target__desc"> 每个文件单独成稿，标题、封面、分区分别填写 </span>
        <span class="drop-target__meta">适合一次投多个视频</span>
      </button>
    </div>

    <p class="drop-overlay__hint">松开鼠标放到其中一个区域，即可完成添加</p>
  </div>
</template>

<style scoped lang="scss">
.drop-overlay {
  display: flex;
  position: fixed;
  z-index: 50;
  inset: 0;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background-color: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  animation: drop-overlay-in var(--duration-fast) linear both;
}

.drop-overlay__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

@media (width >= 768px) {
  .drop-overlay {
    padding: 2rem;
  }

  .drop-overlay__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
}

.drop-target {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  border: 2px dashed color-mix(in oklch, var(--color-foreground) 20%, transparent);
  border-radius: var(--radius-2xl);
  background-color: color-mix(in oklch, var(--color-card) 70%, transparent);
  text-align: center;
  /* 拖拽层只做颜色变化：整块缩放会让 2 个大面板互相挤动，反而更难瞄准 */
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &[data-hot='true'] {
    border-color: var(--color-primary);
    border-style: solid;
    background-color: color-mix(in oklch, var(--color-primary) 10%, var(--color-card));
  }

  /* 内部元素不接收拖拽事件，否则子元素间移动会触发 dragleave 抖动 */
  > * {
    pointer-events: none;
  }
}

.drop-target__icon {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--color-primary);
}

.drop-target__title {
  color: var(--color-foreground);
  font-size: 1rem;
  font-weight: 600;
}

.drop-target__desc {
  max-width: 22rem;
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.375rem;
}

.drop-target__meta {
  color: var(--color-muted-foreground);
  font-size: 0.6875rem;
}

.drop-overlay__hint {
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  text-align: center;
}

@keyframes drop-overlay-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
