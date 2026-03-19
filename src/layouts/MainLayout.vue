<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import ChannelNav from '@/components/layout/ChannelNav.vue'

const route = useRoute()
const hideChannelNav = computed(() => route.path === '/dynamic' || route.path === '/history')

const bannerRef = ref<HTMLDivElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
let mouseEnterX = 0

const onBannerMouseEnter = (e: MouseEvent) => {
  mouseEnterX = e.clientX
  if (videoRef.value) {
    videoRef.value.style.transition = 'none'
  }
}

const onBannerMouseMove = (e: MouseEvent) => {
  if (!videoRef.value) return
  const dx = e.clientX - mouseEnterX
  const shift = -dx / 20
  videoRef.value.style.transform = `translateX(${shift}px) translateY(-4px) scale(1.15)`
}

const onBannerMouseLeave = () => {
  if (!videoRef.value) return
  videoRef.value.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
  videoRef.value.style.transform = 'translateX(0) translateY(-4px) scale(1.15)'
}

onMounted(() => {
  const el = bannerRef.value
  if (el) {
    el.addEventListener('mouseenter', onBannerMouseEnter)
    el.addEventListener('mousemove', onBannerMouseMove)
    el.addEventListener('mouseleave', onBannerMouseLeave)
  }
})

onBeforeUnmount(() => {
  const el = bannerRef.value
  if (el) {
    el.removeEventListener('mouseenter', onBannerMouseEnter)
    el.removeEventListener('mousemove', onBannerMouseMove)
    el.removeEventListener('mouseleave', onBannerMouseLeave)
  }
})
</script>

<template>
  <div class="relative min-h-screen bg-background">
    <!-- Slim header for /dynamic (no video banner) -->
    <template v-if="hideChannelNav">
      <div class="slim-header relative z-50">
        <Navbar light />
      </div>
    </template>

    <!-- Full header with Video Banner for other pages -->
    <template v-else>
      <div ref="bannerRef" class="banner-shell relative h-[200px] cursor-pointer">
        <div class="absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
          <video
            ref="videoRef"
            loop
            autoplay
            muted
            playsinline
            src="/banner-video.mp4"
            class="banner-video pointer-events-none h-full min-w-full object-cover"
          />
          <div
            class="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black/30"
          ></div>
        </div>
        <div class="relative z-50">
          <Navbar />
        </div>
      </div>
      <div class="sticky top-0 z-40 w-full bg-background shadow-sm">
        <ChannelNav />
      </div>
    </template>

    <!-- Main Content Area -->
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.banner-video {
  transform: translateX(0) translateY(-4px) scale(1.15);
  will-change: transform;
}

.slim-header {
  background: #fff;
  border-bottom: 1px solid #e3e5e7;
}
</style>
