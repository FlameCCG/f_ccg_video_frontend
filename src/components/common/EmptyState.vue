<script setup lang="ts">
/**
 * EmptyState —— 全站统一空状态原语。
 *
 * 视觉：lucide 线性图标压在「光晕井」（同心圆衬底）里 + 标题 + 副文案 + 可选 CTA。
 * 不使用 emoji / 插画资源，颜色全部走 token，暗色由 html.dark 换变量自动适配。
 * 动效：图标 → 标题 → 描述 → 行动区 依次 opacity + 上移入场（stagger），
 *      仅动 transform / opacity，prefers-reduced-motion 下退化为无动画。
 */
import { computed, useSlots, type Component } from 'vue'
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
  /** 副文案：给出下一步动作或原因，20-40 字为宜。 */
  description?: string
  /** sm=侧栏/内嵌列表，md=卡片内，lg=整页。 */
  size?: 'sm' | 'md' | 'lg'
  /** 置为 true 时容器成为 aria live region（搜索无结果等「结果变化」场景用）。 */
  announce?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  icon: undefined,
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

const hasDescription = computed(() => Boolean(props.description) || Boolean(slots.description))
</script>

<template>
  <div
    class="empty-state"
    :class="`empty-state--${size}`"
    :role="announce ? 'status' : undefined"
    :aria-live="announce ? 'polite' : undefined"
  >
    <div class="empty-state__well">
      <slot name="icon">
        <component
          :is="resolvedIcon"
          class="empty-state__icon"
          :stroke-width="1.5"
          aria-hidden="true"
        />
      </slot>
    </div>

    <p class="empty-state__title">
      <slot name="title">{{ title }}</slot>
    </p>

    <p v-if="hasDescription" class="empty-state__description">
      <slot name="description">{{ description }}</slot>
    </p>

    <div v-if="slots.default" class="empty-state__actions">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.empty-state {
  /* md（卡片内）为基准尺寸 */
  --es-well: 56px;
  --es-icon: 24px;
  --es-ring-inner: 10px;
  --es-ring-outer: 19px;
  --es-gap: 18px;
  --es-pad-block: 48px;
  --es-pad-inline: 24px;
  --es-title-size: 0.9375rem;
  --es-desc-size: 0.8125rem;
  --es-title-gap: 6px;
  --es-action-gap: 20px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--es-pad-block) var(--es-pad-inline);
  text-align: center;
}

.empty-state--sm {
  --es-well: 40px;
  --es-icon: 18px;
  --es-ring-inner: 7px;
  --es-ring-outer: 14px;
  --es-gap: 12px;
  --es-pad-block: 28px;
  --es-pad-inline: 16px;
  --es-title-size: 0.875rem;
  --es-desc-size: 0.75rem;
  --es-title-gap: 4px;
  --es-action-gap: 14px;
}

.empty-state--lg {
  --es-well: 72px;
  --es-icon: 30px;
  --es-ring-inner: 13px;
  --es-ring-outer: 24px;
  --es-gap: 22px;
  --es-pad-block: 72px;
  --es-pad-inline: 24px;
  --es-title-size: 1.0625rem;
  --es-desc-size: 0.875rem;
  --es-title-gap: 8px;
  --es-action-gap: 24px;
}

/* 光晕井：内描边 + 两层同心扩散环，全部由 foreground 混色生成，自动跟随主题 */
.empty-state__well {
  display: grid;
  place-items: center;
  width: var(--es-well);
  height: var(--es-well);
  margin-bottom: var(--es-gap);
  color: var(--color-muted-foreground);
  background-color: color-mix(in oklch, var(--color-foreground) 4%, transparent);
  border-radius: 50%;
  box-shadow:
    inset 0 0 0 1px color-mix(in oklch, var(--color-foreground) 7%, transparent),
    0 0 0 var(--es-ring-inner) color-mix(in oklch, var(--color-foreground) 2.5%, transparent),
    0 0 0 calc(var(--es-ring-inner) + 1px)
      color-mix(in oklch, var(--color-foreground) 5%, transparent),
    0 0 0 var(--es-ring-outer) color-mix(in oklch, var(--color-foreground) 1.5%, transparent);
  animation: empty-state-rise var(--duration-slow) var(--ease-out-expo) both;
}

.empty-state__icon {
  width: var(--es-icon);
  height: var(--es-icon);
}

.empty-state__title {
  max-width: 34ch;
  margin-bottom: var(--es-title-gap);
  font-size: var(--es-title-size);
  font-weight: 600;
  line-height: 1.45;
  color: var(--color-foreground);
  letter-spacing: -0.01em;
  text-wrap: balance;
  animation: empty-state-rise var(--duration-slow) var(--ease-out-expo) 70ms both;
}

.empty-state__description {
  max-width: 32ch;
  font-size: var(--es-desc-size);
  line-height: 1.65;
  color: var(--color-muted-foreground);
  text-wrap: pretty;
  animation: empty-state-rise var(--duration-slow) var(--ease-out-expo) 110ms both;
}

.empty-state__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: var(--es-action-gap);
  animation: empty-state-rise var(--duration-slow) var(--ease-out-expo) 160ms both;
}

@keyframes empty-state-rise {
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-state__well,
  .empty-state__title,
  .empty-state__description,
  .empty-state__actions {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
</style>
