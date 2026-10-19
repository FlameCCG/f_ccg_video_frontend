<script setup lang="ts">
/**
 * 初始异步路由的唯一收口点。
 *
 * Vue 先挂载并替换 index.html 的静态启动提示，再由本组件等待首个 layout / view
 * 分包解析。快速加载不显示任何占位；较慢时显示品牌开场动画；失败时给出明确重试入口。
 */
import { onBeforeUnmount, shallowRef } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import { AlertTriangle, RotateCcw } from 'lucide-vue-next'
import PageOpening from './PageOpening.vue'

type InitialRouteState = 'pending' | 'ready' | 'error'

const router = useRouter()
const initialRouteState = shallowRef<InitialRouteState>('pending')
const PENDING_DELAY = 180
// 从导航开始计时，慢速下载后 Vue 接管时不再重复等待。
const showPending = shallowRef(performance.now() >= PENDING_DELAY)
let pendingTimer: ReturnType<typeof setTimeout> | undefined

const settle = (state: Exclude<InitialRouteState, 'pending'>) => {
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    pendingTimer = undefined
  }
  showPending.value = false
  initialRouteState.value = state
}

pendingTimer = setTimeout(
  () => {
    showPending.value = true
  },
  Math.max(0, PENDING_DELAY - performance.now())
)

void router
  .isReady()
  .then(() => settle('ready'))
  .catch((error: unknown) => {
    console.error('Initial route failed to load:', error)
    settle('error')
  })

const retry = () => {
  window.location.reload()
}

onBeforeUnmount(() => {
  if (pendingTimer) clearTimeout(pendingTimer)
})
</script>

<template>
  <RouterView v-if="initialRouteState === 'ready'" />

  <main
    v-if="initialRouteState === 'error'"
    class="initial-route-state"
    aria-labelledby="initial-route-error-title"
  >
    <div class="initial-route-state__error">
      <span class="initial-route-state__error-icon" aria-hidden="true">
        <AlertTriangle class="h-5 w-5" />
      </span>
      <div>
        <h1 id="initial-route-error-title" class="initial-route-state__title">页面没有加载成功</h1>
        <p class="initial-route-state__description">可能是网络波动，请重新加载页面。</p>
      </div>
      <button type="button" class="initial-route-state__retry" @click="retry">
        <RotateCcw class="h-4 w-4" />
        重新加载
      </button>
    </div>
  </main>

  <Transition name="initial-opening">
    <main
      v-if="initialRouteState === 'pending'"
      class="initial-route-state initial-route-state--pending"
      aria-busy="true"
      aria-label="页面加载中"
    >
      <PageOpening v-if="showPending" />
    </main>
  </Transition>
</template>

<style scoped lang="scss">
.initial-route-state {
  display: grid;
  min-height: 100svh;
  place-items: center;
  padding: 1.5rem;
  background-color: var(--color-background);
}

.initial-route-state--pending {
  position: fixed;
  inset: 0;
  z-index: 80;
  padding: 0;
}

.initial-opening-leave-active {
  pointer-events: none;
  transition: opacity 240ms var(--ease-out-quart);
}

.initial-opening-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .initial-opening-leave-active {
    transition: none;
  }
}

.initial-route-state__error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.875rem;
  align-items: center;
  width: min(30rem, 100%);
  padding: 1.25rem;
  border: 1px solid var(--status-danger-border);
  border-radius: var(--radius-xl);
  background-color: var(--color-card);
  box-shadow: var(--shadow-raised);
}

.initial-route-state__error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: var(--radius-lg);
  background-color: var(--status-danger-soft);
  color: var(--status-danger-ink);
}

.initial-route-state__title {
  color: var(--color-foreground);
  font-size: 0.9375rem;
  font-weight: 600;
}

.initial-route-state__description {
  margin-top: 0.25rem;
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
}

.initial-route-state__retry {
  display: inline-flex;
  grid-column: 2;
  gap: 0.5rem;
  align-items: center;
  justify-content: center;
  justify-self: start;
  min-height: 2.5rem;
  padding: 0 0.875rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-foreground);
  font-size: 0.8125rem;
  font-weight: 500;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .initial-route-state__retry:hover {
    border-color: color-mix(in oklch, var(--color-primary) 50%, var(--color-border));
    background-color: color-mix(in oklch, var(--color-primary) 6%, var(--color-card));
  }
}
</style>
