<script setup lang="ts">
defineProps<{ scene: string }>()
</script>

<template>
  <svg
    class="empty-art"
    :class="`empty-art--${scene}`"
    viewBox="0 0 240 160"
    fill="none"
    aria-hidden="true"
  >
    <ellipse class="empty-art__ground" cx="120" cy="143" rx="78" ry="4" />

    <!-- 放映卡：三层画幅以不同节奏轻轻悬浮。 -->
    <g v-if="scene === 'home' || scene === 'video'">
      <g class="empty-art__drift empty-art__drift--slow">
        <rect
          class="empty-art__paper empty-art__faint"
          x="30"
          y="43"
          width="134"
          height="82"
          rx="10"
          transform="rotate(-12 97 84)"
        />
      </g>
      <g class="empty-art__drift empty-art__drift--late">
        <rect
          class="empty-art__paper"
          x="80"
          y="27"
          width="130"
          height="82"
          rx="10"
          transform="rotate(10 145 68)"
        />
        <path class="empty-art__line" d="M178 44h14m-7-7v14" />
      </g>
      <g class="empty-art__drift">
        <rect
          class="empty-art__paper empty-art__front"
          x="49"
          y="45"
          width="142"
          height="86"
          rx="10"
        />
        <path class="empty-art__line empty-art__faint" d="M49 108h142M62 119h33m72 0h11" />
        <path class="empty-art__solid" d="m111 66 26 16-26 16Z" />
        <circle class="empty-art__solid empty-art__blink" cx="65" cy="59" r="2" />
      </g>
      <path class="empty-art__line empty-art__spark" d="M23 77h10m-5-5v10m169 46h10m-5-5v10" />
    </g>

    <!-- 热门：不使用假的热度数值，只以抽象声浪表现蓄势。 -->
    <g v-else-if="scene === 'hot'">
      <path
        class="empty-art__line empty-art__faint"
        d="M30 111h180M42 87h156M55 63h130"
        stroke-dasharray="2 7"
      />
      <rect
        v-for="(height, index) in [20, 38, 57, 82, 63, 43, 24]"
        :key="index"
        class="empty-art__bar"
        :x="49 + index * 21"
        :y="128 - height"
        width="9"
        :height="height"
        rx="4.5"
        :style="{ animationDelay: `${index * -0.22}s` }"
      />
      <g class="empty-art__drift">
        <path
          class="empty-art__paper empty-art__front"
          d="M119 16c10 14 22 23 22 37a22 22 0 0 1-44 0c0-9 4-17 10-22 0 9 4 12 7 13 8-8 7-18 5-28Z"
        />
        <path
          class="empty-art__solid"
          d="M120 42c6 8 11 13 11 19a11 11 0 0 1-22 0c0-6 5-12 11-19Z"
        />
      </g>
    </g>

    <g v-else-if="scene === 'rank'">
      <path class="empty-art__line empty-art__faint" d="M28 137h184M49 35l8 5m132-5-8 5M120 13v8" />
      <g class="empty-art__step" style="animation-delay: -0.6s">
        <path class="empty-art__paper" d="M43 86h49v51H43z" />
        <path class="empty-art__line" d="M60 105h14m-14 6h14" />
      </g>
      <g class="empty-art__step">
        <path class="empty-art__paper empty-art__front" d="M95 64h50v73H95z" />
        <path class="empty-art__line" d="M120 85v23" />
      </g>
      <g class="empty-art__step" style="animation-delay: -1.2s">
        <path class="empty-art__paper" d="M148 101h49v36h-49z" />
        <path class="empty-art__line" d="M167 112h12m-12 6h12m-12 6h12" />
      </g>
      <path
        class="empty-art__solid empty-art__drift"
        d="m120 26 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z"
      />
    </g>

    <g v-else-if="scene === 'channel'">
      <path
        class="empty-art__line empty-art__faint"
        d="M49 39h142v91H49zM49 84h142M120 39v91"
        stroke-dasharray="2 6"
      />
      <g class="empty-art__drift empty-art__drift--late">
        <rect
          class="empty-art__paper"
          x="38"
          y="29"
          width="63"
          height="46"
          rx="8"
          transform="rotate(-8 69 52)"
        />
        <path class="empty-art__line" d="M55 44h27m-27 10h17" />
      </g>
      <g class="empty-art__drift">
        <rect
          class="empty-art__paper empty-art__front"
          x="114"
          y="56"
          width="87"
          height="64"
          rx="9"
          transform="rotate(6 157 88)"
        />
        <path class="empty-art__solid" d="m149 76 20 13-20 13Z" />
      </g>
      <circle class="empty-art__line" cx="72" cy="109" r="18" />
      <path class="empty-art__line empty-art__spark" d="M65 109h14m-7-7v14M166 29h10m-5-5v10" />
    </g>

    <g v-else-if="scene === 'search'">
      <rect class="empty-art__paper" x="41" y="32" width="151" height="98" rx="12" />
      <path
        class="empty-art__line empty-art__faint"
        d="M58 51h58m-58 15h39m-39 40h32m58-55h27m-27 15h27"
      />
      <g class="empty-art__search">
        <circle class="empty-art__paper empty-art__front" cx="135" cy="85" r="30" />
        <path class="empty-art__line" d="m157 107 24 24M124 85h22" />
        <circle
          class="empty-art__line empty-art__faint"
          cx="135"
          cy="85"
          r="22"
          stroke-dasharray="2 5"
        />
      </g>
      <circle class="empty-art__solid empty-art__blink" cx="59" cy="85" r="3" />
    </g>

    <g v-else-if="scene === 'collection'">
      <g class="empty-art__drift empty-art__drift--slow">
        <rect
          class="empty-art__paper"
          x="73"
          y="25"
          width="87"
          height="100"
          rx="7"
          transform="rotate(-12 116 75)"
        />
      </g>
      <g class="empty-art__drift">
        <rect
          class="empty-art__paper empty-art__front"
          x="90"
          y="27"
          width="88"
          height="103"
          rx="7"
          transform="rotate(7 134 78)"
        />
        <path class="empty-art__solid" d="M145 30v37l10-7 10 7V33Z" />
        <path class="empty-art__line empty-art__faint" d="m108 93 43 5m-45 7 27 3" />
      </g>
      <path class="empty-art__paper" d="M39 85h58l12 12h91l-12 42H51Z" />
      <path class="empty-art__line" d="M100 119h38" />
    </g>

    <g v-else-if="scene === 'conversation'">
      <g class="empty-art__drift empty-art__drift--late">
        <path
          class="empty-art__paper"
          d="M102 68h91a11 11 0 0 1 11 11v35a11 11 0 0 1-11 11h-7l-17 13v-13h-67a11 11 0 0 1-11-11V79a11 11 0 0 1 11-11Z"
        />
        <path class="empty-art__line empty-art__faint" d="M122 94h60m-44 13h44" />
      </g>
      <g class="empty-art__drift">
        <path
          class="empty-art__paper empty-art__front"
          d="M43 31h100a12 12 0 0 1 12 12v40a12 12 0 0 1-12 12H80l-19 16V95H43a12 12 0 0 1-12-12V43a12 12 0 0 1 12-12Z"
        />
        <circle
          v-for="i in 3"
          :key="i"
          class="empty-art__solid empty-art__blink"
          :cx="60 + i * 17"
          cy="63"
          r="4"
          :style="{ animationDelay: `${i * 0.3}s` }"
        />
      </g>
    </g>

    <g v-else-if="scene === 'signal'">
      <path
        class="empty-art__line empty-art__faint"
        d="M28 106h37l17-35 25 54 20-40h85"
        stroke-dasharray="3 6"
      />
      <g class="empty-art__drift">
        <path
          class="empty-art__paper empty-art__front"
          d="M120 29 165 110a9 9 0 0 1-8 13H83a9 9 0 0 1-8-13Z"
        />
        <path class="empty-art__line" d="M120 62v24" />
        <circle class="empty-art__solid empty-art__blink" cx="120" cy="101" r="3" />
      </g>
      <path class="empty-art__line empty-art__spark" d="M50 43h12m-6-6v12m130 4h10" />
    </g>

    <g v-else-if="scene === 'history'">
      <path class="empty-art__line empty-art__faint" d="M28 120h184" stroke-dasharray="3 7" />
      <circle class="empty-art__paper empty-art__front" cx="124" cy="73" r="43" />
      <circle
        class="empty-art__line empty-art__faint"
        cx="124"
        cy="73"
        r="34"
        stroke-dasharray="1 8"
      />
      <path class="empty-art__line empty-art__hand" d="M124 73V48" />
      <path class="empty-art__line" d="m124 73 18 12" />
      <circle class="empty-art__solid" cx="124" cy="73" r="3" />
      <g class="empty-art__drift empty-art__drift--late">
        <rect class="empty-art__paper" x="42" y="88" width="48" height="35" rx="6" />
        <path class="empty-art__solid" d="m61 98 12 7-12 7Z" />
      </g>
    </g>

    <g v-else-if="scene === 'appreciation'">
      <ellipse
        class="empty-art__line empty-art__faint"
        cx="120"
        cy="91"
        rx="89"
        ry="31"
        transform="rotate(-18 120 91)"
        stroke-dasharray="2 7"
      />
      <g class="empty-art__drift">
        <path
          class="empty-art__paper empty-art__front"
          d="M120 128 77 87C39 50 89 15 120 52c31-37 81-2 43 35Z"
        />
        <path class="empty-art__line empty-art__faint" d="M81 66c0-10 10-15 18-10" />
      </g>
      <path class="empty-art__solid empty-art__spark" d="m184 43 3 8 9 3-9 3-3 8-3-8-9-3 9-3Z" />
      <circle class="empty-art__solid empty-art__blink" cx="53" cy="117" r="3" />
    </g>

    <g v-else-if="scene === 'people'">
      <path
        class="empty-art__line empty-art__faint"
        d="M60 98 120 48l61 50M60 98h121"
        stroke-dasharray="3 7"
      />
      <g
        v-for="(point, index) in [
          [60, 98],
          [120, 48],
          [181, 98],
        ]"
        :key="index"
        class="empty-art__drift"
        :style="{ animationDelay: `${index * -1.3}s` }"
      >
        <circle class="empty-art__paper" :cx="point[0]" :cy="point[1]" r="25" />
        <circle class="empty-art__solid" :cx="point[0]" :cy="(point[1] ?? 0) - 5" r="6" />
        <path
          class="empty-art__line"
          :d="`M${(point[0] ?? 0) - 11} ${(point[1] ?? 0) + 12}q11-15 22 0`"
        />
      </g>
    </g>

    <g v-else>
      <g class="empty-art__drift empty-art__drift--slow">
        <rect
          class="empty-art__paper empty-art__faint"
          x="63"
          y="27"
          width="111"
          height="101"
          rx="10"
          transform="rotate(-9 118 78)"
        />
      </g>
      <g class="empty-art__drift">
        <rect
          class="empty-art__paper empty-art__front"
          x="69"
          y="35"
          width="111"
          height="98"
          rx="10"
          transform="rotate(5 124 84)"
        />
        <path class="empty-art__line" d="M91 92h64m-64 12h45" />
        <circle class="empty-art__solid empty-art__blink" cx="101" cy="66" r="7" />
        <path class="empty-art__line empty-art__faint" d="M119 65h32" />
      </g>
      <path class="empty-art__line empty-art__spark" d="M41 69h12m-6-6v12m145 37h12m-6-6v12" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.empty-art {
  display: block;
  width: 100%;
  overflow: visible;
  color: var(--empty-accent, var(--color-primary));
  stroke-width: 1.25;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.empty-art__paper {
  fill: var(--color-card);
  stroke: color-mix(in oklch, currentcolor 28%, var(--color-border));
}

.empty-art__front {
  fill: color-mix(in oklch, currentcolor 7%, var(--color-card));
  stroke: color-mix(in oklch, currentcolor 55%, var(--color-border));
}

.empty-art__line {
  stroke: currentcolor;
}
.empty-art__solid {
  fill: currentcolor;
}
.empty-art__faint {
  opacity: 0.35;
}
.empty-art__ground {
  fill: currentcolor;
  opacity: 0.045;
}

.empty-art__drift {
  animation: art-drift 5.6s ease-in-out infinite;

  &--slow {
    animation-duration: 7s;
    animation-delay: -2s;
  }
  &--late {
    animation-delay: -2.8s;
  }
}

.empty-art__blink {
  animation: art-breathe 3.2s ease-in-out infinite;
}
.empty-art__spark {
  animation: art-breathe 5s ease-in-out -1s infinite;
}

.empty-art__bar {
  fill: currentcolor;
  opacity: 0.6;
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: art-wave 2.8s ease-in-out infinite;
}

.empty-art__step {
  animation: art-drift 6s ease-in-out infinite;
}
.empty-art__search {
  animation: art-search 7s ease-in-out infinite;
}
.empty-art__hand {
  transform-origin: 124px 73px;
  animation: art-clock 16s linear infinite;
}

@keyframes art-drift {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes art-breathe {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.85;
  }
}

@keyframes art-wave {
  0%,
  100% {
    transform: scaleY(0.52);
    opacity: 0.35;
  }
  50% {
    transform: scaleY(1);
    opacity: 0.8;
  }
}

@keyframes art-search {
  0%,
  100% {
    transform: translate(0, 0);
  }
  35% {
    transform: translate(-12px, -5px);
  }
  70% {
    transform: translate(7px, 3px);
  }
}

@keyframes art-clock {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .empty-art * {
    animation: none;
  }
}
</style>
