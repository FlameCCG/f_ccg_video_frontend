<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import ChannelNav from '@/components/layout/ChannelNav.vue'
import { BannerDisplay } from '@/constants/banner'

const route = useRoute()

/**
 * 顶部 chrome 跟随已显示的页面。
 * 首页与分区使用视频 banner 和 ChannelNav，热门与排行隐藏 ChannelNav，动态与历史使用 slim 顶栏。
 * 在 beforeEnter 同步 chrome：离场内容已卸载、入场内容尚未显现时更新布局；淡出期间维持头部和内容高度，避免跳动。
 */
const chromePath = ref(route.path)
const syncChrome = () => {
  chromePath.value = route.path
}

/**
 * 减少动效时 Transition 钩子可能无法可靠触发，因此同一路径另做一次 chrome 同步。
 * 同值赋值不会额外触发渲染，保证路由与顶栏状态一致。
 */
watch(
  () => route.path,
  () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) syncChrome()
  }
)

const hideChannelNav = computed(
  () => chromePath.value === '/dynamic' || chromePath.value === '/history'
)
const isTrendingPage = computed(() => ['/hot', '/rank'].includes(chromePath.value))

/**
 * 顶栏与内容共用 --shell-max 版心 token，保持左右边缘对齐。
 */
const shellMax = computed(() => {
  if (chromePath.value === '/dynamic') return 'var(--container-focus, 1140px)'
  if (isTrendingPage.value) return 'var(--container-reading, 1400px)'
  return 'var(--container-page, 1800px)'
})

const videoRef = useTemplateRef<HTMLVideoElement>('bannerVideo')
const mediaStageRef = useTemplateRef<HTMLElement>('bannerMedia')
const bannerVideoReady = shallowRef(false)
/** 与 Header / BannerDisplay.topHeight 同源，避免顶栏高度漂移 */
const topBannerStyle = { height: `${BannerDisplay.topHeight}px` }

let mouseEnterX = 0
let rafId = 0
let videoStartRafId = 0
let pendingShift = 0

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const flushParallax = () => {
  rafId = 0
  mediaStageRef.value?.style.setProperty('--parallax-x', `${pendingShift}px`)
}

const onBannerMouseEnter = (e: MouseEvent) => {
  if (prefersReducedMotion()) return
  mouseEnterX = e.clientX
  const el = mediaStageRef.value
  if (!el) return
  // 跟手期间不要过渡；will-change 只在真正会动的这段时间挂上
  el.classList.remove('is-releasing')
  el.style.willChange = 'transform'
}

const onBannerMouseMove = (e: MouseEvent) => {
  if (!mediaStageRef.value || prefersReducedMotion()) return
  // rAF 节流：高刷鼠标每秒可触发 500+ 次 mousemove，
  // 每次直写 style.transform 就是一次样式失效 + 一次重排候选。
  pendingShift = -(e.clientX - mouseEnterX) / 20
  if (rafId) return
  rafId = requestAnimationFrame(flushParallax)
}

const onBannerMouseLeave = () => {
  const el = mediaStageRef.value
  if (!el) return
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  pendingShift = 0
  el.classList.add('is-releasing')
  el.style.setProperty('--parallax-x', '0px')
}

const onReleaseEnd = () => {
  const el = mediaStageRef.value
  if (!el) return
  el.classList.remove('is-releasing')
  // 用完即摘：常驻 will-change 等于永久占着一张全宽视频的合成层纹理
  el.style.willChange = ''
}

/** 视频完成首帧解码后淡出主题骨架，下一帧再开始播放。 */
const onBannerVideoLoaded = () => {
  const video = videoRef.value
  if (!video || bannerVideoReady.value) return

  if (videoStartRafId) cancelAnimationFrame(videoStartRafId)
  videoStartRafId = requestAnimationFrame(() => {
    bannerVideoReady.value = true
    videoStartRafId = requestAnimationFrame(() => {
      videoStartRafId = 0
      void video.play().catch(() => {
        // 自动播放被浏览器策略阻止时，停在已解码的首帧也比露出空背景更稳定。
      })
    })
  })
}

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (videoStartRafId) cancelAnimationFrame(videoStartRafId)
})
</script>

<template>
  <div class="relative min-h-screen bg-background" :style="{ '--shell-max': shellMax }">
    <!-- Slim header for /dynamic (no video banner) -->
    <template v-if="hideChannelNav">
      <div class="slim-header relative z-50">
        <Navbar light />
      </div>
    </template>

    <!-- Full header with Video Banner for other pages -->
    <template v-else>
      <div
        class="banner-shell relative cursor-pointer"
        :style="topBannerStyle"
        @mouseenter="onBannerMouseEnter"
        @mousemove="onBannerMouseMove"
        @mouseleave="onBannerMouseLeave"
      >
        <div class="absolute inset-0 z-0 overflow-hidden">
          <div
            ref="bannerMedia"
            class="banner-media-stage pointer-events-none absolute inset-0"
            @transitionend="onReleaseEnd"
          >
            <video
              ref="bannerVideo"
              loop
              muted
              playsinline
              preload="auto"
              src="/banner-video.mp4"
              class="banner-media absolute inset-0"
              @loadeddata="onBannerVideoLoaded"
            />
          </div>
          <Transition name="banner-video-skeleton">
            <div
              v-if="!bannerVideoReady"
              class="banner-video-skeleton skeleton-shimmer absolute inset-0"
              role="status"
              aria-label="动态横幅加载中"
            />
          </Transition>
          <div class="banner-scrim absolute inset-0"></div>
        </div>
        <div class="relative z-50">
          <Navbar />
        </div>
      </div>
      <div v-if="!isTrendingPage" class="sticky top-0 z-40 w-full bg-background shadow-surface">
        <ChannelNav />
      </div>
    </template>

    <!-- Main Content Area -->
    <main>
      <RouterView v-slot="{ Component, route: current }">
        <!-- @before-enter：旧页已卸载、新页尚未淡入的那一帧同步顶部 chrome，见 chromePath 注释 -->
        <Transition name="route" mode="out-in" @before-enter="syncChrome">
          <component :is="Component" :key="current.path" />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<style scoped lang="scss">
.banner-media-stage {
  /* 图片与视频共用同一个变换层，交接时尺寸、裁切和视差坐标完全一致。 */
  background-color: var(--color-background);
  transform: translateX(var(--parallax-x, 0)) translateY(-4px) scale(1.15);
}

.banner-media-stage.is-releasing {
  transition: transform var(--duration-slow) var(--ease-out-quart);
}

.banner-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.banner-video-skeleton {
  z-index: 1;
  background-color: var(--skeleton-base);
}

.banner-video-skeleton-leave-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.banner-video-skeleton-leave-to {
  opacity: 0;
}

/*
 * 顶栏压暗层使用媒体叠色 token，与 Navbar 的文字和边框语义一致。
 */
.banner-scrim {
  background-image: linear-gradient(
    180deg,
    color-mix(in oklch, var(--media-overlay) 62%, transparent),
    color-mix(in oklch, var(--media-overlay) 16%, transparent) 46%,
    color-mix(in oklch, var(--media-overlay) 44%, transparent)
  );
}

.slim-header {
  background-color: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  border-bottom: 1px solid var(--border-color);
}

@media (prefers-reduced-motion: reduce) {
  .banner-media-stage {
    transform: translateY(-4px) scale(1.15);
  }

  .banner-video-skeleton-leave-active {
    transition: none;
  }
}
</style>
