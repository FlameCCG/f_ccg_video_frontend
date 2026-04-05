<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Navbar from '@/components/layout/Navbar.vue'
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
  <header class="relative w-full">
    <!-- Banner Background - extends behind channel nav -->
    <div class="absolute inset-0 z-0 h-[200px] w-full overflow-hidden">
      <img
        v-if="banner"
        :src="banner.cover"
        alt="Banner"
        class="h-full w-full object-cover object-center"
      />
      <div v-else class="banner-fallback h-full w-full"></div>
      <!-- Gradient Overlay for readability -->
      <div
        class="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent"
      ></div>
      <!-- Banner Link -->
      <a v-if="banner" :href="banner.href" target="_blank" class="absolute inset-0 z-10"></a>
    </div>

    <!-- Navbar Container -->
    <div class="relative z-20 h-16">
      <Navbar />
    </div>
  </header>
</template>
