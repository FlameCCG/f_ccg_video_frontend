<script setup lang="ts" generic="T extends string | number | boolean">
/**
 * 分段选择器。收编投稿页原来的三组原生 radio（自制/转载、公开/私密、立即/定时），
 * 与 EditVideo 的「图标 + 文案 + border-primary bg-primary/5」卡片选择器保持同一形态，
 * 同时补齐 EditVideo 那版缺的键盘可达性：role=radiogroup + roving tabindex + 方向键。
 */
import { computed, nextTick, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { dataAttrs, type SegmentedOption } from './upload-shared'

const props = defineProps<{
  modelValue: T
  options: SegmentedOption<T>[]
  /** radiogroup 的可访问名 */
  label: string
  /** 窄卡片：并排两个时用 grow，链接式排布时用 auto */
  block?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

const itemRefs = ref<(HTMLButtonElement | null)[]>([])

const setItemRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  itemRefs.value[index] = (el as HTMLButtonElement | null) ?? null
}

const selectedIndex = computed(() =>
  props.options.findIndex((option) => option.value === props.modelValue)
)

/** 未命中任何选项时，让第一个可用项承载 tab 焦点，否则整组会被 Tab 跳过 */
const focusableIndex = computed(() => {
  if (selectedIndex.value >= 0) return selectedIndex.value
  return props.options.findIndex((option) => !option.disabled)
})

const select = (option: SegmentedOption<T>) => {
  if (option.disabled || option.value === props.modelValue) return
  emit('update:modelValue', option.value)
}

const moveTo = (start: number, step: number) => {
  const total = props.options.length
  if (total === 0) return

  for (let offset = 1; offset <= total; offset += 1) {
    const index = (((start + step * offset) % total) + total) % total
    const option = props.options[index]
    if (!option || option.disabled) continue
    emit('update:modelValue', option.value)
    void nextTick(() => itemRefs.value[index]?.focus())
    return
  }
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
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      :ref="(el) => setItemRef(el, index)"
      type="button"
      role="radio"
      class="segmented__item"
      :class="{ 'segmented__item--block': block }"
      :aria-checked="option.value === modelValue"
      :aria-disabled="option.disabled ? 'true' : undefined"
      v-bind="dataAttrs({ 'data-selected': option.value === modelValue ? 'true' : 'false' })"
      :disabled="option.disabled"
      :tabindex="focusableIndex === index ? 0 : -1"
      @click="select(option)"
      @keydown="onKeydown($event, index)"
    >
      <component :is="option.icon" v-if="option.icon" class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span class="segmented__label">{{ option.label }}</span>
      <span v-if="option.hint" class="segmented__hint">{{ option.hint }}</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.segmented__item {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-background);
  color: var(--color-muted-foreground);
  font-size: 0.875rem;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quint);

  &[data-selected='true'] {
    border-color: var(--color-primary);
    background-color: color-mix(in oklch, var(--color-primary) 8%, transparent);
    color: var(--color-primary);
    font-weight: 500;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.segmented__item--block {
  flex: 1 1 0;
  min-width: 6.5rem;
}

@media (hover: hover) and (pointer: fine) {
  .segmented__item:not([data-selected='true'], :disabled):hover {
    border-color: color-mix(in oklch, var(--color-foreground) 26%, var(--color-border));
    color: var(--color-foreground);
  }
}

.segmented__hint {
  color: var(--color-muted-foreground);
  font-size: 0.6875rem;
  font-weight: 400;
}
</style>
