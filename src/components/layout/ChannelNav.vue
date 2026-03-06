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
    color: 'bg-gradient-to-br from-orange-400 to-orange-500',
  },
  { name: '热门', path: '/hot', icon: Flame, color: 'bg-gradient-to-br from-red-400 to-red-500' },
]
</script>

<template>
  <div class="w-full bg-background py-3">
    <div class="mx-auto flex max-w-[2000px] items-start gap-6 px-6 sm:px-10 lg:px-16">
      <!-- Fixed Links (Dynamic, Hot) -->
      <div class="flex items-center gap-4 pt-1">
        <router-link
          v-for="link in fixedLinks"
          :key="link.path"
          :to="link.path"
          class="group flex flex-col items-center gap-1 cursor-pointer"
        >
          <div
            class="flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md transition-transform group-hover:scale-105"
            :class="link.color"
          >
            <component :is="link.icon" class="h-5 w-5" />
          </div>
          <span class="text-xs text-muted-foreground group-hover:text-primary transition-colors">{{
            link.name
          }}</span>
        </router-link>
      </div>

      <!-- Partitions - Two rows like Bilibili -->
      <div class="flex flex-1 flex-col gap-2 overflow-hidden">
        <!-- Row 1 -->
        <div class="flex flex-wrap items-center gap-1">
          <router-link
            v-for="partition in partitions.slice(0, Math.ceil(partitions.length / 2))"
            :key="partition.id"
            :to="`/partition/${partition.id}`"
            class="rounded-md px-4 py-1.5 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-primary cursor-pointer"
          >
            {{ partition.name }}
          </router-link>
        </div>
        <!-- Row 2 -->
        <div class="flex flex-wrap items-center gap-1">
          <router-link
            v-for="partition in partitions.slice(Math.ceil(partitions.length / 2))"
            :key="partition.id"
            :to="`/partition/${partition.id}`"
            class="rounded-md px-4 py-1.5 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-primary cursor-pointer"
          >
            {{ partition.name }}
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
