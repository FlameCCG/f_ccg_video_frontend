<script setup lang="ts">
import { ArrowUpRight, Search, Clapperboard, Image } from 'lucide-vue-next'
import type { AiModelType } from './ai-types'

defineProps<{ coverPickerMode: boolean }>()
const emit = defineEmits<{ choose: [mode: AiModelType, prompt: string] }>()
const suggestions = [
  {
    icon: Search,
    label: '发现好视频',
    detail: '找到下一份喜欢',
    mode: 'text' as const,
    prompt: '帮我推荐一些值得看的站内视频。',
  },
  {
    icon: Image,
    label: '画出脑海中的画面',
    detail: '让想象有形状',
    mode: 'image' as const,
    prompt: '帮我画一幅有电影感的画面：',
  },
  {
    icon: Clapperboard,
    label: '酝酿一个新作品',
    detail: '从一个灵感开始',
    mode: 'text' as const,
    prompt: '我想创作一条视频，帮我一起构思选题和脚本。',
  },
]
</script>

<template>
  <section class="chat-welcome">
    <div class="chat-welcome__eyebrow"><span></span> 给灵感一点空间</div>
    <h3>{{ coverPickerMode ? '一张封面，无限想象。' : '今天，聊点什么？' }}</h3>
    <p>
      {{
        coverPickerMode
          ? '说说作品的主题、氛围和风格，一起找到合适的画面。'
          : '找一部好视频，打磨一个想法，或是随意聊聊。'
      }}
    </p>
    <div v-if="!coverPickerMode" class="chat-welcome__suggestions">
      <button
        v-for="item in suggestions"
        :key="item.label"
        type="button"
        @click="emit('choose', item.mode, item.prompt)"
      >
        <component :is="item.icon" class="chat-welcome__icon" :size="18" aria-hidden="true" />
        <span
          ><strong>{{ item.label }}</strong
          ><small>{{ item.detail }}</small></span
        >
        <ArrowUpRight :size="16" class="chat-welcome__arrow" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.chat-welcome {
  width: 100%;
  max-width: 600px;
  margin: auto;
  padding: 32px 0;

  &__eyebrow {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--text-2);
    font-size: 12px;
    letter-spacing: 0.12em;
  }
  &__eyebrow span {
    width: 18px;
    height: 2px;
    background: var(--brand-pink);
  }
  h3 {
    margin: 22px 0 14px;
    color: var(--text-1);
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1.35;
  }
  p {
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.9;
  }
  &__suggestions {
    display: flex;
    flex-direction: column;
    margin-top: 30px;
  }
  button {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 4px;
    border-bottom: 1px solid var(--border-color);
    background: transparent;
    color: var(--text-1);
    text-align: left;
  }
  button:hover {
    color: var(--brand-blue);
  }
  button span {
    display: flex;
    flex: 1;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  strong {
    font-size: 14px;
    font-weight: 500;
  }
  small {
    color: var(--text-2);
    font-size: 12px;
  }
  &__icon {
    color: var(--text-2);
  }
  &__arrow {
    color: var(--text-2);
    transition: transform 180ms var(--ease-out-quart);
  }
  button:hover &__arrow {
    transform: translate(2px, -2px);
  }
}

@media (width <= 540px) {
  .chat-welcome {
    padding: 16px 0;
  }
  .chat-welcome button span {
    flex-direction: column;
    gap: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-welcome__arrow {
    transition: none;
  }
}
</style>
