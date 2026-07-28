<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import type { Partition } from '@/api/video'
import { dataAttrs } from './upload-shared'

defineProps<{
  partitions: Partition[]
  modelValue: number | undefined
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const onChange = (event: Event) => {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value) && value > 0) emit('update:modelValue', value)
}
</script>

<template>
  <div class="partition-select" v-bind="dataAttrs({ 'data-invalid': invalid ? 'true' : 'false' })">
    <select
      id="upload-partition"
      class="partition-select__control"
      :value="modelValue ?? ''"
      :disabled="partitions.length === 0"
      :aria-invalid="invalid || undefined"
      aria-label="视频分区"
      @change="onChange"
    >
      <option value="" disabled>
        {{ partitions.length === 0 ? '分区加载中…' : '请选择视频分区' }}
      </option>
      <option v-for="partition in partitions" :key="partition.id" :value="partition.id">
        {{ partition.name }}
      </option>
    </select>
    <ChevronDown class="partition-select__icon" aria-hidden="true" />
  </div>
</template>

<style scoped lang="scss">
.partition-select {
  position: relative;
  width: min(100%, 28rem);
}

.partition-select__control {
  width: 100%;
  height: 2.75rem;
  padding: 0 2.75rem 0 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  color: var(--color-foreground);
  font-size: 0.875rem;
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &:focus-visible {
    border-color: var(--color-ring);
    outline: 2px solid color-mix(in oklch, var(--color-ring) 35%, transparent);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: wait;
    opacity: 0.65;
  }
}

.partition-select[data-invalid='true'] .partition-select__control {
  border-color: var(--status-danger-border);
}

.partition-select__icon {
  position: absolute;
  top: 50%;
  right: 0.875rem;
  width: 1rem;
  height: 1rem;
  color: var(--color-muted-foreground);
  pointer-events: none;
  transform: translateY(-50%);
}
</style>
