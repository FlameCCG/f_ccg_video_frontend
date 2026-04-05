<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Activity, Flame } from 'lucide-vue-next'
import { getPartitions, type Partition } from '@/api/video'

const partitions = ref<Partition[]>([])

onMounted(async () => {
  try {
    const data = await getPartitions()
    partitions.value = data
  } catch (error) {
    console.error('Failed to fetch partitions:', error)
  }
})

const fixedLinks = [
  {
    name: '动态',
    path: '/dynamic',
    icon: Activity,
    color: 'signal-badge-dynamic',
  },
  { name: '热门', path: '/hot', icon: Flame, color: 'signal-badge-hot' },
]
</script>

<template>
  <div class="w-full bg-background py-3">
    <div class="mx-auto flex max-w-[1800px] items-center px-4 sm:px-6 lg:px-8">
      <!-- Fixed Links (Dynamic, Hot) -->
      <div class="flex shrink-0 items-center gap-6">
        <router-link
          v-for="link in fixedLinks"
          :key="link.path"
          :to="link.path"
          class="group flex flex-col items-center gap-1.5 cursor-pointer"
        >
          <div
            class="flex h-[46px] w-[46px] items-center justify-center rounded-full text-[var(--signal-foreground)] shadow-sm transition-transform group-hover:scale-105"
            :class="link.color"
          >
            <component :is="link.icon" class="h-[22px] w-[22px]" />
          </div>
          <span
            class="text-[14px] text-foreground/80 group-hover:text-foreground transition-colors"
          >
            {{ link.name }}
          </span>
        </router-link>
      </div>

      <!-- Partitions - Two rows -->
      <div
        class="grid flex-1 grid-cols-[repeat(11,minmax(0,1fr))] gap-y-3 gap-x-2.5 pl-6 border-l border-border/50 ml-6"
      >
        <router-link
          v-for="partition in partitions"
          :key="partition.id"
          :to="`/partition/${partition.id}`"
          class="flex h-[26px] items-center justify-center rounded-md bg-secondary px-2 text-[13px] tracking-wide text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          {{ partition.name }}
        </router-link>
      </div>
    </div>
  </div>
</template>
