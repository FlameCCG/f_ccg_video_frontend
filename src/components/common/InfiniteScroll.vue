<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Loader2 } from 'lucide-vue-next'

interface Props {
  loading?: boolean
  finished?: boolean
  threshold?: number
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  finished: false,
  threshold: 100,
})

const emit = defineEmits<{
  loadMore: []
}>()

const sentinelRef = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null

const handleIntersect = (entries: IntersectionObserverEntry[]) => {
  const entry = entries[0]
  if (entry && entry.isIntersecting && !props.loading && !props.finished) {
    emit('loadMore')
  }
}

onMounted(() => {
  if (sentinelRef.value) {
    observer = new IntersectionObserver(handleIntersect, {
      rootMargin: `${props.threshold}px`,
    })
    observer.observe(sentinelRef.value)
  }
})

onUnmounted(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})
</script>

<template>
  <div class="infinite-scroll">
    <!-- Content Slot -->
    <slot></slot>

    <!-- Sentinel Element for Intersection Observer -->
    <div ref="sentinelRef" class="sentinel"></div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-6">
      <Loader2 class="h-6 w-6 animate-spin text-primary" />
      <span class="ml-2 text-sm text-muted-foreground">加载中...</span>
    </div>

    <!-- Finished State -->
    <div v-else-if="finished" class="py-6 text-center">
      <span class="text-sm text-muted-foreground">没有更多了</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sentinel {
  height: 1px;
  width: 100%;
}
</style>
