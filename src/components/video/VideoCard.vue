<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { FeedItem } from '@/api/video'

interface Props {
  video: FeedItem
  variant?: 'default' | 'compact'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})
const router = useRouter()

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const sanitizedTitleHtml = computed(() => {
  const highlightedTitle = props.video.highlight?.title?.[0]?.trim()
  if (!highlightedTitle) {
    return escapeHtml(props.video.title)
  }

  return highlightedTitle.replace(/<(?!\/?em\b)[^>]*>/g, '')
})

// Format duration from seconds to mm:ss
const formattedDuration = computed(() => {
  const seconds = props.video.duration
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})

// Format view count (e.g., 1.2万)
const formattedViews = computed(() => {
  const views = props.video.views
  if (views >= 10000) {
    return `${(views / 10000).toFixed(1)}万`
  }
  return views.toString()
})

// Format danmu count
const formattedDanmu = computed(() => {
  const count = props.video.danmuCount
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`
  }
  return count.toString()
})

// Format publish time (relative time)
const formattedTime = computed(() => {
  const publishTime = new Date(props.video.createdAt)
  const now = new Date()
  const diffMs = now.getTime() - publishTime.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`
  return `${Math.floor(diffDays / 365)}年前`
})

const handleClick = () => {
  void router.push(`/video/${props.video.id}`)
}
</script>

<template>
  <div
    class="hover-lift group cursor-pointer overflow-hidden rounded-[var(--radius-xl)] bg-card border border-border/50"
    :class="[variant === 'compact' ? 'flex h-full flex-col' : '']"
    @click="handleClick"
  >
    <!-- Cover Image Container -->
    <div
      class="relative overflow-hidden"
      :class="[variant === 'compact' ? 'aspect-[16/10] flex-1' : 'aspect-video']"
    >
      <img
        :src="video.cover"
        :alt="video.title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
      />
      <!-- Duration Badge -->
      <div
        class="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 font-medium text-white"
        :class="[variant === 'compact' ? 'text-[10px]' : 'text-xs']"
      >
        {{ formattedDuration }}
      </div>
      <!-- Stats Overlay on Cover -->
      <div
        class="absolute bottom-1 left-1 flex items-center gap-3 text-white/90"
        :class="[variant === 'compact' ? 'text-[10px] gap-2' : 'text-xs']"
      >
        <div class="flex items-center gap-1">
          <!-- B站播放图标 -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            class="h-3.5 w-3.5"
            :class="[variant === 'compact' ? 'h-3 w-3' : '']"
            fill="currentColor"
          >
            <path
              d="M4.5 3.5a.5.5 0 0 1 .77-.42l7 4.5a.5.5 0 0 1 0 .84l-7 4.5A.5.5 0 0 1 4.5 12.5v-9z"
            />
          </svg>
          <span>{{ formattedViews }}</span>
        </div>
        <div class="flex items-center gap-1">
          <!-- B站弹幕图标 -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            class="h-3.5 w-3.5"
            :class="[variant === 'compact' ? 'h-3 w-3' : '']"
            fill="currentColor"
          >
            <path
              d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H9.707l-2.354 2.354a.5.5 0 0 1-.707 0L4.293 11H3.5A1.5 1.5 0 0 1 2 9.5v-6zM4 5.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 0-1h-4a.5.5 0 0 0-.5.5zm0 2.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 0-1h-7a.5.5 0 0 0-.5.5z"
            />
          </svg>
          <span>{{ formattedDanmu }}</span>
        </div>
      </div>
      <!-- Hover Overlay -->
      <div
        class="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/10"
      ></div>
    </div>

    <!-- Video Info -->
    <div :class="[variant === 'compact' ? 'px-1 py-1' : 'px-0 py-2']">
      <!-- Title -->
      <h3
        class="font-medium text-foreground transition-colors group-hover:text-primary"
        :class="[
          variant === 'compact'
            ? 'line-clamp-1 text-[11px] leading-tight'
            : 'mb-1.5 line-clamp-2 text-sm leading-5',
        ]"
        v-html="sanitizedTitleHtml"
      ></h3>

      <!-- Author & Time Info (default mode only) -->
      <div
        v-if="variant === 'default'"
        class="flex items-center gap-2 text-xs text-muted-foreground"
      >
        <div class="flex items-center gap-1 min-w-0">
          <!-- UP Icon -->
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
              fill="currentColor"
            ></path>
            <path
              d="M12.6522 8.99805C12.6522 8.58383 12.98795 8.24805 13.4022 8.24805L15.725 8.24805C17.31285 8.24805 18.6 9.53522 18.6 11.123C18.6 12.71085 17.31285 13.998 15.725 13.998L14.1522 13.998L14.1522 14.998C14.1522 15.4122 13.8164 15.748 13.4022 15.748C12.98795 15.748 12.6522 15.4122 12.6522 14.998L12.6522 8.99805zM14.1522 12.498L15.725 12.498C16.4844 12.498 17.1 11.8824 17.1 11.123C17.1 10.36365 16.4844 9.74804 15.725 9.74804L14.1522 9.74804L14.1522 12.498z"
              fill="currentColor"
            ></path>
            <path
              d="M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z"
              fill="currentColor"
            ></path>
          </svg>
          <span class="truncate">{{ video.author.username }}</span>
        </div>
        <span class="shrink-0 text-muted-foreground/60">·</span>
        <span class="shrink-0 text-muted-foreground/60">{{ formattedTime }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(em) {
  font-style: normal;
  color: var(--color-primary);
}
</style>
