<script setup lang="ts">
import { computed } from 'vue'
import type { FeedItem } from '@/api/video'
import { formatCount, formatDuration } from '@/utils/format'
import DOMPurify from 'dompurify'

interface Props {
  video: FeedItem
  variant?: 'default' | 'compact'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
})

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

  return DOMPurify.sanitize(highlightedTitle, {
    ALLOWED_TAGS: ['em'],
    ALLOWED_ATTR: [],
  })
})

/**
 * 悬停提示用的纯文本标题。
 *
 * 卡片里的标题是 line-clamp-2 的，长标题被截成「…」之后就再也读不到全名了。
 * 这里给 title 属性喂**没有 <em> 标记、也没有 HTML 实体**的原文：
 * sanitizedTitleHtml 是给 v-html 用的，直接塞进 title 会露出 &amp; / <em> 这些标记。
 */
const plainTitle = computed(() => props.video.title.trim())

/**
 * 片源式标题常带超长无空格 token。仅对这类标题允许在任意字符处断行，
 * 避免浏览器先把整个 token 推到下一行，导致第一行只剩很短的中文前缀。
 */
const hasLongUnbrokenToken = computed(() => /[a-z0-9._-]{24,}/i.test(plainTitle.value))

// Format duration from seconds to mm:ss
const formattedDuration = computed(() => formatDuration(props.video.duration))

// Format view count (e.g., 1.2万)
const formattedViews = computed(() => formatCount(props.video.views))

// Format danmu count
const formattedDanmu = computed(() => formatCount(props.video.danmuCount))

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
</script>

<template>
  <!-- 真 <a href>：键盘可达、中键新标签、右键复制链接、爬虫可索引。
       刻意不挂 overflow-hidden —— 焦点环会被裁掉；裁剪下移到封面容器。 -->
  <router-link
    :to="`/video/${video.id}`"
    class="video-card group relative flex flex-col rounded-xl border border-border/50 bg-card"
    :class="[variant === 'compact' ? 'h-full' : '']"
  >
    <!-- Cover Image Container -->
    <div
      class="video-card__cover relative overflow-hidden rounded-t-xl"
      :class="[variant === 'compact' ? 'aspect-[16/10] flex-1' : 'aspect-video']"
    >
      <img
        :src="video.cover"
        :alt="video.title"
        class="video-card__img h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />

      <!-- 底部压暗：统计数字与时长胶囊在浅色封面上也要可读 -->
      <div class="video-card__scrim pointer-events-none absolute inset-x-0 bottom-0 h-1/3"></div>

      <!-- Duration Badge -->
      <span
        class="media-chip tabular absolute bottom-1 right-1 rounded-sm px-1.5 py-0.5 font-medium"
        :class="[variant === 'compact' ? 'text-2xs' : 'text-xs']"
      >
        {{ formattedDuration }}
      </span>

      <!-- Stats Overlay on Cover -->
      <div
        class="video-card__stats absolute bottom-1 left-1 flex items-center gap-3"
        :class="[variant === 'compact' ? 'text-2xs gap-2' : 'text-xs']"
      >
        <span class="flex items-center gap-1">
          <!-- B站播放图标 -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            class="h-3.5 w-3.5"
            :class="[variant === 'compact' ? 'h-3 w-3' : '']"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M4.5 3.5a.5.5 0 0 1 .77-.42l7 4.5a.5.5 0 0 1 0 .84l-7 4.5A.5.5 0 0 1 4.5 12.5v-9z"
            />
          </svg>
          <span class="tabular">{{ formattedViews }}</span>
        </span>
        <span class="flex items-center gap-1">
          <!-- B站弹幕图标 -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            class="h-3.5 w-3.5"
            :class="[variant === 'compact' ? 'h-3 w-3' : '']"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6a1.5 1.5 0 0 1-1.5 1.5H9.707l-2.354 2.354a.5.5 0 0 1-.707 0L4.293 11H3.5A1.5 1.5 0 0 1 2 9.5v-6zM4 5.5a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 0-1h-4a.5.5 0 0 0-.5.5zm0 2.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 0-1h-7a.5.5 0 0 0-.5.5z"
            />
          </svg>
          <span class="tabular">{{ formattedDanmu }}</span>
        </span>
      </div>

      <!-- Hover Veil：只过渡 opacity，不过渡 background-color（后者是 paint 属性） -->
      <div class="video-card__veil pointer-events-none absolute inset-0"></div>
    </div>

    <!-- Video Info -->
    <div class="flex flex-1 flex-col" :class="[variant === 'compact' ? 'px-1 py-1' : 'px-0 py-2']">
      <!-- Title：被 line-clamp 截掉的部分靠原生 title 兜住，悬停即可读全名 -->
      <h3
        class="video-card__title t-tint font-medium text-foreground tracking-cjk group-hover:text-primary"
        :class="[
          variant === 'compact'
            ? 'line-clamp-1 text-2xs leading-tight'
            : 'mb-1.5 line-clamp-2 text-sm leading-5',
          { 'video-card__title--break-token': hasLongUnbrokenToken },
        ]"
        :title="plainTitle"
        v-html="sanitizedTitleHtml"
      ></h3>

      <!-- Author & Time Info (default mode only) -->
      <div
        v-if="variant === 'default'"
        class="mt-auto flex items-center gap-2 text-xs leading-4 text-muted-foreground"
      >
        <span class="flex min-w-0 items-center gap-1">
          <!-- UP Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="currentColor"
            class="shrink-0 opacity-70"
            aria-hidden="true"
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
        </span>
        <span class="shrink-0 text-muted-foreground/60">·</span>
        <span class="tabular shrink-0 text-muted-foreground/60">{{ formattedTime }}</span>
      </div>
    </div>
  </router-link>
