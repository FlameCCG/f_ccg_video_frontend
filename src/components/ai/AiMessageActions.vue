<script setup lang="ts">
import { shallowRef, onBeforeUnmount } from 'vue'
import { Copy, Check } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{ content: string }>()
const copied = shallowRef(false)
let timer: ReturnType<typeof setTimeout> | undefined
const copy = async () => {
  try {
    await navigator.clipboard.writeText(props.content)
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      copied.value = false
    }, 1800)
  } catch {
    toast.error('复制失败，请手动选择文字复制')
  }
}
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <button
    type="button"
    class="message-copy"
    :class="{ 'message-copy--copied': copied }"
    :aria-label="copied ? '回复已复制' : '复制回复'"
    :title="copied ? '回复已复制' : '复制回复'"
    @click="copy"
  >
    <Check v-if="copied" :size="13" /><Copy v-else :size="13" />
    <span aria-live="polite">{{ copied ? '已复制' : '复制' }}</span>
  </button>
</template>

<style scoped lang="scss">
.message-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  min-height: 30px;
  padding: 6px 10px;
  margin-left: -4px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 11px;
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}
.message-copy:hover {
  background: var(--bg-surface-1);
  border-color: var(--border-color);
  color: var(--text-1);
}
.message-copy--copied {
  color: var(--brand-blue);
  background: var(--accent-surface);
}
@media (prefers-reduced-motion: reduce) {
  .message-copy {
    transition: none;
  }
}
</style>
