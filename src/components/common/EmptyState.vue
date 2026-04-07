<script setup lang="ts">
import { computed, useSlots, type Component } from 'vue'
import EmptyStateArtwork from './EmptyStateArtwork.vue'
import ProfileEmptyArtwork from './ProfileEmptyArtwork.vue'
import {
  AtSign,
  Bell,
  BookmarkX,
  CircleAlert,
  FileQuestion,
  FolderOpen,
  Heart,
  History,
  ImageOff,
  Inbox,
  ListVideo,
  MessageSquare,
  MessageSquarePlus,
  MessagesSquare,
  Rss,
  SearchX,
  Star,
  Tags,
  UserSearch,
  Users,
  Video,
  WifiOff,
} from 'lucide-vue-next'

/** 内置图标别名表：只收录空状态真正用得到的图标，保持可 tree-shake。 */
const ICON_PRESETS = {
  inbox: Inbox,
  search: SearchX,
  video: Video,
  playlist: ListVideo,
  users: Users,
  user: UserSearch,
  heart: Heart,
  bell: Bell,
  message: MessageSquare,
  comment: MessageSquarePlus,
  at: AtSign,
  chat: MessagesSquare,
  history: History,
  feed: Rss,
  tags: Tags,
  folder: FolderOpen,
  image: ImageOff,
  star: Star,
  bookmark: BookmarkX,
  alert: CircleAlert,
  offline: WifiOff,
  file: FileQuestion,
} satisfies Record<string, Component>

type IconPreset = keyof typeof ICON_PRESETS

interface Props {
  /** lucide 组件，或内置别名（见 ICON_PRESETS）。缺省为 inbox。 */
  icon?: Component | IconPreset
  /** 主文案：说清楚「这里为什么是空的」，不要写「暂无数据」。 */
  title: string
  variant?:
    | 'auto'
    | 'home'
    | 'hot'
    | 'rank'
    | 'channel'
    | 'profile-video'
    | 'profile-activity'
    | 'profile-collection'
    | 'profile-following'
    | 'profile-fans'
    | 'profile-feed'
  eyebrow?: string
  /** 副文案：给出下一步动作或原因，20-40 字为宜。 */
  description?: string
  /** sm=侧栏/内嵌列表，md=卡片内，lg=整页。 */
  size?: 'sm' | 'md' | 'lg'
  /** 置为 true 时容器成为 aria live region（搜索无结果等「结果变化」场景用）。 */
  announce?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
  variant: 'auto',
  eyebrow: undefined,
  description: undefined,
  size: 'md',
  announce: false,
})

const slots = useSlots()

const resolvedIcon = computed<Component>(() => {
  const raw = props.icon
  if (!raw) return Inbox
  if (typeof raw === 'string') return ICON_PRESETS[raw] ?? Inbox
  return raw
})

const scene = computed(() => {
  if (props.variant !== 'auto') return props.variant
  const icon = typeof props.icon === 'string' ? props.icon : 'inbox'
  if (['search', 'tags'].includes(icon)) return 'search'
  if (['folder', 'bookmark', 'star', 'playlist'].includes(icon)) return 'collection'
  if (['chat', 'message', 'comment', 'at'].includes(icon)) return 'conversation'
  if (['offline', 'alert', 'file'].includes(icon)) return 'signal'
  if (icon === 'heart') return 'appreciation'
  if (icon === 'feed') return 'channel'
  if (['users', 'user'].includes(icon)) return 'people'
  if (icon === 'history') return 'history'
  if (['video', 'image'].includes(icon)) return 'video'
  return 'notification'
})

const hasDescription = computed(() => Boolean(props.description) || Boolean(slots.description))
</script>

