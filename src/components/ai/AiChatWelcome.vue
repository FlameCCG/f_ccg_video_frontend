<script setup lang="ts">
import { ArrowUpRight, Search, Clapperboard, Image, Sparkles } from 'lucide-vue-next'
import type { AiModelType } from './ai-types'
import AiStudioMark from './AiStudioMark.vue'

defineProps<{ coverPickerMode: boolean }>()
const emit = defineEmits<{ choose: [mode: AiModelType, prompt: string] }>()
const suggestions = [
  {
    icon: Search,
    label: '发现值得看的',
    detail: '下一部心动，交给我来找',
    category: 'DISCOVER',
    theme: 'discover',
    mode: 'text' as const,
    prompt: '帮我推荐一些值得看的站内视频。',
  },
  {
    icon: Image,
    label: '让想象有画面',
    detail: '把脑海里的风景变成作品',
    category: 'IMAGINE',
    theme: 'imagine',
    mode: 'image' as const,
    prompt: '帮我画一幅有电影感的画面：',
  },
  {
    icon: Clapperboard,
    label: '让故事动起来',
    detail: '一句灵感，开启一段短片',
    category: 'CREATE',
    theme: 'create',
    mode: 'video' as const,
    prompt: '生成一段电影感短片：',
  },
]
const coverSuggestions = ['电影感光影', '极简留白', '梦幻插画']
</script>