</template>

<style scoped lang="scss">
:deep(em) {
  font-style: normal;
  color: var(--color-primary);
}

/* 抬起只动 transform；阴影交给 ::after 的 opacity。
   过渡 box-shadow 会让一屏 N 张卡在鼠标扫过时逐帧重绘 48px 模糊，是网格悬停掉帧的主因。 */
.video-card {
  transition: transform var(--duration-normal) var(--ease-out-expo);

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: var(--shadow-overlay);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal) var(--ease-out-quart);
  }
}

/* 标题恒占两行高度，网格底边才对齐。
   2 × leading-5(1.25rem) —— 由行高推导，不是「40px」这种跨文件魔法数。 */
.video-card__title {
  min-height: calc(2 * 1.25rem);

  /* 压制盗版片源那种超长连写标题（`_Renegade_Immortal_S01E148_2023_2160p_WEB_DL_`）。
     这类串没有空格也没有 CJK 断点，line-clamp 的 -webkit-box 只能横向溢出后被
     overflow:hidden 齐刷刷切断 —— 看着像掉了半个字，省略号也不出现。
     anywhere（不是 break-word）才会在任意字符处断，这样第二行末尾能正常收「…」。 */
  overflow-wrap: anywhere;
}

.video-card__title--break-token {
  word-break: break-all;
}

.video-card__scrim {
  background-image: linear-gradient(
    to top,
    color-mix(in oklch, var(--media-overlay) 88%, transparent),
    transparent
  );
}

.video-card__stats {
  color: var(--media-overlay-text);
  text-shadow: 0 1px 2px color-mix(in oklch, var(--media-overlay) 70%, transparent);
}

.video-card__img {
  transition: transform var(--duration-slow) var(--ease-out-expo);
}

.video-card__veil {
  background-color: color-mix(in oklch, var(--media-overlay) 55%, transparent);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out-quart);
}

/* 暗色下封面本来就压在深底上，再叠黑等于没有反馈 —— 换成极淡的提亮 */
:global(html.dark) .video-card__veil {
  background-color: color-mix(in oklch, var(--media-overlay-text) 10%, transparent);
}

/* 触屏上 :hover 点完会粘住，卡片会长期停在抬起 + 放大态 */
@media (hover: hover) and (pointer: fine) {
  .video-card:hover {
    transform: translate3d(0, -4px, 0);
  }

  .video-card:hover::after {
    opacity: 1;
  }

  .video-card:hover .video-card__img {
    /* 全站封面/头像统一 1.04，不再 1.05 / 1.10 / 1.15 各说各话 */
    transform: scale(1.04);
  }

  .video-card:hover .video-card__veil {
    opacity: 1;
  }
}

/* 全局 guard 只压时长，位移仍会瞬移，对前庭敏感用户不友好 */
@media (prefers-reduced-motion: reduce) {
  .video-card:hover {
    transform: none;
  }

  .video-card:hover .video-card__img {
    transform: none;
  }
}
</style>
