<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Flame, BarChart2 } from 'lucide-vue-next'

const route = useRoute()

const navItems = [
  {
    name: '综合热门',
    path: '/hot',
    icon: Flame,
    color: 'text-[var(--status-warning-ink)]',
    bgColor: 'bg-[var(--status-warning-soft)]',
    activeColor: 'bg-[var(--status-warning)]',
  },
  {
    name: '排行榜',
    path: '/rank',
    icon: BarChart2,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    activeColor: 'signal-badge-rank',
  },
]

const currentPath = computed(() => route.path)
</script>

<template>
  <div class="mb-8 flex items-center justify-center gap-8 border-b border-border/50 pb-4">
    <router-link
      v-for="item in navItems"
      :key="item.name"
      :to="item.path"
      class="group relative flex flex-col items-center gap-2 transition-transform hover:scale-105"
    >
      <div
        class="flex h-12 w-12 items-center justify-center rounded-full transition-colors"
        :class="[currentPath === item.path ? item.activeColor : item.bgColor]"
      >
        <component
          :is="item.icon"
          class="h-6 w-6 transition-colors"
          :class="[currentPath === item.path ? 'text-[var(--signal-foreground)]' : item.color]"
        />
      </div>
      <span
        class="text-sm transition-colors"
        :class="[
          currentPath === item.path
            ? 'font-medium text-foreground'
            : 'text-muted-foreground group-hover:text-foreground',
        ]"
      >
        {{ item.name }}
      </span>
      <!-- Active Indicator -->
      <div
        v-if="currentPath === item.path"
        class="absolute -bottom-4 h-1 w-full rounded-t-full"
        :class="item.activeColor"
      />
    </router-link>
  </div>
</template>
