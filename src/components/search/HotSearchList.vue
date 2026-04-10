<script setup lang="ts">
import { ArrowUpRight, Flame } from 'lucide-vue-next'
import type { HotKeywordItem } from '@/api/video'

withDefaults(
  defineProps<{
    items: HotKeywordItem[]
    optionPrefix?: string
    offset?: number
    active?: number
    compact?: boolean
  }>(),
  { optionPrefix: '', offset: 0, active: -1, compact: false }
)
defineEmits<{ select: [keyword: string] }>()
</script>

<template>
  <div class="hot-search-list" :class="{ 'hot-search-list--compact': compact }">
    <button
      v-for="(item, index) in items"
      :id="optionPrefix ? `${optionPrefix}${offset + index}` : undefined"
      :key="item.keyword"
      type="button"
      :title="item.keyword"
      class="hot-search-list__item"
      :class="{ 'is-active': active === offset + index, 'is-leading': index < 3 }"
      :role="optionPrefix ? 'option' : undefined"
      :aria-selected="optionPrefix ? active === offset + index : undefined"
      :style="{ '--row-delay': `${Math.min(compact ? Math.floor(index / 2) : index, 5) * 24}ms` }"
      @mousedown.prevent
      @click="$emit('select', item.keyword)"
    >
      <span class="hot-search-list__rank" aria-hidden="true">{{
        String(index + 1).padStart(2, '0')
      }}</span>
      <span class="hot-search-list__keyword">{{ item.keyword }}</span>
      <Flame v-if="index === 0" class="hot-search-list__flame" :size="14" aria-hidden="true" />
      <ArrowUpRight class="hot-search-list__arrow" :size="15" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
.hot-search-list {
  display: grid;
  gap: 2px;
}
.hot-search-list__item {
  display: flex;
  gap: 13px;
  align-items: center;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 8px;
  text-align: left;
  border-radius: var(--radius-md);
  animation: hot-row-arrive 320ms var(--ease-out-expo) var(--row-delay) both;

  &:hover,
  &:focus-visible,
  &.is-active {
    background: var(--color-accent);
  }
  &:hover .hot-search-list__arrow,
  &:focus-visible .hot-search-list__arrow,
  &.is-active .hot-search-list__arrow {
    opacity: 1;
    transform: translate(0, 0);
  }
}
.hot-search-list__rank {
  flex: 0 0 25px;
  font-size: 17px;
  font-style: italic;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--color-muted-foreground);
}
.is-leading .hot-search-list__rank {
  color: var(--color-primary);
}
.hot-search-list__item:first-child .hot-search-list__rank {
  color: var(--status-danger-ink);
}
.hot-search-list__keyword {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hot-search-list__flame {
  flex-shrink: 0;
  color: var(--status-danger-ink);
}
.hot-search-list__arrow {
  flex-shrink: 0;
  color: var(--color-primary);
  opacity: 0;
  transform: translate(-3px, 3px);
  transition:
    opacity 160ms,
    transform 240ms var(--ease-out-expo);
}

.hot-search-list--compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 12px;

  .hot-search-list__item {
    position: relative;
    gap: 8px;
    min-height: 34px;
    padding: 6px 22px 6px 6px;
  }

  .hot-search-list__rank {
    flex-basis: 20px;
    font-size: 14px;
  }

  .hot-search-list__keyword {
    font-size: 12px;
    line-height: 22px;
  }

  .hot-search-list__arrow,
  .hot-search-list__flame {
    position: absolute;
    right: 5px;
    width: 12px;
    height: 12px;
  }

  .hot-search-list__item:hover .hot-search-list__flame,
  .hot-search-list__item:focus-visible .hot-search-list__flame,
  .hot-search-list__item.is-active .hot-search-list__flame {
    opacity: 0;
  }
}

@keyframes hot-row-arrive {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hot-search-list__item {
    animation: none;
  }
  .hot-search-list__arrow {
    transition: none;
    transform: none;
  }
}
</style>