<template>
  <div
    class="empty-state"
    :class="[`empty-state--${size}`, `empty-state--${scene}`]"
    :role="announce ? 'status' : undefined"
    :aria-live="announce ? 'polite' : undefined"
  >
    <div class="empty-state__art" aria-hidden="true">
      <slot name="icon">
        <ProfileEmptyArtwork v-if="scene.startsWith('profile-')" :scene="scene" />
        <EmptyStateArtwork v-else :scene="scene" />
        <component
          :is="resolvedIcon"
          v-if="typeof icon !== 'string' && icon"
          class="empty-state__custom-icon"
        />
      </slot>
    </div>
    <div class="empty-state__copy">
      <span v-if="eyebrow" class="empty-state__eyebrow">{{ eyebrow }}</span>
      <p class="empty-state__title">
        <slot name="title">{{ title }}</slot>
      </p>
      <p v-if="hasDescription" class="empty-state__description">
        <slot name="description">{{ description }}</slot>
      </p>
      <div v-if="slots.default" class="empty-state__actions"><slot /></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  --empty-accent: var(--color-primary);
  --empty-art-width: 210px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
  padding: 36px 24px 44px;
  text-align: center;
  container-type: inline-size;

  &--hot {
    --empty-accent: var(--signal-hot-start);
  }
  &--rank {
    --empty-accent: var(--status-warning);
  }
  &--people,
  &--conversation,
  &--appreciation {
    --empty-accent: var(--brand-pink);
  }
  &--signal {
    --empty-accent: var(--status-warning);
  }
  &--collection,
  &--channel {
    --empty-accent: var(--status-success);
  }

  &[class*='empty-state--profile-'] {
    --empty-art-width: 248px;

    padding: clamp(28px, 4vw, 48px) 20px 40px;
  }

  &--profile-collection {
    --empty-accent: var(--status-success);
  }

  &--profile-fans {
    --empty-accent: var(--brand-pink);
  }

  &--sm {
    --empty-art-width: 132px;

    padding: 20px 16px 28px;
  }

  &--lg {
    --empty-art-width: 260px;

    padding: clamp(40px, 6vw, 80px) 24px;
  }
}

.empty-state__art {
  position: relative;
  width: min(var(--empty-art-width), 100%);
  margin-bottom: 14px;
  animation: empty-arrive 700ms var(--ease-out-expo) both;
}

.empty-state__copy {
  max-width: 360px;
  animation: empty-arrive 600ms var(--ease-out-expo) 100ms both;
}

.empty-state__eyebrow {
  display: block;
  margin-bottom: 10px;
  color: var(--empty-accent);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.2em;
}

.empty-state__title {
  color: var(--color-foreground);
  font-size: clamp(17px, 4.5cqi, 22px);
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: -0.025em;
  text-wrap: balance;
}

.empty-state__description {
  max-width: 32ch;
  margin: 10px auto 0;
  color: var(--color-muted-foreground);
  font-size: 13px;
  line-height: 1.85;
  text-wrap: pretty;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
  margin-top: 24px;
  animation: empty-arrive 600ms var(--ease-out-expo) 180ms both;

  :deep(a),
  :deep(button) {
    transition:
      transform 200ms var(--ease-out-quart),
      opacity 200ms ease;
  }

  :deep(a:hover),
  :deep(button:hover) {
    transform: translateY(-2px);
  }
  :deep(a:active),
  :deep(button:active) {
    transform: translateY(0);
  }
}

.empty-state__custom-icon {
  position: absolute;
  right: 22%;
  bottom: 15%;
  width: 22px;
  height: 22px;
  color: var(--empty-accent);
}

.empty-state--sm .empty-state__title {
  font-size: 15px;
}
.empty-state--sm .empty-state__description {
  font-size: 12px;
}
.empty-state--sm .empty-state__actions {
  margin-top: 16px;
}

@keyframes empty-arrive {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-state__art,
  .empty-state__copy,
  .empty-state__actions {
    animation: none;
  }
  .empty-state__actions :deep(a),
  .empty-state__actions :deep(button) {
    transition: none;
    transform: none;
  }
}
</style>
