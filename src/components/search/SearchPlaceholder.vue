<script setup lang="ts">
import { History, Search, TrendingUp } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    kind?: 'history' | 'hot' | 'suggest'
    loading?: boolean
    title: string
    description?: string
  }>(),
  { kind: 'hot', loading: false, description: '' }
)
</script>

<template>
  <div class="search-placeholder" :class="{ 'is-loading': loading }" role="status">
    <div class="search-placeholder__art" aria-hidden="true">
      <div class="search-placeholder__lines"><i></i><i></i><i></i></div>
      <span class="search-placeholder__symbol">
        <History v-if="kind === 'history'" :size="18" :stroke-width="1.5" />
        <Search v-else-if="kind === 'suggest'" :size="18" :stroke-width="1.5" />
        <TrendingUp v-else :size="18" :stroke-width="1.5" />
      </span>
    </div>
    <div class="search-placeholder__copy">
      <p>{{ title }}</p>
      <span v-if="description">{{ description }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.search-placeholder {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 66px;
  padding: 8px 4px;
  animation: placeholder-arrive 360ms var(--ease-out-expo) both;
}
.search-placeholder__art {
  position: relative;
  flex: 0 0 44px;
  height: 42px;
}
.search-placeholder__lines {
  display: grid;
  gap: 6px;
  padding: 7px 0;
  transform: rotate(-8deg);

  i {
    position: relative;
    height: 5px;
    overflow: hidden;
    background: color-mix(in oklch, var(--color-primary) 12%, var(--color-muted));
    border-radius: 8px;

    &:nth-child(2) {
      width: 78%;
    }
    &:nth-child(3) {
      width: 58%;
    }

    &::after {
      position: absolute;
      inset: 0;
      content: '';
      background: linear-gradient(
        90deg,
        transparent,
        color-mix(in oklch, var(--color-primary) 22%, transparent),
        transparent
      );
      transform: translateX(-100%);
      animation: placeholder-sweep 2.4s var(--ease-out-quart) 2;
    }
  }
}
.search-placeholder__symbol {
  position: absolute;
  right: 0;
  bottom: 0;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--color-primary);
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 50%;
}
.search-placeholder__copy {
  min-width: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-muted-foreground);

  p {
    margin: 0;
    color: var(--color-foreground);
  }
  span {
    display: block;
    margin-top: 3px;
    font-size: 12px;
  }
}
.is-loading .search-placeholder__lines i::after {
  animation-iteration-count: infinite;
}

@keyframes placeholder-sweep {
  to {
    transform: translateX(100%);
  }
}

@keyframes placeholder-arrive {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-placeholder,
  .search-placeholder__lines i::after {
    animation: none;
  }
}
</style>
