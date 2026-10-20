<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDown, Brain, Check, ChevronDown, CirclePause } from 'lucide-vue-next'

const props = defineProps<{
  content: string
  state: 'thinking' | 'writing' | 'done' | 'stopped' | 'error'
}>()

const expanded = ref(false)
const contentRef = ref<HTMLElement | null>(null)
const followTail = ref(true)
const thinking = computed(() => props.state === 'thinking')
const interrupted = computed(() => props.state === 'stopped' || props.state === 'error')
const heading = computed(() =>
  thinking.value ? '思路正在展开' : interrupted.value ? '已保留思考过程' : '思考已就绪'
)
const statusLabel = computed(() =>
  thinking.value ? '思考中' : props.state === 'error' ? '已中断' : props.state === 'stopped' ? '已停止' : '已完成'
)
const preview = computed(() => {
  const text = props.content.trim().replace(/\s+/g, ' ')
  return thinking.value && text.length > 100 ? `…${text.slice(-100)}` : text.slice(0, 160)
})

const scrollToLatest = async () => {
  followTail.value = true
  await nextTick()
  const el = contentRef.value
  if (el) el.scrollTop = el.scrollHeight
}
const handleScroll = () => {
  const el = contentRef.value
  if (el) followTail.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}
const handleToggle = (event: Event) => {
  expanded.value = (event.target as HTMLDetailsElement).open
  if (expanded.value && thinking.value) void scrollToLatest()
}
watch(
  () => props.content,
  () => {
    if (expanded.value && thinking.value && followTail.value) void scrollToLatest()
  },
  { flush: 'post' }
)
</script>

<template>
  <details
    class="reasoning-panel"
    :class="{ 'reasoning-panel--live': thinking, 'reasoning-panel--interrupted': interrupted }"
    @toggle="handleToggle"
  >
    <summary class="reasoning-panel__summary">
      <span class="reasoning-panel__icon" aria-hidden="true">
        <Brain v-if="thinking" :size="18" :stroke-width="1.5" />
        <CirclePause v-else-if="interrupted" :size="18" :stroke-width="1.5" />
        <Check v-else :size="18" :stroke-width="1.5" />
      </span>
      <span class="reasoning-panel__heading">
        <strong>{{ heading }}</strong>
        <span>{{ expanded ? '收起思考过程' : '展开，看看思路如何形成' }}</span>
      </span>
      <span class="reasoning-panel__status" role="status">
        <span v-if="thinking" class="reasoning-panel__wave" aria-hidden="true"><i></i><i></i><i></i></span>
        {{ statusLabel }}
      </span>
      <ChevronDown :size="14" class="reasoning-panel__chevron" aria-hidden="true" />
      <span class="reasoning-panel__preview">{{ preview }}</span>
    </summary>
    <div class="reasoning-panel__body">
      <div
        ref="contentRef"
        class="reasoning-panel__content"
        tabindex="0"
        role="region"
        aria-label="思考过程"
        @scroll.passive="handleScroll"
      >{{ content }}</div>
      <div class="reasoning-panel__footer">
        <span>{{ thinking ? '思路持续更新中' : interrupted ? '以上为中断前的思考内容' : '从思考到答案，每一步都有迹可循' }}</span>
        <button v-if="thinking && !followTail" type="button" @click="scrollToLatest">
          <ArrowDown :size="12" />最新思路
        </button>
      </div>
    </div>
  </details>
</template>

<style scoped lang="scss">
.reasoning-panel {
  position: relative;
  width: 100%;
  overflow: hidden;
  color: var(--text-2);
  background: linear-gradient(120deg, color-mix(in oklch, var(--brand-blue) 5%, var(--bg-surface-0)), var(--bg-surface-0));
  border: 1px solid color-mix(in oklch, var(--brand-blue) 16%, var(--border-color));
  border-radius: 16px;

  &::before {
    position: absolute;
    top: 0;
    left: 18px;
    width: 54px;
    height: 2px;
    background: color-mix(in oklch, var(--brand-blue) 45%, transparent);
    border-radius: 0 0 3px 3px;
    content: '';
  }
  &--live::before {
    width: 90px;
    background: linear-gradient(90deg, transparent, var(--brand-blue), var(--brand-pink), transparent);
    animation: reasoning-light 2.6s ease-in-out infinite;
  }
  &__summary {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto 14px;
    align-items: center;
    gap: 10px;
    padding: 15px 16px;
    cursor: pointer;
    list-style: none;
  }
  &__summary::-webkit-details-marker { display: none; }
  &__summary:hover { background: color-mix(in oklch, var(--brand-blue) 3%, transparent); }
  &__summary:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: -3px; border-radius: 14px; }
  &__icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    color: var(--brand-blue);
    background: color-mix(in oklch, var(--brand-blue) 8%, var(--bg-surface-0));
    border: 1px solid color-mix(in oklch, var(--brand-blue) 13%, transparent);
    border-radius: 11px;
  }
  &__heading { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  &__heading strong { color: var(--text-1); font-size: 12px; font-weight: 550; letter-spacing: 0.02em; }
  &__heading > span { font-size: 10px; }
  &__status { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-size: 10px; white-space: nowrap; }
  &--live &__status { color: var(--brand-blue); }
  &__wave { display: flex; align-items: center; gap: 2px; height: 12px; }
  &__wave i { width: 2px; height: 9px; background: currentColor; border-radius: 2px; animation: reasoning-wave 1s ease-in-out infinite; }
  &__wave i:nth-child(2) { animation-delay: 150ms; }
  &__wave i:nth-child(3) { animation-delay: 300ms; }
  &__chevron { transition: transform 200ms ease; }
  &[open] &__chevron { transform: rotate(180deg); }
  &__preview { display: -webkit-box; grid-column: 2 / -1; overflow: hidden; font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  &[open] &__preview { display: none; }
  &__body { margin: 0 16px; border-top: 1px solid color-mix(in oklch, var(--border-color) 65%, transparent); }
  &__content {
    max-height: 260px;
    padding: 16px 10px 16px 17px;
    margin: 12px 0;
    overflow: auto;
    border-left: 1px solid color-mix(in oklch, var(--brand-blue) 25%, var(--border-color));
    font-size: 12px;
    line-height: 1.95;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color) transparent;
  }
  &__content:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: -2px; }
  &__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 34px; padding: 0 0 10px; font-size: 9px; }
  &__footer button { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 5px 7px; color: var(--brand-blue); background: var(--accent-surface); border-radius: 6px; }
}
@keyframes reasoning-light {
  0%, 100% { opacity: 0.4; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(80px); }
}
@keyframes reasoning-wave {
  0%, 100% { transform: scaleY(0.45); }
  50% { transform: scaleY(1); }
}
@media (width <= 600px) {
  .reasoning-panel {
    &__summary { grid-template-columns: 30px minmax(0, 1fr) auto 12px; gap: 7px; padding: 12px; }
    &__icon { width: 30px; height: 30px; border-radius: 9px; }
    &__heading > span { display: none; }
    &__preview { grid-column: 1 / -1; }
    &__body { margin: 0 12px; }
    &__content { max-height: 200px; padding-left: 12px; }
  }
}
@media (prefers-reduced-motion: reduce) {
  .reasoning-panel--live::before, .reasoning-panel__wave i { animation: none; }
  .reasoning-panel__chevron { transition: none; }
}
</style>
