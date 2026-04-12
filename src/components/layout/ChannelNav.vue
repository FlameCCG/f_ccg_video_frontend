<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Activity, Flame } from 'lucide-vue-next'
import { getPartitions, type Partition } from '@/api/video'

const partitions = ref<Partition[]>([])
const failed = ref(false)
const loading = ref(false)

const loadPartitions = async () => {
  if (loading.value) return
  loading.value = true
  failed.value = false
  try {
    const data = await getPartitions()
    partitions.value = data
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
onMounted(loadPartitions)

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
    <div
      class="mx-auto flex max-w-[1800px] flex-col gap-3 px-4 sm:px-6 lg:flex-row lg:items-center lg:gap-0 lg:px-8"
    >
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
        class="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:ml-6 lg:grid lg:flex-1 lg:grid-cols-[repeat(11,minmax(0,1fr))] lg:gap-x-2.5 lg:gap-y-3 lg:border-l lg:border-border/50 lg:pb-0 lg:pl-6"
        aria-label="视频分区"
      >
        <router-link
          v-for="partition in partitions"
          :key="partition.id"
          :to="`/partition/${partition.id}`"
          class="flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-secondary px-3 text-[13px] tracking-wide text-muted-foreground hover:bg-accent hover:text-accent-foreground lg:min-h-8 lg:px-2"
        >
          {{ partition.name }}
        </router-link>
        <button
          v-if="failed"
          type="button"
          class="min-h-11 shrink-0 px-3 text-sm text-muted-foreground"
          :disabled="loading"
          @click="loadPartitions"
        >
          分区加载失败，点击重试
        </button>
      </div>
    </div>
  </div>
</template>
