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
    :aria-label="copied ? '回复已复制' : '复制回复'"
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
  padding: 6px 8px;
  margin-left: -8px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 11px;
}
.message-copy:hover {
  background: var(--bg-surface-2);
  color: var(--text-1);
}
</style>
