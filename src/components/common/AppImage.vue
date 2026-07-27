<script setup lang="ts">
/**
 * AppImage —— 全站图片统一收口（与 AppAvatar 平级）。
 *
 * 解决三件事：
 *  1. CLS —— 容器用 aspect-ratio 先把位置占住，图片解码完不再推挤布局；
 *  2. 加载体验 —— loading 态复用全局 .skeleton-shimmer，ready 后「显影」淡入
 *     （opacity + 1.5% 回落缩放，均为合成属性）；已缓存的图片直接判定 ready，不闪骨架；
 *  3. 失败兜底 —— 任何 404 / 解码失败都渲染 token 化的兜底面，绝不露浏览器碎图标。
 *
 * 注意：
 *  - 淡入的 transform 落在 .app-image__reveal 包裹层上，<img> 自身的 transform
 *    （例如 VideoCard 的 group-hover:scale-105，通过 imgClass 传入）不会被覆盖；
 *  - 尺寸只有两种正确用法：① 传 aspect，由外层 grid/父级决定宽度；
 *    ② 传 aspect="auto" 塞进一个已有确定尺寸的父级里（组件 height:100%）。
 *    根节点的 width:100% 来自 scoped 样式，优先级高于 Tailwind utility，
 *    需要固定宽度请在外面再包一层容器，不要往 AppImage 上写 w-40 之类。
 */
import { computed, nextTick, onMounted, ref, watch, type Component } from 'vue'
import { ImageOff } from 'lucide-vue-next'

type LoadState = 'loading' | 'ready' | 'failed'

const RADIUS_MAP = {
  none: '0px',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  '3xl': 'var(--radius-3xl)',
  full: '9999px',
} as const

interface Props {
  /** 图片地址。空串 / null / 字符串 'null' | 'undefined' 一律直接进兜底态。 */
  src?: string | null
  /** 必填：封面传标题，纯装饰传空串 ''。 */
  alt: string
  /**
   * 宽高比，如 '16 / 9'、'1 / 1'、'220 / 60'。
   * 传 'auto' 表示由父级决定尺寸（组件自身 height:100%），此时父级必须有确定高度。
   */
  aspect?: string | number
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
  objectPosition?: string
  /** 圆角 token；默认 none（通常由外层容器 overflow-hidden + rounded 控制）。 */
  rounded?: keyof typeof RADIUS_MAP
  /** 是否主动加载；默认 lazy。未指定 fetchPriority 时，eager 图片同时使用 high。 */
  eager?: boolean
  /** 资源请求优先级；轮播预加载可用 low，避免与当前首图争抢带宽。 */
  fetchPriority?: 'high' | 'low' | 'auto'
  /** 兜底态图标，默认 lucide ImageOff。 */
  fallbackIcon?: Component
  /** 兜底态可选说明文字（仅建议在 ≥160px 的图上使用）。 */
  fallbackText?: string
  /** 透传给内层 <img> 的 class（hover 缩放等写这里，不要写在根上）。 */
  imgClass?: string
  /** 兜底面是否使用 .banner-fallback 渐变（大横幅场景更好看）。 */
  fallbackVariant?: 'muted' | 'banner'
  /** 关闭显影动画（例如已经被父级动画接管时）。 */
  reveal?: boolean
  /** 是否显示组件内部加载骨架；父级自行接管加载交接时可关闭。 */
  showLoading?: boolean
}

interface Emits {
  loaded: []
  failed: []
}

const props = withDefaults(defineProps<Props>(), {
  src: '',
  aspect: '16 / 9',
  objectFit: 'cover',
  objectPosition: 'center',
  rounded: 'none',
  eager: false,
  fetchPriority: undefined,
  fallbackIcon: () => ImageOff,
  fallbackText: undefined,
  imgClass: undefined,
  fallbackVariant: 'muted',
  reveal: true,
  showLoading: true,
})

const emit = defineEmits<Emits>()
const imgRef = ref<HTMLImageElement | null>(null)

const normalizedSrc = computed(() => {
  const candidate = props.src?.trim() ?? ''
  return /^(null|undefined)$/i.test(candidate) ? '' : candidate
})

const state = ref<LoadState>(normalizedSrc.value ? 'loading' : 'failed')

const isFill = computed(() => String(props.aspect) === 'auto')

const rootStyle = computed(() => ({
  aspectRatio: isFill.value ? undefined : String(props.aspect),
  // rounded='none' 时不写 inline border-radius，免得压掉调用方自己的 rounded-* utility
  borderRadius: props.rounded === 'none' ? undefined : RADIUS_MAP[props.rounded],
}))

const imgStyle = computed(() => ({
  objectFit: props.objectFit,
  objectPosition: props.objectPosition,
}))

const settle = (next: Exclude<LoadState, 'loading'>) => {
  if (state.value === next) return
  state.value = next
  if (next === 'ready') {
    emit('loaded')
  } else {
    emit('failed')
  }
}

