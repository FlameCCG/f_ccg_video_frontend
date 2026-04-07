<script setup lang="ts">
defineProps<{ scene: string }>()
</script>

<template>
  <svg class="profile-art" viewBox="0 0 280 184" fill="none" aria-hidden="true" focusable="false">
    <ellipse class="profile-art__shadow" cx="140" cy="163" rx="83" ry="5" />
    <path class="profile-art__guide" d="M27 148h27m172 0h27M38 140v16m204-16v16" />

    <!-- 放映室：画幅、场记板与播放光圈。 -->
    <g v-if="scene === 'profile-video'">
      <path class="profile-art__guide" d="M44 56V35h24m144 0h24v21M44 120v22h24m144 0h24v-22" />
      <g class="profile-art__float profile-art__float--back">
        <rect
          class="profile-art__paper"
          x="70"
          y="37"
          width="150"
          height="98"
          rx="10"
          transform="rotate(9 145 86)"
        />
        <path class="profile-art__line profile-art__subtle" d="m87 52 99 16" />
      </g>
      <g class="profile-art__float">
        <rect class="profile-art__edge" x="54" y="60" width="158" height="94" rx="10" />
        <rect class="profile-art__paper" x="54" y="54" width="158" height="94" rx="10" />
        <rect class="profile-art__wash" x="63" y="63" width="140" height="62" rx="5" />
        <circle class="profile-art__halo" cx="133" cy="93" r="26" />
        <circle class="profile-art__ring profile-art__breathe" cx="133" cy="93" r="20" />
        <path class="profile-art__solid" d="m127 83 17 10-17 10Z" />
        <path class="profile-art__line profile-art__subtle" d="M68 136h52m60 0h17" />
        <circle class="profile-art__solid" cx="168" cy="136" r="2" />
      </g>
      <g class="profile-art__float profile-art__float--detail">
        <path class="profile-art__paper" d="m76 29 106-12 3 20L79 49Z" />
        <path
          class="profile-art__line"
          d="m93 28-8 17m29-19-8 17m29-19-8 17m29-19-8 17m29-19-8 17"
        />
      </g>
      <path class="profile-art__coral profile-art__breathe" d="M230 81v10m-5-5h10" />
    </g>

    <!-- 动态手稿：纸张和正在落下的一笔。 -->
    <g v-else-if="scene === 'profile-activity'">
      <path
        class="profile-art__guide"
        d="M29 112c18-42 66-79 124-77 39 1 66 20 88 47"
        stroke-dasharray="3 7"
      />
      <g class="profile-art__float profile-art__float--back">
        <rect
          class="profile-art__paper"
          x="77"
          y="31"
          width="114"
          height="124"
          rx="10"
          transform="rotate(-11 134 93)"
        />
      </g>
      <g class="profile-art__float">
        <path class="profile-art__edge" d="M94 35h75l25 25v92H94Z" />
        <path class="profile-art__paper" d="M88 29h75l25 25v92H88Z" />
        <path class="profile-art__wash" d="M163 29v25h25Z" />
        <path class="profile-art__line" d="M163 29v25h25M105 73h62" />
        <path class="profile-art__line profile-art__subtle" d="M105 88h48m-48 15h58m-58 15h30" />
        <circle class="profile-art__halo" cx="106" cy="50" r="6" />
      </g>
      <g class="profile-art__pen">
        <path class="profile-art__paper" d="m185 64 13 8-43 64-19 8 3-21Z" />
        <path class="profile-art__solid" d="m185 64 5-8a5 5 0 0 1 7-1l5 3a5 5 0 0 1 1 7l-5 7Z" />
        <path class="profile-art__line" d="m139 123 16 13m-19 8 5-8" />
      </g>
      <g class="profile-art__float profile-art__float--detail">
        <path
          class="profile-art__paper"
          d="M40 83h33a6 6 0 0 1 6 6v19a6 6 0 0 1-6 6h-8l-9 8v-8H40a6 6 0 0 1-6-6V89a6 6 0 0 1 6-6Z"
        />
        <path class="profile-art__coral" d="M46 98h21" />
      </g>
    </g>

    <!-- 收藏：展开的档案夹和书签。 -->
    <g v-else-if="scene === 'profile-collection'">
      <g class="profile-art__float profile-art__float--back">
        <rect
          class="profile-art__paper"
          x="67"
          y="41"
          width="82"
          height="107"
          rx="8"
          transform="rotate(-13 108 94)"
        />
        <path class="profile-art__line profile-art__subtle" d="m82 61 44-10m-42 22 35-8" />
      </g>
      <g class="profile-art__float">
        <rect
          class="profile-art__edge"
          x="112"
          y="29"
          width="86"
          height="121"
          rx="9"
          transform="rotate(7 155 89)"
        />
        <rect
          class="profile-art__paper"
          x="107"
          y="24"
          width="86"
          height="121"
          rx="9"
          transform="rotate(7 150 84)"
        />
        <path class="profile-art__ribbon" d="m159 25-4 42 12-6 10 9 5-42Z" />
        <path class="profile-art__line profile-art__subtle" d="m122 89 43 5m-45 9 29 4" />
      </g>
      <path class="profile-art__edge" d="M48 90h65l12 13h103l-15 54H61Z" />
      <path class="profile-art__paper" d="M44 85h65l12 13h103l-15 54H57Z" />
      <path class="profile-art__wash" d="M46 92h61l12 13h101l-11 41H58Z" />
      <path class="profile-art__line" d="M116 128h36" />
      <path
        class="profile-art__coral profile-art__float profile-art__float--detail"
        d="m224 43 3 10 10 3-10 3-3 10-3-10-10-3 10-3Z"
      />
    </g>

    <!-- 关注：沿着兴趣，找到另一个创作者。 -->
    <g v-else-if="scene === 'profile-following'">
      <path
        class="profile-art__guide"
        d="M46 127c3-42 49-85 97-83 35 2 58 27 72 62"
        stroke-dasharray="3 7"
      />
      <g class="profile-art__float profile-art__float--back">
        <rect
          class="profile-art__paper"
          x="51"
          y="72"
          width="69"
          height="76"
          rx="12"
          transform="rotate(-9 85 110)"
        />
        <circle class="profile-art__wash" cx="84" cy="96" r="11" />
        <path class="profile-art__line profile-art__subtle" d="M69 122q15-17 30 0m-23 13h15" />
      </g>
      <g class="profile-art__float">
        <rect class="profile-art__edge" x="130" y="40" width="88" height="105" rx="12" />
        <rect class="profile-art__paper" x="124" y="34" width="88" height="105" rx="12" />
        <circle class="profile-art__halo" cx="168" cy="73" r="24" />
        <circle class="profile-art__solid" cx="168" cy="66" r="8" />
        <path class="profile-art__line" d="M154 86q14-19 28 0" />
        <path class="profile-art__line profile-art__subtle" d="M147 111h42m-32 12h22" />
      </g>
      <g class="profile-art__float profile-art__float--detail">
        <circle class="profile-art__paper" cx="122" cy="130" r="18" />
        <path class="profile-art__line" d="M115 130h14m-7-7v14" />
      </g>
      <path class="profile-art__coral profile-art__breathe" d="m74 40 11-8m-3 16 12-3" />
    </g>

    <!-- 粉丝：由同一份热爱连接的人。 -->
    <g v-else-if="scene === 'profile-fans'">
      <ellipse
        class="profile-art__guide"
        cx="140"
        cy="106"
        rx="100"
        ry="38"
        transform="rotate(-12 140 106)"
      />
      <path class="profile-art__guide" d="m71 114 68-51 73 51" stroke-dasharray="3 6" />
      <g class="profile-art__float profile-art__float--back">
        <circle class="profile-art__paper" cx="69" cy="109" r="28" />
        <circle class="profile-art__wash" cx="69" cy="102" r="8" />
        <path class="profile-art__line profile-art__subtle" d="M56 121q13-18 26 0" />
      </g>
      <g class="profile-art__float profile-art__float--detail">
        <circle class="profile-art__paper" cx="213" cy="111" r="25" />
        <circle class="profile-art__wash" cx="213" cy="104" r="7" />
        <path class="profile-art__line profile-art__subtle" d="M201 122q12-16 24 0" />
      </g>
      <g class="profile-art__float">
        <circle class="profile-art__edge" cx="145" cy="72" r="39" />
        <circle class="profile-art__paper" cx="140" cy="67" r="39" />
        <circle class="profile-art__halo" cx="140" cy="67" r="31" />
        <circle class="profile-art__solid" cx="140" cy="57" r="10" />
        <path class="profile-art__line" d="M122 85q18-26 36 0" />
      </g>
      <g class="profile-art__breathe">
        <path
          class="profile-art__ribbon"
          d="M140 134c-20-12-17-25-8-25 4 0 7 3 8 6 1-3 4-6 8-6 9 0 12 13-8 25Z"
        />
      </g>
      <circle class="profile-art__solid profile-art__subtle" cx="89" cy="49" r="3" />
      <circle class="profile-art__solid profile-art__subtle" cx="188" cy="37" r="2" />
    </g>

    <!-- 动态流：等待下一段内容抵达的讯号站。 -->
    <g v-else>
      <ellipse class="profile-art__guide" cx="140" cy="117" rx="96" ry="37" />
      <g class="profile-art__float profile-art__float--back">
        <rect
          class="profile-art__paper"
          x="36"
          y="63"
          width="66"
          height="51"
          rx="9"
          transform="rotate(-12 69 88)"
        />
        <path class="profile-art__solid" d="m60 79 16 8-16 10Z" />
      </g>
      <g class="profile-art__float profile-art__float--detail">
        <rect
          class="profile-art__paper"
          x="185"
          y="79"
          width="58"
          height="46"
          rx="9"
          transform="rotate(10 214 102)"
        />
        <path class="profile-art__line profile-art__subtle" d="m199 94 30 5m-32 5 20 4" />
      </g>
      <g class="profile-art__signal">
        <path
          class="profile-art__ring"
          d="M109 47a44 44 0 0 1 62 0m-52 10a30 30 0 0 1 42 0m-32 10a16 16 0 0 1 22 0"
        />
      </g>
      <g class="profile-art__float">
        <path class="profile-art__edge" d="m122 148 23-65 23 65Z" />
        <path class="profile-art__paper" d="m117 143 23-65 23 65Z" />
        <path class="profile-art__line" d="m130 109 22 16m-28 0 26-17M117 143h46" />
        <circle class="profile-art__halo" cx="140" cy="79" r="13" />
        <circle class="profile-art__solid" cx="140" cy="79" r="5" />
        <rect class="profile-art__paper" x="102" y="143" width="76" height="12" rx="6" />
      </g>
      <path class="profile-art__coral profile-art__breathe" d="M212 43v12m-6-6h12" />
    </g>
  </svg>
