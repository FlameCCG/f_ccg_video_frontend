<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getVideoRecommend, type FeedItem } from '@/api/video'
import { useRouter } from 'vue-router'

const props = defineProps<{
  videoId: number
}>()

const router = useRouter()
const list = ref<FeedItem[]>([])
const loading = ref(false)

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatViews = (views: number): string => {
  if (views >= 10000) return `${(views / 10000).toFixed(1)}万`
  return views.toString()
}

const formatDanmu = (count: number): string => {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return count.toString()
}

const fetchRecommend = async () => {
  if (!props.videoId) return
  loading.value = true
  try {
    const result = await getVideoRecommend({ videoId: props.videoId, size: 20 })
    list.value = result.list ?? []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

const goToVideo = (id: number) => {
  void router.push(`/video/${id}`)
}

onMounted(fetchRecommend)

watch(() => props.videoId, fetchRecommend)
</script>

<template>
  <div class="recommend-container">
    <h3 class="mb-4 text-[15px] font-bold text-foreground tracking-tight">接下来播放</h3>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="space-y-4">
      <div v-for="i in 6" :key="i" class="flex gap-3">
        <div class="skeleton-box h-[72px] w-[128px] shrink-0 rounded-lg"></div>
        <div class="flex-1 space-y-2.5 py-1">
          <div class="skeleton-box h-3.5 w-full rounded"></div>
          <div class="skeleton-box h-3 w-3/4 rounded"></div>
          <div class="skeleton-box h-2.5 w-1/2 rounded"></div>
        </div>
      </div>
    </div>

    <!-- Recommend List -->
    <div v-else class="space-y-3">
      <div
        v-for="(item, index) in list"
        :key="item.id"
        class="video-card group flex cursor-pointer gap-3 rounded-xl p-2 transition-all duration-300"
        :style="{ '--i': index }"
        @click="goToVideo(item.id)"
      >
        <!-- Thumbnail -->
        <div class="cover-wrapper h-[72px] w-[128px] shrink-0 rounded-lg">
          <img :src="item.cover" :alt="item.title" class="cover-img" loading="lazy" />
          <div class="vignette"></div>
          <span class="duration-badge">
            {{ formatDuration(item.duration) }}
          </span>
          <div class="watch-progress"></div>
        </div>
        <!-- Info -->
        <div class="min-w-0 flex-1 py-0.5 flex flex-col justify-between">
          <div>
            <h4
              class="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground/90 transition-colors group-hover:text-primary"
            >
              {{ item.title }}
            </h4>
            <p
              class="mt-1.5 truncate text-[12px] font-medium text-muted-foreground/80 transition-colors group-hover:text-muted-foreground"
            >
              {{ item.author.username }}
            </p>
          </div>
          <div
            class="mt-1 flex items-center gap-2.5 text-[11px] font-medium text-muted-foreground/60"
          >
            <span class="transition-colors group-hover:text-muted-foreground/80"
              >{{ formatViews(item.views) }}播放</span
            >
            <span class="transition-colors group-hover:text-muted-foreground/80"
              >{{ formatDanmu(item.danmuCount) }}弹幕</span
            >
          </div>
        </div>
      </div>

      <div
        v-if="!loading && list.length === 0"
        class="py-12 text-center text-[14px] font-medium text-muted-foreground/60"
      >
        暂无推荐视频
      </div>
    </div>
  </div>
</template>

<style scoped>
.recommend-container {
  padding-bottom: 12px;
}

.skeleton-box {
  --shimmer-color-base: oklch(var(--muted));
  --shimmer-color-peak: oklch(var(--muted) / 0.5);

  background: linear-gradient(
    110deg,
    var(--shimmer-color-base) 30%,
    var(--shimmer-color-peak) 50%,
    var(--shimmer-color-base) 70%
  );
  background-size: 250% 100%;
  animation: shimmer 1.8s cubic-bezier(0.37, 0, 0.63, 1) infinite;
}

@keyframes shimmer {
  0% {
    background-position: 250% 0;
  }

  100% {
    background-position: -250% 0;
  }
}

.video-card {
  background: transparent;
  border: 1px solid transparent;
  animation: stagger-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: calc(var(--i, 0) * 40ms);
  opacity: 0;
  transform: translateY(8px);
}

@keyframes stagger-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.video-card:hover {
  background: oklch(var(--muted) / 0.4);
  border-color: oklch(var(--border) / 0.5);
  transform: translateX(4px);
  box-shadow: -4px 4px 12px rgb(0 0 0 / 0.02);
}

:global(.dark) .video-card:hover {
  box-shadow: -4px 4px 12px rgb(0 0 0 / 0.1);
}

.video-card:active {
  transform: translateX(2px) scale(0.99);
  transition-duration: 0.1s;
}

.cover-wrapper {
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
  transform: translateZ(0);
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.video-card:hover .cover-img {
  transform: scale(1.08);
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 40%, rgb(0 0 0 / 0.15) 100%);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.video-card:hover .vignette {
  opacity: 1;
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: white;
  background: rgb(0 0 0 / 0.65);
  backdrop-filter: blur(4px);
  border-radius: 4px;
  letter-spacing: 0.02em;
  transform: translateY(0);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.video-card:hover .duration-badge {
  transform: translateY(-2px);
}

.watch-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  transform-origin: left;
  transform: scaleX(0);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 0 2px 0 0;
}

.video-card:hover .watch-progress {
  transform: scaleX(1);
}
</style>
