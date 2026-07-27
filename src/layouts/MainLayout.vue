<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import ChannelNav from '@/components/layout/ChannelNav.vue'
import { BannerDisplay } from '@/constants/banner'

const route = useRoute()

/**
 * 顶部 chrome 跟随的是「已经显示出来的那一页」，而不是导航目标。
 *
 * MainLayout 的头部会随路由换形态：首页/分区是 200px 视频 banner + ChannelNav，
 * /hot·/rank 去掉 ChannelNav，/dynamic·/history 换成 56px 的 slim 顶栏。
 * 这些 v-if 原来直接读 route.path —— 路由一变就立刻生效，而内容区的 out-in
 * 转场这时才刚开始播 140ms 的离场。于是正在淡出的卡片脚下被抽掉约 300px，
 * 整块「飞」到上面去，这就是动态/历史点进去那一下的观感。
 * （消息/创作中心/收藏会直接换整套 layout，不经过这里的内容区转场。）
 *
 * 这里把 chrome 的切换点挪到 beforeEnter —— 旧内容已移除、新内容还是 opacity:0
 * 的那一帧。淡出期间头部保持原样，
 * 内容不再被抽走脚下的空间；相位与 .route-* 的时序天然对齐，不用写死时长。
 */
const chromePath = ref(route.path)
const syncChrome = () => {
  chromePath.value = route.path
}

/**
 * 兜底：Transition 的钩子只在真的有过渡时才可靠触发。
 * 全局 reduced-motion guard 把时长压到 0.001ms（main.scss 末尾），
 * 只靠 before-enter 会有「路由变了但 chrome 没跟上」的窗口。
 * 这里在同一路径上补一次同步，落后一帧也不会错位（同值赋值不会多触发渲染）。
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
 * 版心单一真值。Navbar 读 --shell-max，内容页用同名 token，
 * 顶栏与内容的左右边缘因此永远对齐（原来 Navbar 1800 / Hot·Rank 1400，差 ~200px）。
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

/* 顶栏压暗层：原来是 from-black/40 via-black/10 to-black/30 硬编码黑，
   也正是 Navbar 不得不用 text-white/90、border-white/50 的连锁根源。 */
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
