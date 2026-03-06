<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import Navbar from '@/components/layout/Navbar.vue'
import ChannelNav from '@/components/layout/ChannelNav.vue'
import { getTopBanners, type BannerItem } from '@/api/banner'

const banner = ref<BannerItem | null>(null)

onMounted(async () => {
  try {
    const banners = await getTopBanners()
    if (banners.length > 0) {
      banner.value = banners[0] as BannerItem
    }
  } catch (error) {
    console.error('Failed to fetch top banner:', error)
  }
})
</script>

<template>
  <div class="relative min-h-screen bg-background">
    <!-- Header with Banner - only covers navbar area -->
    <div class="relative h-[150px]">
      <!-- Banner Background -->
      <div class="absolute inset-0 z-0 w-full overflow-hidden">
        <img
          v-if="banner"
          :src="banner.cover"
          alt="Banner"
          class="h-full w-full object-cover object-top"
        />
        <div v-else class="h-full w-full bg-gradient-to-r from-sky-400 to-blue-500"></div>
        <!-- Gradient Overlay -->
        <div
          class="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent"
        ></div>
        <!-- Banner Link -->
        <a v-if="banner" :href="banner.href" target="_blank" class="absolute inset-0"></a>
      </div>

      <!-- Navbar -->
      <div class="relative z-50">
        <Navbar />
      </div>
    </div>

    <!-- Channel Navigation - white background, separate from banner -->
    <div class="sticky top-0 z-40 w-full bg-background shadow-sm">
      <ChannelNav />
    </div>

    <!-- Main Content Area -->
    <main>
      <RouterView />
    </main>
  </div>
</template>
