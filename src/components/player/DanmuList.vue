<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getDanmuList, type DanmuItem } from '@/api/danmu'

const props = defineProps<{
  videoId: number
  partId?: number
}>()

const list = ref<DanmuItem[]>([])
const loading = ref(false)
const activeTab = ref<'danmu' | 'list'>('danmu')

const formatTime = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const fetchList = async () => {
  if (!props.videoId) return
  loading.value = true
  try {
    const result = await getDanmuList({
      videoId: props.videoId,
      partId: props.partId,
      pageSize: 200,
    })
    list.value = result.list ?? []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchList)
watch(() => props.videoId, fetchList)
</script>

<template>
  <div class="danmu-panel flex flex-col rounded-lg border border-border/60 bg-card">
    <!-- Header Tabs -->
    <div class="flex items-center border-b border-border/50 px-3">
      <button
        class="tab-btn"
        :class="{ 'is-active': activeTab === 'danmu' }"
        @click="activeTab = 'danmu'"
      >
        弹幕
      </button>
      <button
        class="tab-btn"
        :class="{ 'is-active': activeTab === 'list' }"
        @click="activeTab = 'list'"
      >
        弹幕列表
      </button>
      <span class="ml-auto text-xs text-muted-foreground"> {{ list.length }}条 </span>
    </div>

    <!-- Danmu List Content -->
    <div class="danmu-scroll flex-1 overflow-y-auto">
      <div v-if="loading" class="flex items-center justify-center py-10">
        <div
          class="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
        ></div>
      </div>

      <div v-else-if="list.length === 0" class="py-10 text-center text-xs text-muted-foreground">
        暂无弹幕
      </div>

      <table v-else class="w-full text-xs">
        <thead class="sticky top-0 bg-card">
          <tr class="text-left text-muted-foreground/70">
            <th class="px-3 py-1.5 font-medium">时间</th>
            <th class="px-2 py-1.5 font-medium">弹幕内容</th>
            <th class="px-3 py-1.5 font-medium text-right">发送时间</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in list"
            :key="item.id"
            class="danmu-row border-t border-border/30 transition-colors hover:bg-muted/40"
          >
            <td class="whitespace-nowrap px-3 py-1.5 text-primary/80">
              {{ formatTime(item.timeOffset) }}
            </td>
            <td class="max-w-[160px] truncate px-2 py-1.5 text-foreground/80">
              {{ item.content }}
            </td>
            <td class="whitespace-nowrap px-3 py-1.5 text-right text-muted-foreground/60">
              {{ formatDate(item.createdAt) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.danmu-panel {
  height: 380px;
}

.danmu-scroll {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}

.danmu-scroll::-webkit-scrollbar {
  width: 4px;
}

.danmu-scroll::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 2px;
}

.tab-btn {
  position: relative;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;
}

.tab-btn:hover {
  color: hsl(var(--foreground));
}

.tab-btn.is-active {
  color: #00a1d6;
}

.tab-btn.is-active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 12px;
  right: 12px;
  height: 2px;
  background: #00a1d6;
  border-radius: 1px;
}
</style>
