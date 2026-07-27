<script setup lang="ts">
import { ref, computed, onBeforeUnmount, useId } from 'vue'
import { X } from 'lucide-vue-next'

const hintId = `tag-input-hint-${useId()}`

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    max?: number
    placeholder?: string
  }>(),
  {
    max: 10,
    placeholder: '输入后按回车创建标签',
  }
)

const emit = defineEmits<{
  'update:modelValue': [tags: string[]]
}>()

const inputValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const isFull = computed(() => props.modelValue.length >= props.max)

/**
 * 重复标签原来是「Teleport 到 body 的 fixed 红框 + 颜文字」：
 * 一是 fixed 坐标在触发那一刻算死，投稿页很长，滚动后提示会浮在半空；
 * 二是对「你已经加过这个标签了」这种良性事件报错级别过高。
 * 改成：定位到已存在的那个 chip 上做一次高亮，文案落到输入框下方的常驻说明行。
 */
const flashTag = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

type HintTone = 'muted' | 'warn'
const hintOverride = ref<{ text: string; tone: HintTone } | null>(null)
let hintTimer: ReturnType<typeof setTimeout> | null = null

const hint = computed(() => {
  if (hintOverride.value) return hintOverride.value
  if (isFull.value) {
    return {
      text: `已达上限 ${props.max}/${props.max}，删掉一个才能继续添加`,
      tone: 'warn' as const,
    }
  }
  return { text: `输入后按回车创建，最多 ${props.max} 个`, tone: 'muted' as const }
})

const setHint = (text: string, tone: HintTone) => {
  hintOverride.value = { text, tone }
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hintOverride.value = null
  }, 3200)
}

const flashExistingTag = (tag: string) => {
  flashTag.value = tag
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashTag.value = ''
  }, 900)
}

const addTag = () => {
  const val = inputValue.value.trim()
  if (!val) {
    inputValue.value = ''
    return
  }
  if (props.modelValue.includes(val)) {
    flashExistingTag(val)
    setHint(`「${val}」已经加过了`, 'warn')
    inputValue.value = ''
    return
  }
  if (isFull.value) {
    // 满额时不禁用输入框：禁用会让整块变成没有任何解释的死区
    setHint(`最多只能加 ${props.max} 个标签，先删掉一个再试`, 'warn')
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
  if (flashTimer) clearTimeout(flashTimer)
  if (hintTimer) clearTimeout(hintTimer)
})
</script>

<template>
  <div class="w-full">
    <div class="tag-input-container" @click="focusInput">
      <div class="tag-input-inner">
        <span
          v-for="(tag, index) in modelValue"
          :key="tag"
          class="tag-chip"
          :class="{ 'tag-chip--flash': flashTag === tag }"
        >
          {{ tag }}
          <button
            type="button"
            class="tag-remove"
            :aria-label="`删除标签 ${tag}`"
            @click.stop="removeTag(index)"
          >
            <X class="h-3 w-3" />
          </button>
        </span>
        <input
          ref="inputRef"
          v-model="inputValue"
          type="text"
          class="tag-input-field"
          :placeholder="modelValue.length === 0 ? placeholder : ''"
          :aria-describedby="hintId"
          @keydown.enter.prevent="addTag"
        />
      </div>
      <span class="tag-count" :class="{ 'tag-count--full': isFull }">
        {{ modelValue.length }}/{{ max }}
      </span>
    </div>
    <p :id="hintId" class="tag-hint" :class="{ 'tag-hint--warn': hint.tone === 'warn' }">
      {{ hint.text }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.tag-input-container {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 42px;
  padding: 6px 12px;
  border: 1px solid var(--color-input, var(--border-color));
  border-radius: var(--radius-md);
  background: var(--color-background, var(--bg-surface-0));
  cursor: text;
  transition: border-color var(--duration-fast) var(--ease-out-quart);

  /* 内层 input 写了 outline:none，焦点指示统一由容器承担，与全局
     `*:focus-visible { outline: 2px solid var(--color-ring) }` 保持同一套语言 */
  &:focus-within {
    border-color: var(--color-ring, var(--brand-blue));
    outline: 2px solid var(--color-ring, var(--brand-blue));
    outline-offset: 2px;
  }
}

.tag-input-inner {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

/* 品牌色只有一个真值来源 —— 原来这里把 brand-blue 手抄了一遍（还带一份 .dark 分支），
   主题一改就脱节。暗色由 --brand-blue 自身在 html.dark 下换值承担。 */
.tag-chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 3px 10px;
  border: 1px solid color-mix(in oklch, var(--brand-blue) 22%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in oklch, var(--brand-blue) 12%, transparent);
  color: color-mix(in oklch, var(--brand-blue) 70%, var(--text-1));
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear;
}

.tag-chip--flash {
  border-color: color-mix(in oklch, var(--brand-blue) 60%, transparent);
  background: color-mix(in oklch, var(--brand-blue) 24%, transparent);
  color: color-mix(in oklch, var(--brand-blue) 88%, var(--text-1));
  animation: tag-chip-flash 640ms var(--ease-out-quart) both;
}

@keyframes tag-chip-flash {
  0%,
  100% {
    opacity: 1;
  }

  25%,
  75% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tag-chip--flash {
    animation: none;
  }
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
  transition: opacity var(--duration-fast) linear;

  &:hover {
    opacity: 1;
  }
}

.tag-input-field {
  flex: 1;
  min-width: 120px;
  padding: 2px 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-foreground, var(--text-1));
  font-size: 0.875rem;

  &::placeholder {
    color: var(--color-muted-foreground, var(--text-2));
  }
}

.tag-count {
  flex-shrink: 0;
  color: var(--color-muted-foreground, var(--text-2));
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  white-space: nowrap;
  transition: color var(--duration-fast) linear;
}

.tag-count--full {
  color: var(--status-warning-ink);
  font-weight: 500;
}

.tag-hint {
  margin-top: 6px;
  color: var(--color-muted-foreground, var(--text-2));
  font-size: 0.75rem;
  line-height: 1.125rem;
  transition: color var(--duration-fast) linear;
}

.tag-hint--warn {
  color: var(--status-warning-ink);
}
</style>
