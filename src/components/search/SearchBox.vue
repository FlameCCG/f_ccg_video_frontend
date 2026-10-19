<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { Search } from 'lucide-vue-next'
import SearchDiscoveryPanel from './SearchDiscoveryPanel.vue'
import { useHotSearch } from '@/composables/useHotSearch'
import { getSearchSuggest, type SearchSuggestItem } from '@/api/video'
import { useSearchHistory } from '@/composables/useSearchHistory'

withDefaults(defineProps<{ overlay?: boolean; large?: boolean; placeholder?: string }>(), {
  overlay: false,
  large: false,
  placeholder: '搜索视频、UP主...',
})
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ submit: [keyword: string] }>()
const id = useId()
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const open = ref(false)
const active = ref(-1)
const suggestions = ref<SearchSuggestItem[]>([])
const { hot, loading: hotLoading, failed: hotFailed, refresh: refreshHot } = useHotSearch()
const suggestLoading = ref(false)
const suggestFailed = ref(false)
const { history, addHistory, removeHistoryItem, clearHistory } = useSearchHistory()
let sequence = 0
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false

const options = computed(() =>
  model.value.trim()
    ? suggestions.value.map((item) => ({
        value: item.value,
        highlight: item.highlight,
        kind: 'suggest',
      }))
    : [
        ...history.value.map((value) => ({ value, highlight: '', kind: 'history' })),
        ...hot.value.map((item) => ({ value: item.keyword, highlight: '', kind: 'hot' })),
      ]
)
const expanded = computed(() => open.value)
watch(options, () => {
  active.value = -1
})

const removeHistory = (keyword: string) => {
  removeHistoryItem(keyword)
  input.value?.focus()
}
const clearSearchHistory = () => {
  clearHistory()
  input.value?.focus()
}

watch(
  model,
  (value) => {
    const request = ++sequence
    clearTimeout(timer)
    active.value = -1
    suggestions.value = []
    const prefix = value.trim()
    suggestLoading.value = Boolean(prefix)
    suggestFailed.value = false
    if (!prefix) return
    timer = setTimeout(async () => {
      try {
        const list = await getSearchSuggest({ prefix }, { silent: true })
        if (disposed || request !== sequence) return
        const seen = new Set<string>()
        suggestions.value = list.filter((item) => {
          if (!item.value || seen.has(item.value)) return false
          seen.add(item.value)
          return true
        })
      } catch {
        if (!disposed && request === sequence) {
          suggestions.value = []
          suggestFailed.value = true
        }
      } finally {
        if (!disposed && request === sequence) suggestLoading.value = false
      }
    }, 100)
  },
  { immediate: true }
)

const submit = (value = model.value) => {
  const keyword = value.trim()
  if (!keyword) return
  model.value = keyword
  addHistory(keyword)
  open.value = false
  active.value = -1
  emit('submit', keyword)
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    open.value = false
    active.value = -1
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    if (!options.value.length) return
    active.value =
      active.value < 0
        ? event.key === 'ArrowDown'
          ? 0
          : options.value.length - 1
        : (active.value + (event.key === 'ArrowDown' ? 1 : -1) + options.value.length) %
          options.value.length
    void nextTick(() =>
      document.getElementById(`${id}-option-${active.value}`)?.scrollIntoView({ block: 'nearest' })
    )
  } else if (event.key === 'Enter') {
    event.preventDefault()
    submit(expanded.value && active.value >= 0 ? options.value[active.value]?.value : model.value)
  }
}

const closeOutside = (event: PointerEvent) => {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
const handleFocusOut = (event: FocusEvent) => {
  if (!root.value?.contains(event.relatedTarget as Node | null)) open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', closeOutside)
})
onBeforeUnmount(() => {
  disposed = true
  sequence += 1
  clearTimeout(timer)
  document.removeEventListener('pointerdown', closeOutside)
})
defineExpose({ focus: () => input.value?.focus(), submit })
</script>

<template>
  <div
    ref="root"
    class="search-box"
    :class="{ 'search-box--overlay': overlay, 'search-box--large': large }"
    @focusout="handleFocusOut"
  >
    <Search class="search-box__icon" aria-hidden="true" />
    <input
      :id="`${id}-input`"
      ref="input"
      v-model="model"
      class="search-box__input field-control"
      type="search"
      role="combobox"
      aria-label="搜索视频或 UP 主"
      aria-autocomplete="list"
      :aria-expanded="expanded"
      :aria-controls="`${id}-list`"
      :aria-activedescendant="expanded && active >= 0 ? `${id}-option-${active}` : undefined"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="open = true"
      @click="open = true"
      @input="open = true"
      @keydown="handleKeydown"
    />
    <Transition name="search-panel">
      <SearchDiscoveryPanel
        v-if="expanded"
        :id="id"
        class="search-box__panel"
        :query="model"
        :history="history"
        :hot="hot"
        :suggestions="suggestions"
        :active="active"
        :hot-loading="hotLoading"
        :hot-failed="hotFailed"
        :suggest-loading="suggestLoading"
        :suggest-failed="suggestFailed"
        @select="submit"
        @remove="removeHistory"
        @clear="clearSearchHistory"
        @retry="refreshHot"
      />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.search-box {
  position: relative;
  min-width: 0;
  color: var(--color-muted-foreground);
}
.search-box__icon {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 14px;
  width: 18px;
  height: 18px;
  pointer-events: none;
  transform: translateY(-50%);
}
.search-box__input {
  width: 100%;
  height: 40px;
  padding: 8px 14px 8px 40px;
  font-size: 14px;
  border-radius: var(--radius-full, 9999px);
}
.search-box:focus-within .search-box__icon {
  color: var(--field-border-focus);
}
.search-box--large .search-box__input {
  height: 48px;
  font-size: 16px;
  border-radius: var(--radius-lg);
}
.search-box__panel {
  position: absolute;
  z-index: 100;
  top: calc(100% + 8px);
  right: 0;
  left: 0;
  max-height: min(560px, 70dvh);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  transform-origin: top center;
  overflow: auto;
  color: var(--color-popover-foreground);
  background-color: var(--color-popover);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  box-shadow:
    var(--shadow-overlay),
    0 24px 64px -24px color-mix(in oklch, var(--color-foreground) 18%, transparent);
}
.search-panel-enter-active {
  transition:
    opacity 220ms ease-out,
    transform 360ms var(--ease-out-expo);
}
.search-panel-leave-active {
  pointer-events: none;
  transition:
    opacity 140ms ease-in,
    transform 180ms var(--ease-out-quart);
}
.search-panel-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}
.search-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.99);
}

@media (prefers-reduced-motion: reduce) {
  .search-panel-enter-active,
  .search-panel-leave-active {
    transition: none;
  }
  .search-panel-enter-from,
  .search-panel-leave-to {
    transform: none;
  }
}
</style>