<template>
  <section class="chat-welcome">
    <div class="chat-welcome__art" aria-hidden="true">
      <div class="chat-welcome__orbit chat-welcome__orbit--outer"></div>
      <div class="chat-welcome__orbit"></div>
      <div class="chat-welcome__orb"><AiStudioMark :size="44" /></div>
      <span class="chat-welcome__flight"><span class="chat-welcome__satellite"></span></span>
      <span class="chat-welcome__star">✦</span>
    </div>
    <div class="chat-welcome__eyebrow">A LITTLE SPARK. ENDLESS POSSIBILITIES.</div>
    <h3>
      {{ coverPickerMode ? '好作品，值得' : '每一个好想法，' }}
      <span>{{ coverPickerMode ? '一眼心动。' : '都从这里开始。' }}</span>
    </h3>
    <p>
      {{
        coverPickerMode
          ? '把主题、风格和氛围告诉我，一起做出让人想点开的封面。'
          : '探索喜欢的视频，把灵感绘成画面，让故事成为下一部作品。'
      }}
    </p>
    <div v-if="!coverPickerMode" class="chat-welcome__suggestions">
      <button
        v-for="(item, index) in suggestions"
        :key="item.theme"
        type="button"
        class="inspiration-card"
        :class="`inspiration-card--${item.theme}`"
        @click="emit('choose', item.mode, item.prompt)"
      >
        <div class="inspiration-card__visual" aria-hidden="true">
          <span class="inspiration-card__shape"></span>
          <span class="inspiration-card__shape inspiration-card__shape--second"></span>
          <component :is="item.icon" :size="22" :stroke-width="1.5" />
          <span class="inspiration-card__index">0{{ index + 1 }}</span>
        </div>
        <div class="inspiration-card__body">
          <span class="inspiration-card__category">{{ item.category }}</span>
          <strong>{{ item.label }}</strong>
          <small>{{ item.detail }}</small>
          <ArrowUpRight :size="17" class="inspiration-card__arrow" aria-hidden="true" />
        </div>
      </button>
    </div>
    <div v-else class="chat-welcome__cover-prompts">
      <button
        v-for="style in coverSuggestions"
        :key="style"
        type="button"
        @click="emit('choose', 'image', `为我的视频设计一张${style}风格的封面，主题是：`)"
      >
        <Sparkles :size="13" />{{ style }}<ArrowUpRight :size="13" />
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.chat-welcome {
  flex-shrink: 0;
  width: 100%;
  max-width: 740px;
  margin: auto;
  padding: 4px 0 12px;
  text-align: center;

  &__art {
    --orbit-x: 92px;
    --orbit-y: 41px;

    position: relative;
    display: grid;
    width: 210px;
    height: 152px;
    margin: 0 auto 6px;
    place-items: center;
    isolation: isolate;
    pointer-events: none;
    animation: spark-arrive 800ms var(--ease-out-quint) both;
  }
  &__art::before {
    position: absolute;
    z-index: -1;
    inset: 0 -35px;
    background: radial-gradient(
      ellipse,
      color-mix(in oklch, var(--brand-blue) 15%, transparent),
      transparent 67%
    );
    content: '';
    animation: studio-glow 6s ease-in-out infinite;
  }
  &__orb {
    position: relative;
    display: grid;
    width: 76px;
    height: 76px;
    place-items: center;
    overflow: hidden;
    color: var(--bg-surface-0);
    background: linear-gradient(
      145deg,
      color-mix(in oklch, var(--text-1) 78%, var(--brand-blue)),
      var(--text-1)
    );
    border: 1px solid color-mix(in oklch, var(--text-1) 80%, var(--brand-blue));
    border-radius: 23px;
    box-shadow:
      inset 0 1px 0 #ffffff20,
      0 12px 28px color-mix(in oklch, var(--text-1) 12%, transparent);
    animation: studio-float 6s ease-in-out infinite;
  }
  &__orb::after {
    position: absolute;
    inset: -30% -70%;
    background: linear-gradient(
      110deg,
      transparent 40%,
      color-mix(in oklch, var(--bg-surface-0) 13%, transparent) 49%,
      transparent 58%
    );
    content: '';
    transform: translateX(-70%);
    opacity: 0;
    animation: studio-sheen 9s ease-in-out infinite;
  }
  &__orbit {
    position: absolute;
    z-index: -1;
    width: 154px;
    height: 66px;
    border: 1px solid color-mix(in oklch, var(--brand-blue) 21%, transparent);
    border-radius: 50%;
    transform: rotate(-20deg);
  }
  &__orbit--outer {
    width: 184px;
    height: 82px;
    border-color: color-mix(in oklch, var(--brand-blue) 10%, transparent);
    animation: studio-ring 8s ease-in-out infinite;
  }
  &__flight {
    position: absolute;
    z-index: -1;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    transform: rotate(-20deg);
  }
  &__satellite {
    position: absolute;
    top: -4.5px;
    left: -4.5px;
    width: 9px;
    height: 9px;
    background: var(--brand-pink);
    border: 2px solid var(--bg-surface-0);
    border-radius: 50%;
    box-shadow: 0 0 0 5px color-mix(in oklch, var(--brand-pink) 10%, transparent);
    transform: translate(calc(var(--orbit-x) * 0.7071), calc(var(--orbit-y) * -0.7071));
    animation: studio-orbit 18s linear -2.25s infinite;
  }
  &__star {
    position: absolute;
    bottom: 32px;
    left: 29px;
    color: var(--brand-blue);
    font-size: 17px;
    animation: studio-twinkle 5s ease-in-out -1.5s infinite;
  }
  &__eyebrow {
    color: var(--text-2);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.22em;
  }
  h3 {
    margin: 14px 0 10px;
    color: var(--text-1);
    font-size: clamp(27px, 3.4vw, 38px);
    font-weight: 550;
    letter-spacing: -0.055em;
    line-height: 1.4;
  }
  h3 span {
    color: var(--brand-blue);
  }
  p {
    color: var(--text-2);
    font-size: 13px;
    line-height: 1.9;
  }
  &__suggestions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 25px;
    text-align: left;
  }
  &__cover-prompts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 28px;
  }
  &__cover-prompts button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    color: var(--text-2);
    background: var(--bg-surface-0);
    border: 1px solid var(--border-color);
    border-radius: 99px;
    font-size: 12px;
  }
  &__cover-prompts button:hover {
    color: var(--brand-blue);
  }
}
.inspiration-card {
  --card-accent: var(--brand-blue);
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: color-mix(in oklch, var(--bg-surface-0) 88%, var(--bg-surface-1));
  border: 1px solid color-mix(in oklch, var(--border-color) 75%, transparent);
  border-radius: 17px;
  text-align: left;
  transition:
    transform 220ms ease,
    border-color 220ms ease,
    box-shadow 220ms ease;
  &--imagine {
    --card-accent: var(--brand-pink);
  }
  &--create {
    --card-accent: color-mix(in oklch, var(--brand-blue) 50%, var(--brand-pink));
  }
  &:hover {
    border-color: color-mix(in oklch, var(--card-accent) 50%, var(--border-color));
    box-shadow: 0 12px 28px color-mix(in oklch, var(--card-accent) 10%, transparent);
    transform: translateY(-4px);
  }
  &__visual {
    position: relative;
    display: flex;
    height: 64px;
    align-items: center;
    padding: 22px;
    overflow: hidden;
    color: var(--card-accent);
    background: linear-gradient(
      115deg,
      color-mix(in oklch, var(--card-accent) 12%, var(--bg-surface-0)),
      color-mix(in oklch, var(--card-accent) 3%, var(--bg-surface-0))
    );
  }
  &__visual > svg {
    position: relative;
  }
  &__shape {
    position: absolute;
    top: -26px;
    right: 18px;
    width: 108px;
    height: 108px;
    border: 1px solid color-mix(in oklch, var(--card-accent) 22%, transparent);
    border-radius: 50%;
    transition: transform 400ms ease;
  }
  &__shape--second {
    top: 8px;
    right: -15px;
  }
  &--imagine &__shape {
    border-radius: 22px;
    transform: rotate(35deg);
  }
  &--create &__shape {
    width: 68px;
    border-radius: 40px;
    transform: rotate(35deg);
  }
  &:hover &__shape {
    transform: rotate(55deg) scale(1.08);
  }
  &__index {
    position: absolute;
    right: 13px;
    bottom: 10px;
    opacity: 0.7;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.1em;
  }
  &__body {
    position: relative;
    padding: 14px 17px 16px;
  }
  &__category {
    display: block;
    margin-bottom: 7px;
    color: var(--text-2);
    font-size: 8px;
    letter-spacing: 0.16em;
  }
  strong {
    display: block;
    color: var(--text-1);
    font-size: 14px;
    font-weight: 600;
  }
  small {
    display: block;
    margin-top: 6px;
    color: var(--text-2);
    font-size: 11px;
    line-height: 1.6;
  }
  &__arrow {
    position: absolute;
    top: 16px;
    right: 15px;
    color: var(--text-2);
    transition: transform 200ms ease;
  }
  &:hover &__arrow {
    color: var(--card-accent);
    transform: translate(2px, -2px);
  }
}
@keyframes spark-arrive {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
@keyframes studio-float {
  0%,
  100% {
    transform: translateY(3px) rotate(-2deg);
  }
  50% {
    transform: translateY(-5px) rotate(2deg);
  }
}
@keyframes studio-glow {
  0%,
  100% {
    transform: scale(0.94);
    opacity: 0.55;
  }
  50% {
    transform: scale(1.06);
    opacity: 1;
  }
}
@keyframes studio-ring {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
@keyframes studio-twinkle {
  0%,
  100% {
    transform: scale(0.85) rotate(-8deg);
    opacity: 0.45;
  }
  50% {
    transform: scale(1.08) rotate(8deg);
    opacity: 0.9;
  }
}
@keyframes studio-sheen {
  0%,
  65% {
    transform: translateX(-70%);
    opacity: 0;
  }
  70% {
    opacity: 1;
  }
  90% {
    transform: translateX(70%);
    opacity: 0;
  }
  100% {
    transform: translateX(70%);
    opacity: 0;
  }
}
// An ellipse sampled at 22.5 degrees; only transform changes each frame.
@keyframes studio-orbit {
  0%,
  100% {
    transform: translate(var(--orbit-x), 0);
  }
  6.25% {
    transform: translate(calc(var(--orbit-x) * 0.9239), calc(var(--orbit-y) * 0.3827));
  }
  12.5% {
    transform: translate(calc(var(--orbit-x) * 0.7071), calc(var(--orbit-y) * 0.7071));
  }
  18.75% {
    transform: translate(calc(var(--orbit-x) * 0.3827), calc(var(--orbit-y) * 0.9239));
  }
  25% {
    transform: translate(0, var(--orbit-y));
  }
  31.25% {
    transform: translate(calc(var(--orbit-x) * -0.3827), calc(var(--orbit-y) * 0.9239));
  }
  37.5% {
    transform: translate(calc(var(--orbit-x) * -0.7071), calc(var(--orbit-y) * 0.7071));
  }
  43.75% {
    transform: translate(calc(var(--orbit-x) * -0.9239), calc(var(--orbit-y) * 0.3827));
  }
  50% {
    transform: translate(calc(var(--orbit-x) * -1), 0);
  }
  56.25% {
    transform: translate(calc(var(--orbit-x) * -0.9239), calc(var(--orbit-y) * -0.3827));
  }
  62.5% {
    transform: translate(calc(var(--orbit-x) * -0.7071), calc(var(--orbit-y) * -0.7071));
  }
  68.75% {
    transform: translate(calc(var(--orbit-x) * -0.3827), calc(var(--orbit-y) * -0.9239));
  }
  75% {
    transform: translate(0, calc(var(--orbit-y) * -1));
  }
  81.25% {
    transform: translate(calc(var(--orbit-x) * 0.3827), calc(var(--orbit-y) * -0.9239));
  }
  87.5% {
    transform: translate(calc(var(--orbit-x) * 0.7071), calc(var(--orbit-y) * -0.7071));
  }
  93.75% {
    transform: translate(calc(var(--orbit-x) * 0.9239), calc(var(--orbit-y) * -0.3827));
  }
}
@media (width <= 600px) {
  .chat-welcome {
    padding: 4px 0 16px;
    &__art {
      height: 136px;
      margin-bottom: 5px;
    }
    &__eyebrow {
      font-size: 8px;
      letter-spacing: 0.14em;
    }
    h3 {
      margin-top: 15px;
      font-size: 28px;
    }
    h3 span {
      display: block;
    }
    p {
      max-width: 280px;
      margin: auto;
      font-size: 12px;
    }
    &__suggestions {
      grid-template-columns: 1fr;
      gap: 8px;
      margin-top: 23px;
    }
  }
  .inspiration-card {
    display: flex;
    align-items: stretch;
    border-radius: 13px;
    &__visual {
      width: 65px;
      height: auto;
      flex-shrink: 0;
      justify-content: center;
      padding: 12px;
    }
    &__index,
    &__category {
      display: none;
    }
    &__body {
      flex: 1;
      padding: 12px 32px 12px 14px;
    }
    strong {
      font-size: 13px;
    }
    small {
      margin-top: 3px;
      font-size: 10px;
    }
    &__arrow {
      top: 24px;
      right: 13px;
    }
  }
}
@container ai-chat (height <= 480px) {
  .chat-welcome {
    padding: 0 0 8px;
    &__art {
      --orbit-x: 81px;
      --orbit-y: 31px;
      height: 108px;
      margin-bottom: 4px;
    }
    &__orb {
      width: 58px;
      height: 58px;
      border-radius: 20px;
    }
    &__orbit {
      width: 134px;
      height: 52px;
    }
    &__orbit--outer {
      width: 162px;
      height: 62px;
    }
    &__star {
      bottom: 21px;
      left: 38px;
    }
    h3 {
      margin: 10px 0 7px;
      font-size: clamp(25px, 3.3vw, 32px);
    }
    &__suggestions {
      margin-top: 19px;
    }
  }
  .inspiration-card__visual {
    height: 48px;
  }
  .inspiration-card__body {
    padding-top: 12px;
    padding-bottom: 12px;
  }
}
@container ai-chat (height <= 350px) {
  .chat-welcome {
    &__art {
      --orbit-x: 69px;
      --orbit-y: 24px;
      height: 76px;
    }
    &__orb {
      width: 48px;
      height: 48px;
      border-radius: 16px;
    }
    &__orb svg {
      width: 25px;
      height: 25px;
    }
    &__orbit {
      width: 112px;
      height: 40px;
    }
    &__orbit--outer {
      width: 138px;
      height: 48px;
    }
    &__star {
      bottom: 10px;
      left: 45px;
      font-size: 13px;
    }
    &__eyebrow {
      display: none;
    }
    h3 {
      font-size: 25px;
    }
    &__suggestions {
      margin-top: 14px;
    }
  }
  .inspiration-card__visual {
    height: 34px;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .inspiration-card__category {
    display: none;
  }
}
@media (width <= 600px) {
  .inspiration-card__visual {
    height: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-welcome__art,
  .chat-welcome__art::before,
  .chat-welcome__orb,
  .chat-welcome__orb::after,
  .chat-welcome__orbit--outer,
  .chat-welcome__satellite,
  .chat-welcome__star {
    animation: none;
  }
  .inspiration-card,
  .inspiration-card__shape,
  .inspiration-card__arrow {
    transition: none;
  }
}
</style>
