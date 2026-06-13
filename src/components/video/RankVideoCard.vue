<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { FeedItem } from '@/api/video'
import { formatCount, formatDuration } from '@/utils/format'

interface Props {
  video: FeedItem
  rank: number
}

const props = defineProps<Props>()
const router = useRouter()

// Format duration from seconds to mm:ss
const formattedDuration = computed(() => formatDuration(props.video.duration))

// Format view count
const formattedViews = computed(() => formatCount(props.video.views))

// Format danmu count
const formattedDanmu = computed(() => formatCount(props.video.danmuCount))

const handleClick = () => {
  void router.push(`/video/${props.video.id}`)
}

const rankBadgeStyle = computed(() => {
  if (props.rank === 1) return 'rank-badge-1'
  if (props.rank === 2) return 'rank-badge-2'
  if (props.rank === 3) return 'rank-badge-3'
  return 'rank-badge-4'
})
</script>

<template>
  <div
    class="group flex cursor-pointer gap-4 rounded-lg p-2 transition-colors hover:bg-muted/50"
    @click="handleClick"
  >
    <!-- Left side: Cover & Rank -->
    <div class="relative flex w-[220px] shrink-0 sm:w-[260px]">
      <!-- Cover Image -->
      <div
        class="relative aspect-video w-full overflow-hidden rounded-md bg-muted shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
      >
        <!-- Rank Badge -->
        <div
          class="absolute left-0 top-0 z-20 flex min-h-[30px] min-w-[36px] items-center justify-center rounded-br-[12px] px-2.5 py-1 text-2xl font-black italic leading-none md:min-h-[36px] md:min-w-[42px] md:text-3xl"
          :class="rankBadgeStyle"
        >
          {{ rank }}
        </div>
        <img
          :src="video.cover"
          :alt="video.title"
          class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
        <!-- Duration Badge -->
        <div class="media-chip absolute bottom-1 right-1 rounded px-1.5 py-0.5 text-xs font-medium">
          {{ formattedDuration }}
        </div>
      </div>
    </div>

    <!-- Right side: Video Info -->
    <div class="flex flex-1 flex-col justify-between py-1 min-w-0">
      <h3
        class="mb-2 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
      >
        {{ video.title }}
      </h3>

      <div class="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <!-- Author -->
        <div class="flex items-center gap-1 hover:text-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            class="shrink-0 opacity-70"
          >
            <path
              d="M6.15 8.24805C6.5642 8.24805 6.9 8.58383 6.9 8.99805L6.9 12.7741C6.9 13.5881 7.55988 14.248 8.3739 14.248C9.18791 14.248 9.8478 13.5881 9.8478 12.7741L9.8478 8.99805C9.8478 8.58383 10.1836 8.24805 10.5978 8.24805C11.012 8.24805 11.3478 8.58383 11.3478 8.99805L11.3478 12.7741C11.3478 14.41655 10.01635 15.748 8.3739 15.748C6.73146 15.748 5.4 14.41655 5.4 12.7741L5.4 8.99805C5.4 8.58383 5.73578 8.24805 6.15 8.24805z"
            ></path>
            <path
              d="M12.6522 8.99805C12.6522 8.58383 12.98795 8.24805 13.4022 8.24805L15.725 8.24805C17.31285 8.24805 18.6 9.53522 18.6 11.123C18.6 12.71085 17.31285 13.998 15.725 13.998L14.1522 13.998L14.1522 14.998C14.1522 15.4122 13.8164 15.748 13.4022 15.748C12.98795 15.748 12.6522 15.4122 12.6522 14.998L12.6522 8.99805zM14.1522 12.498L15.725 12.498C16.4844 12.498 17.1 11.8824 17.1 11.123C17.1 10.36365 16.4844 9.74804 15.725 9.74804L14.1522 9.74804L14.1522 12.498z"
            ></path>
            <path
              d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"
            ></path>
          </svg>
          <span class="truncate">{{ video.author.username }}</span>
        </div>

        <!-- Stats -->
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              class="h-3.5 w-3.5"
              fill="currentColor"
            >
              <path
                d="M4.5 3.5a.5.5 0 0 1 .77-.42l7 4.5a.5.5 0 0 1 0 .84l-7 4.5A.5.5 0 0 1 4.5 12.5v-9z"
              />
            </svg>
            <span>{{ formattedViews }}</span>
          </div>
          <div class="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 16 16"
              class="h-3.5 w-3.5"
              fill="currentColor"
            >
              <path
                d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H9.707l-2.354 2.354a.5.5 0 0 1-.707 0L4.293 11H3.5A1.5 1.5 0 0 1 2 9.5v-6zM4 5.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 0-1h-4a.5.5 0 0 0-.5.5zm0 2.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 0-1h-7a.5.5 0 0 0-.5.5z"
              />
            </svg>
            <span>{{ formattedDanmu }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
