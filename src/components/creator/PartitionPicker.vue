<script setup lang="ts">
/**
 * 分区选择器。原实现是 div + @click（键盘不可达、无 role、无 aria-checked），
 * 而分区是发布必填项；hover 与选中又都是 scale-105，鼠标横扫一行时整片格子集体抖动、
 * 互相压边，「选中」也就没有独占的视觉信号。这里改成 radiogroup + 颜色权重表达选中。
 */
import { computed, nextTick, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { Partition } from '@/api/video'
import { dataAttrs } from './upload-shared'

const props = defineProps<{
  partitions: Partition[]
  modelValue: number | undefined
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const itemRefs = ref<(HTMLButtonElement | null)[]>([])

const setItemRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  itemRefs.value[index] = (el as HTMLButtonElement | null) ?? null
}

const selectedIndex = computed(() =>
  props.partitions.findIndex((partition) => partition.id === props.modelValue)
)

const focusableIndex = computed(() => (selectedIndex.value >= 0 ? selectedIndex.value : 0))

const moveTo = (start: number, step: number) => {
  const total = props.partitions.length
  if (total === 0) return

  const index = (((start + step) % total) + total) % total
  const partition = props.partitions[index]
  if (!partition) return
  emit('update:modelValue', partition.id)
  void nextTick(() => itemRefs.value[index]?.focus())
}

const onKeydown = (event: KeyboardEvent, index: number) => {
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault()
      moveTo(index, 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      moveTo(index, -1)
      break
    default:
      break
  }
}
</script>

<template>
  <div
    class="partition-grid"
    role="radiogroup"
    aria-label="视频分区"
    v-bind="dataAttrs({ 'data-invalid': invalid ? 'true' : 'false' })"
  >
    <button
      v-for="(partition, index) in partitions"
      :key="partition.id"
      :ref="(el) => setItemRef(el, index)"
      type="button"
      role="radio"
      class="partition-grid__item active-scale"
      :aria-checked="partition.id === modelValue"
      v-bind="dataAttrs({ 'data-selected': partition.id === modelValue ? 'true' : 'false' })"
      :tabindex="focusableIndex === index ? 0 : -1"
      :title="partition.name"
      @click="emit('update:modelValue', partition.id)"
      @keydown="onKeydown($event, index)"
    >
      <span class="truncate">{{ partition.name }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.partition-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (width >= 480px) {
  .partition-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (width >= 768px) {
  .partition-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (width >= 1280px) {
  .partition-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.partition-grid__item {
  min-width: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  color: var(--color-muted-foreground);
  font-size: 0.875rem;
  text-align: center;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quint);

  &[data-selected='true'] {
    border-color: var(--color-primary);
    background-color: color-mix(in oklch, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    font-weight: 500;
  }
}

.partition-grid[data-invalid='true'] .partition-grid__item:not([data-selected='true']) {
  border-color: color-mix(in oklch, var(--status-danger) 40%, var(--color-border));
}

@media (hover: hover) and (pointer: fine) {
  .partition-grid__item:not([data-selected='true']):hover {
    border-color: color-mix(in oklch, var(--color-foreground) 26%, var(--color-border));
    color: var(--color-foreground);
  }
}
</style>
