<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { BannerItem } from '@/api/banner'

interface Props {
  items: BannerItem[]
  autoplay?: boolean
  interval?: number
}

const props = withDefaults(defineProps<Props>(), {
  autoplay: true,
  interval: 5000,
})

const currentIndex = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const totalItems = computed(() => props.items.length)

const goTo = (index: number) => {
  if (index < 0) {
    currentIndex.value = totalItems.value - 1
  } else if (index >= totalItems.value) {
    currentIndex.value = 0
  } else {
    currentIndex.value = index
  }
}

const prev = () => {
  goTo(currentIndex.value - 1)
}

const next = () => {
  goTo(currentIndex.value + 1)
}

const startAutoplay = () => {
  if (props.autoplay && totalItems.value > 1) {
    timer = setInterval(() => {
      next()
    }, props.interval)
  }
}

const stopAutoplay = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(() => {
  startAutoplay()
})

onUnmounted(() => {
  stopAutoplay()
})
</script>

<template>
  <div
    v-if="items.length > 0"
    class="group relative h-full overflow-hidden rounded-lg"
    @mouseenter="stopAutoplay"
    @mouseleave="startAutoplay"
  >
    <!-- Slides -->
    <div class="relative aspect-[4/3] w-full overflow-hidden lg:aspect-auto lg:h-full">
      <TransitionGroup name="carousel">
        <a
          v-for="(item, index) in items"
          v-show="index === currentIndex"
          :key="item.id"
          :href="item.href"
          target="_blank"
          class="absolute inset-0 block"
        >
          <img :src="item.cover" :alt="`Banner ${index + 1}`" class="h-full w-full object-cover" />
        </a>
      </TransitionGroup>
    </div>

    <!-- Navigation Arrows -->
    <button
      v-if="totalItems > 1"
      class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white opacity-0 transition-opacity hover:bg-black/50 group-hover:opacity-100"
      @click.prevent="prev"
    >
      <ChevronLeft class="h-5 w-5" />
    </button>
    <button
      v-if="totalItems > 1"
      class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white opacity-0 transition-opacity hover:bg-black/50 group-hover:opacity-100"
      @click.prevent="next"
    >
      <ChevronRight class="h-5 w-5" />
    </button>

    <!-- Dots Indicator -->
    <div v-if="totalItems > 1" class="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
      <button
        v-for="(_, index) in items"
        :key="index"
        class="h-2 w-2 rounded-full transition-all"
        :class="[index === currentIndex ? 'w-6 bg-white' : 'bg-white/50 hover:bg-white/70']"
        @click="goTo(index)"
      />
    </div>
  </div>
</template>

<style scoped>
.carousel-enter-active,
.carousel-leave-active {
  transition: opacity 0.5s ease;
}

.carousel-enter-from,
.carousel-leave-to {
  opacity: 0;
}
</style>
