<script setup lang="ts">
/**
 * InfiniteScroll —— 滚动加载容器。
 *
 * 相比旧版补了三件事：
 *  1. 首屏骨架 ↔ 内容的交叉淡出（#skeleton 插槽 + initialLoading），不再「啪」地硬切；
 *  2. 底部状态区高度恒定 + 状态间过渡，spinner / 终止态不再凭空冒出、也不推挤布局，
 *     因此哨兵位置在状态切换时不动，不会误触发下一页；
 *  3. 内容不足一屏时能继续补齐（loading 落回 false 后重新武装 observer，
 *     带 MAX_AUTO_FILL 上限防止父组件不置 finished 时空转）。
 *
 * 事件与旧版完全兼容：props loading / finished / threshold，emit loadMore。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'

interface Props {
  /** 分页加载中（追加数据）。 */
  loading?: boolean
  /** 已无更多数据，展示终止态并停止触发。 */
  finished?: boolean
  /** 提前量（px），哨兵进入视口下方多少距离时开始加载。 */
  threshold?: number
  /** 临时停用（例如列表处于错误态、tab 未激活）。 */
  disabled?: boolean
  /** 首屏加载中：渲染 #skeleton 插槽，并抑制 loadMore。 */
  initialLoading?: boolean
  loadingText?: string
  finishedText?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  finished: false,
  threshold: 200,
  disabled: false,
  initialLoading: false,
  loadingText: '正在加载…',
  finishedText: '没有更多内容了',
})

const emit = defineEmits<{
  loadMore: []
}>()

const sentinelRef = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null

/** 骨架 ↔ 内容 out-in 切换期间内容会短暂离场，页面高度塌陷会把哨兵推进视口，需屏蔽 */
const swapping = ref(false)

/** 连续「加载完立刻又触发」的次数上限，防止父组件忘记置 finished 时空转 */
const MAX_AUTO_FILL = 8
let autoFillCount = 0

const canLoad = () =>
  !props.loading && !props.finished && !props.disabled && !props.initialLoading && !swapping.value

const handleIntersect = (entries: IntersectionObserverEntry[]) => {
  const entry = entries[entries.length - 1]
  if (!entry) return

  if (!entry.isIntersecting) {
    autoFillCount = 0
    return
  }

  if (canLoad()) emit('loadMore')
}

const disconnect = () => {
  observer?.disconnect()
  observer = null
}

const connect = () => {
  const el = sentinelRef.value
  if (!el || observer) return
  observer = new IntersectionObserver(handleIntersect, {
    rootMargin: `0px 0px ${props.threshold}px 0px`,
  })
  observer.observe(el)
}

/** 重新武装：哨兵若仍在视口内会立刻再触发一次，用于补满不足一屏的列表 */
const refresh = () => {
  disconnect()
  connect()
}

const rearm = () => {
  if (!canLoad()) return
  if (autoFillCount >= MAX_AUTO_FILL) return
  autoFillCount += 1
  refresh()
}

watch(
  () => props.loading,
  (now, prev) => {
    if (prev && !now) void nextTick(rearm)
  }
)

watch(
  () => props.initialLoading,
  (now, prev) => {
    if (prev && !now) {
      autoFillCount = 0
      void nextTick(refresh)
    }
  }
)

watch(
  () => props.threshold,
  () => refresh()
)

const handleSwapStart = () => {
  swapping.value = true
}

const handleSwapEnd = () => {
  swapping.value = false
  // 交换期间 canLoad() 恒为 false，交换结束后补一次判定，保证不足一屏时能继续补齐
  void nextTick(rearm)
}

onMounted(connect)
onBeforeUnmount(disconnect)

defineExpose({
  /** 列表被重置（切 tab / 换筛选）后调用，重新武装哨兵 */
  refresh: () => {
    autoFillCount = 0
    refresh()
  },
})
</script>

<template>
  <div class="infinite-scroll">
    <!-- 交接动画用全局 .skeleton-swap-*（main.scss），页面里自己写 v-if 的骨架区块
         （如首页 hero 精选位）挂同一个 name 就能与这里同步 -->
    <Transition
      name="skeleton-swap"
      mode="out-in"
      @before-leave="handleSwapStart"
      @after-enter="handleSwapEnd"
      @enter-cancelled="handleSwapEnd"
    >
      <div v-if="initialLoading" key="skeleton" class="is-pane">
        <slot name="skeleton" />
      </div>
      <div v-else key="content" class="is-pane">
        <slot />
      </div>
    </Transition>

    <div ref="sentinelRef" class="is-sentinel" aria-hidden="true"></div>

    <!-- 高度恒定的状态区：内部绝对定位切换，容器高度不变 → 哨兵位置不动 -->
    <div v-if="!initialLoading" class="is-foot" role="status" aria-live="polite">
      <Transition name="is-foot-swap">
        <div v-if="loading" key="loading" class="is-foot__slot">
          <slot name="loading">
            <Loader2
              class="is-foot__spinner h-4 w-4 animate-spin text-primary"
              aria-hidden="true"
            />
            <span class="is-foot__text">{{ loadingText }}</span>
          </slot>
        </div>

        <div v-else-if="finished" key="finished" class="is-foot__slot">
          <slot name="finished">
            <span class="is-foot__rule" aria-hidden="true"></span>
            <span class="is-foot__text is-foot__text--end">{{ finishedText }}</span>
            <span class="is-foot__rule is-foot__rule--end" aria-hidden="true"></span>
          </slot>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped lang="scss">
.is-sentinel {
  width: 100%;
  height: 1px;
}

/* 骨架 ↔ 内容的交接曲线在 main.scss 的 .skeleton-swap-*：
   它要被首页 hero 这类「页面自己写 v-if」的骨架区块复用，留在 scoped 里就只有本组件能用。 */

.is-foot {
  position: relative;
  min-height: 56px;
}

.is-foot__slot {
  position: absolute;
  inset: 0;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
}

.is-foot__text {
  font-size: 0.8125rem;
  color: var(--color-muted-foreground);
}

.is-foot__text--end {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  opacity: 0.85;
}

/* 终止态：文案两侧各一条向外淡出的发丝线，比一行孤零零的灰字体面 */
.is-foot__rule {
  display: block;
  width: clamp(28px, 14%, 104px);
  height: 1px;
  background-image: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklch, var(--color-foreground) 16%, transparent)
  );
}

.is-foot__rule--end {
  transform: scaleX(-1);
}

.is-foot-swap-enter-active {
  transition:
    opacity var(--duration-normal) var(--ease-out-quart),
    transform var(--duration-normal) var(--ease-out-quart);
}

.is-foot-swap-leave-active {
  transition:
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) linear;
}

.is-foot-swap-enter-from {
  opacity: 0;
  transform: translate3d(0, 6px, 0);
}

.is-foot-swap-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0);
}

/* 全局 reduced-motion guard 会把 animation 冻结成 1 帧，转不动的 spinner 反而像坏了 */
@media (prefers-reduced-motion: reduce) {
  .is-foot__spinner {
    display: none;
  }
}
</style>