/**
 * load 只表示资源已下载，decoding="async" 仍可能尚未完成像素解码。
 * loaded 事件必须等 decode 完成后再抛给父级，否则父级会过早切换并露出一帧占位层。
 */
const settleDecodedImage = async (el: HTMLImageElement) => {
  const expectedSrc = normalizedSrc.value
  try {
    await el.decode()
  } catch {
    // 部分浏览器会对已经可绘制的缓存图拒绝 decode，naturalWidth 仍可作为成功兜底。
  }

  if (el !== imgRef.value || normalizedSrc.value !== expectedSrc) return
  settle(el.naturalWidth > 0 ? 'ready' : 'failed')
}

/** 命中 HTTP / 内存缓存的图片不会再触发 load 事件，直接读 complete 避免闪一下骨架 */
const settleFromCache = () => {
  if (state.value !== 'loading') return
  const el = imgRef.value
  if (!el || !el.complete) return
  if (el.naturalWidth > 0) {
    void settleDecodedImage(el)
  } else {
    settle('failed')
  }
}

watch(normalizedSrc, (next) => {
  state.value = next ? 'loading' : 'failed'
  if (next) void nextTick(settleFromCache)
})

onMounted(settleFromCache)

const handleLoad = () => {
  const el = imgRef.value
  if (el) void settleDecodedImage(el)
}

const handleError = () => {
  settle('failed')
}
</script>

<template>
  <div
    class="app-image"
    :class="{ 'app-image--fill': isFill, 'app-image--flat': !reveal }"
    :style="rootStyle"
  >
    <!-- 骨架垫在图片下层：图片在它上面「显影」，扫光不会盖住正在淡入的画面 -->
    <Transition name="app-image-veil">
      <div
        v-if="showLoading && state === 'loading'"
        class="app-image__veil skeleton-shimmer"
        aria-hidden="true"
      />
    </Transition>

    <div
      v-if="normalizedSrc && state !== 'failed'"
      class="app-image__reveal"
      :class="{ 'app-image__reveal--ready': state === 'ready' }"
    >
      <img
        :key="normalizedSrc"
        ref="imgRef"
        class="app-image__img"
        :class="imgClass"
        :style="imgStyle"
        :src="normalizedSrc"
        :alt="alt"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="fetchPriority ?? (eager ? 'high' : 'auto')"
        decoding="async"
        draggable="false"
        @load="handleLoad"
        @error="handleError"
      />
    </div>

    <div
      v-if="state === 'failed'"
      class="app-image__fallback"
      :class="{ 'banner-fallback': fallbackVariant === 'banner' }"
      :role="alt ? 'img' : undefined"
      :aria-label="alt || undefined"
    >
      <slot name="fallback">
        <component
          :is="fallbackIcon"
          class="app-image__fallback-icon"
          :stroke-width="1.5"
          aria-hidden="true"
        />
        <span v-if="fallbackText" class="app-image__fallback-text">{{ fallbackText }}</span>
      </slot>
    </div>

    <!-- 角标 / 进度条 / hover 遮罩等叠层 -->
    <slot />
  </div>
</template>

<style scoped lang="scss">
.app-image {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  background-color: var(--color-muted);
  isolation: isolate;
}

.app-image--fill {
  height: 100%;
}

.app-image__reveal {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: scale(1.015);
  transition:
    opacity var(--duration-slow) var(--ease-out-quart),
    transform var(--duration-slow) var(--ease-out-expo);
}

.app-image__reveal--ready {
  opacity: 1;
  transform: none;
}

/* reveal 关闭时只留即时显示，不做位移 */
.app-image--flat .app-image__reveal {
  transform: none;
  transition: none;
}

.app-image__img {
  display: block;
  width: 100%;
  height: 100%;
}

.app-image__veil {
  position: absolute;
  inset: 0;
}

.app-image-veil-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.app-image-veil-leave-to {
  opacity: 0;
}

.app-image__fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  color: var(--color-muted-foreground);
  background-color: var(--color-muted);
  background-image: radial-gradient(
    circle at 50% 44%,
    color-mix(in oklch, var(--color-foreground) 5%, transparent),
    transparent 64%
  );
  animation: app-image-fallback-in var(--duration-normal) var(--ease-out-quart) both;
}

/* banner 变体：背景走 .banner-fallback 的品牌渐变，这里只关掉自带底色 */
.app-image__fallback.banner-fallback {
  background-color: transparent;
}

.app-image__fallback-icon {
  width: 22px;
  height: 22px;
  opacity: 0.55;
}

.app-image__fallback-text {
  padding-inline: 8px;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

@keyframes app-image-fallback-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-image__reveal,
  .app-image__reveal--ready {
    transform: none;
  }

  .app-image__fallback {
    opacity: 1;
    animation: none;
  }
}
</style>
