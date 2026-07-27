<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getVideoRecommend, type FeedItem } from '@/api/video'
import { useRouter } from 'vue-router'
import { formatCount, formatDuration } from '@/utils/format'
import AppImage from '@/components/common/AppImage.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonGroup from '@/components/common/SkeletonGroup.vue'

const props = defineProps<{
  videoId: number
}>()

const router = useRouter()
const list = ref<FeedItem[]>([])
const loading = ref(false)

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
    <h3 class="mb-4 text-[15px] font-bold text-foreground tracking-cjk">接下来播放</h3>

    <Transition name="rec-swap" mode="out-in">
      <!-- Loading Skeleton：结构与真实条目一致（128×72 封面 + 三行文字） -->
      <SkeletonGroup v-if="loading" :count="6" class="space-y-4">
        <div class="rec-sk-row flex gap-3">
          <div class="skeleton-shimmer h-[72px] w-[128px] shrink-0 rounded-lg"></div>
          <div class="flex-1 space-y-2.5 py-1">
            <div class="rec-sk-a skeleton-shimmer h-3.5 w-full rounded"></div>
            <div class="rec-sk-b skeleton-shimmer h-3 w-3/4 rounded"></div>
            <div class="rec-sk-c skeleton-shimmer h-2.5 w-1/2 rounded"></div>
          </div>
        </div>
      </SkeletonGroup>

      <!-- Recommend List -->
      <div v-else-if="list.length > 0" class="space-y-3">
        <div
          v-for="(item, index) in list"
          :key="item.id"
          class="video-card group flex cursor-pointer gap-3 rounded-xl p-2"
          :style="{ '--i': index }"
          @click="goToVideo(item.id)"
        >
          <!-- Thumbnail -->
          <div class="cover-wrapper h-[72px] w-[128px] shrink-0 overflow-hidden rounded-lg">
            <AppImage :src="item.cover" :alt="item.title" aspect="auto" img-class="rec-cover-img" />
            <div class="vignette"></div>
            <span class="duration-badge media-chip tabular">
              {{ formatDuration(item.duration) }}
            </span>
            <div class="watch-progress"></div>
          </div>
          <!-- Info -->
          <div class="min-w-0 flex-1 py-0.5 flex flex-col justify-between">
            <div>
              <h4
                class="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground/90 t-tint group-hover:text-primary"
              >
                {{ item.title }}
              </h4>
              <p
                class="mt-1.5 truncate text-[12px] font-medium text-muted-foreground/80 t-tint group-hover:text-muted-foreground"
              >
                {{ item.author.username }}
              </p>
            </div>
            <div
              class="mt-1 flex items-center gap-2.5 text-2xs font-medium text-muted-foreground/60"
            >
              <span class="t-tint group-hover:text-muted-foreground/80">
                <span class="tabular">{{ formatCount(item.views) }}</span> 播放
              </span>
              <span class="t-tint group-hover:text-muted-foreground/80">
                <span class="tabular">{{ formatCount(item.danmuCount) }}</span> 弹幕
              </span>
            </div>
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        size="sm"
        icon="playlist"
        title="还没有找到相关视频"
        description="这个视频比较小众，换个分区逛逛也许有惊喜"
      />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.recommend-container {
  padding-bottom: 12px;
}

/* 骨架内部二级错峰：--skeleton-phase 必须定义在「父级」上再供子级 calc，
   同一元素上既读又写 --skeleton-index 会构成 CSS 循环，整条声明静默失效。 */
.rec-sk-row {
  --skeleton-phase: var(--skeleton-index, 0);
}

.rec-sk-a {
  --skeleton-index: calc(var(--skeleton-phase) + 0.3);
}

.rec-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.45);
}

.rec-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.6);
}

/* 骨架 ↔ 列表交叉淡出，避免整栏「啪」的一下换掉 */
.rec-swap-leave-active {
  transition: opacity var(--duration-fast) linear;
}

.rec-swap-enter-active {
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.rec-swap-enter-from,
.rec-swap-leave-to {
  opacity: 0;
}

.video-card {
  background: transparent;
  border: 1px solid transparent;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    border-color var(--duration-fast) var(--ease-out-quart),
    transform var(--duration-normal) var(--ease-out-expo);

  /* 入场只动 opacity + translate（独立属性），把 transform 完整让给 hover / active。
     原实现用 `animation: stagger-in … forwards` animate transform，
     动画的 fill 值在层叠里压过普通声明，:hover / :active 的位移永远不生效。 */
  animation: rec-card-in var(--duration-slow) var(--ease-out-expo) both;
  animation-delay: calc(var(--i, 0) * 40ms);

  &:hover {
    background: color-mix(in oklch, var(--color-muted) 40%, transparent);
    border-color: color-mix(in oklch, var(--color-border) 50%, transparent);
    transform: translate3d(4px, 0, 0);

    :deep(.rec-cover-img) {
      transform: scale(1.08);
    }

    .vignette {
      opacity: 1;
    }

    .duration-badge {
      transform: translate3d(0, -2px, 0);
    }

    .watch-progress {
      transform: scaleX(1);
    }
  }

  &:active {
    transform: translate3d(2px, 0, 0) scale(0.99);
  }
}

.cover-wrapper {
  position: relative;
  box-shadow: var(--shadow-surface);
  transform: translateZ(0);
}

:deep(.rec-cover-img) {
  transition: transform var(--duration-slow) var(--ease-out-expo);
}

.vignette {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: radial-gradient(
    ellipse at center,
    transparent 40%,
    color-mix(in oklch, var(--media-overlay) 60%, transparent) 100%
  );
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--duration-normal) var(--ease-out-quart);
}

.duration-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  z-index: 3;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  letter-spacing: 0.02em;
  transition: transform var(--duration-normal) var(--ease-out-expo);
}

.watch-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  z-index: 3;
  height: 3px;
  width: 100%;
  background: linear-gradient(90deg, var(--color-primary), var(--color-accent));
  transform-origin: left;
  transform: scaleX(0);
  transition: transform var(--duration-slow) var(--ease-out-expo);
  border-radius: 0 2px 0 0;
}

@keyframes rec-card-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }

  to {
    opacity: 1;
    translate: none;
  }
}
</style>
