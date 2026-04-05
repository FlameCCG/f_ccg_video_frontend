<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    max?: number
    placeholder?: string
  }>(),
  {
    max: 10,
    placeholder: '按回车键Enter创建标签',
  }
)

const emit = defineEmits<{
  'update:modelValue': [tags: string[]]
}>()

const inputValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

const isFull = computed(() => props.modelValue.length >= props.max)

const duplicateError = ref(false)
const tooltipStyle = ref<Record<string, string>>({})
let errorTimer: ReturnType<typeof setTimeout> | null = null

const showError = () => {
  // Calculate position relative to viewport
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    tooltipStyle.value = {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top - 44}px`,
      zIndex: '9999',
    }
  }
  duplicateError.value = true
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => {
    duplicateError.value = false
  }, 3000)
}

const addTag = () => {
  const val = inputValue.value.trim()
  if (!val) {
    inputValue.value = ''
    return
  }
  if (props.modelValue.includes(val)) {
    showError()
    inputValue.value = ''
    return
  }
  if (isFull.value) {
    inputValue.value = ''
    return
  }
  emit('update:modelValue', [...props.modelValue, val])
  inputValue.value = ''
}

const removeTag = (index: number) => {
  const newTags = [...props.modelValue]
  newTags.splice(index, 1)
  emit('update:modelValue', newTags)
}

const focusInput = () => {
  inputRef.value?.focus()
}

onBeforeUnmount(() => {
  if (errorTimer) clearTimeout(errorTimer)
})
</script>

<template>
  <div ref="containerRef" class="w-full">
    <Teleport to="body">
      <Transition name="tag-error">
        <div v-if="duplicateError" :style="tooltipStyle" class="tag-error-tooltip">
          <div class="tag-error-icon">×</div>
          <span class="tag-error-text">∑(っ °Д °;)っ 该输入标签已经存在</span>
          <div class="tag-error-arrow"></div>
        </div>
      </Transition>
    </Teleport>

    <div class="tag-input-container" @click="focusInput">
      <div class="tag-input-inner">
        <span v-for="(tag, index) in modelValue" :key="index" class="tag-chip">
          {{ tag }}
          <button type="button" class="tag-remove" @click.stop="removeTag(index)">
            <X class="h-3 w-3" />
          </button>
        </span>
        <input
          ref="inputRef"
          v-model="inputValue"
          type="text"
          class="tag-input-field"
          :placeholder="modelValue.length === 0 ? placeholder : ''"
          :disabled="isFull"
          @keydown.enter.prevent="addTag"
        />
      </div>
      <span class="tag-count">{{ modelValue.length }}/{{ max }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tag-input-container {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 6px 12px;
  border: 1.5px solid oklch(var(--border));
  border-radius: 8px;
  background: oklch(var(--background));
  cursor: text;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: oklch(var(--ring));
    box-shadow: 0 0 0 2px oklch(var(--ring) / 0.18);
  }
}

.tag-input-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  background: oklch(55% 0.18 230deg / 0.12);
  color: oklch(45% 0.18 230deg);
  border: 1px solid oklch(55% 0.18 230deg / 0.2);
  transition: all 0.15s;
}

.dark .tag-chip {
  background: oklch(55% 0.16 230deg / 0.2);
  color: oklch(76% 0.14 230deg);
  border-color: oklch(55% 0.16 230deg / 0.3);
}

.tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
}

.tag-input-field {
  flex: 1;
  min-width: 120px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: oklch(var(--foreground));
  padding: 2px 0;

  &::placeholder {
    color: oklch(var(--muted-foreground));
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.tag-count {
  font-size: 12px;
  color: oklch(var(--muted-foreground));
  white-space: nowrap;
  flex-shrink: 0;
}
</style>

<style lang="scss">
/* Global styles for teleported tooltip */
.tag-error-tooltip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: white;
  border: 1px solid #ef4444;
  border-radius: 6px;
  box-shadow:
    0 4px 16px -4px rgb(0 0 0 / 0.12),
    0 2px 4px -1px rgb(0 0 0 / 0.06);
  pointer-events: none;
}

.dark .tag-error-tooltip {
  background: oklch(22% 0.012 250deg);
  border-color: #ef4444;
}

.tag-error-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ef4444;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  flex-shrink: 0;
}

.tag-error-text {
  font-size: 13px;
  color: #374151;
  white-space: nowrap;
}

.dark .tag-error-text {
  color: oklch(88% 0.01 250deg);
}

.tag-error-arrow {
  position: absolute;
  bottom: -5px;
  left: 24px;
  width: 8px;
  height: 8px;
  background: white;
  border-bottom: 1px solid #ef4444;
  border-right: 1px solid #ef4444;
  transform: rotate(45deg);
}

.dark .tag-error-arrow {
  background: oklch(22% 0.012 250deg);
}

.tag-error-enter-active,
.tag-error-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.tag-error-enter-from,
.tag-error-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* Transition */
</style>