</template>

<style scoped lang="scss">
.profile-art {
  display: block;
  width: 100%;
  overflow: visible;
  color: var(--empty-accent, var(--brand-blue));
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.profile-art__paper {
  fill: var(--bg-surface-1);
  stroke: color-mix(in oklch, currentcolor 40%, var(--border-color));
}
.profile-art__edge {
  fill: color-mix(in oklch, currentcolor 12%, var(--bg-surface-2));
  stroke: color-mix(in oklch, currentcolor 22%, var(--border-color));
}
.profile-art__wash {
  fill: color-mix(in oklch, currentcolor 9%, var(--bg-surface-1));
}
.profile-art__halo {
  fill: color-mix(in oklch, currentcolor 12%, var(--bg-surface-1));
}
.profile-art__solid {
  fill: currentcolor;
}
.profile-art__line {
  stroke: currentcolor;
}
.profile-art__ring {
  stroke: currentcolor;
  opacity: 0.6;
}
.profile-art__guide {
  stroke: color-mix(in oklch, currentcolor 17%, var(--border-color));
  opacity: 0.6;
}
.profile-art__shadow {
  fill: currentcolor;
  opacity: 0.05;
}
.profile-art__subtle {
  opacity: 0.45;
}
.profile-art__coral {
  stroke: var(--brand-pink);
}
.profile-art__ribbon {
  fill: color-mix(in oklch, var(--brand-pink) 20%, var(--bg-surface-1));
  stroke: var(--brand-pink);
}
.profile-art__float {
  animation: profile-art-float 6s ease-in-out infinite;
}
.profile-art__float--back {
  animation-duration: 8s;
  animation-delay: -3s;
}
.profile-art__float--detail {
  animation-duration: 7s;
  animation-delay: -1.5s;
}
.profile-art__breathe {
  animation: profile-art-breathe 4.5s ease-in-out infinite;
}
.profile-art__pen {
  animation: profile-art-write 7s var(--ease-out-quart) infinite;
}
.profile-art__signal {
  transform-origin: 140px 79px;
  animation: profile-art-signal 4s ease-out infinite;
}

@keyframes profile-art-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

@keyframes profile-art-breathe {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 0.9;
  }
}

@keyframes profile-art-write {
  0%,
  65%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(4px, -3px);
  }
  45% {
    transform: translate(1px, -1px);
  }
}

@keyframes profile-art-signal {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.85;
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .profile-art * {
    animation: none;
  }
}
</style>
