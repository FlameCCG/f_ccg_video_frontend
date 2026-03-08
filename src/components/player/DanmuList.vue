<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getDanmuList, type DanmuItem } from '@/api/danmu'
import { MoreVertical, ChevronUp } from 'lucide-vue-next'

const props = defineProps<{
  videoId: number
  partId?: number
}>()

const emit = defineEmits<{
  seek: [time: number]
}>()

const list = ref<DanmuItem[]>([])
const loading = ref(false)
const isCollapsed = ref(false)

const isSecondsFormat = () => {
  return list.value.length > 0 && list.value.every((d) => d.timeOffset > 0 && d.timeOffset < 10000)
}

const formatTime = (ms: number): string => {
  const totalSec = isSecondsFormat() ? ms : Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const getRealTime = (ms: number): number => {
  return isSecondsFormat() ? ms : ms / 1000
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const fetchList = async () => {
  if (!props.videoId) return
  loading.value = true
  try {
    const params: { videoId: number; partId?: number; pageSize: number } = {
      videoId: props.videoId,
      pageSize: 200,
    }
    if (props.partId) params.partId = props.partId
    const result = await getDanmuList(params)
    list.value = result.list ?? []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

const seekTo = (timeOffset: number) => {
  emit('seek', getRealTime(timeOffset))
}

onMounted(fetchList)
watch(() => [props.videoId, props.partId], fetchList)
</script>

<template>
  <div
    class="danmu-panel flex flex-col rounded-lg border border-border/60 bg-card transition-all duration-300"
    :class="{ 'h-auto': isCollapsed }"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b border-border/50 bg-muted/10 hover:bg-muted/30 transition-colors rounded-t-lg"
      @click="isCollapsed = !isCollapsed"
    >
      <div class="flex items-center gap-2">
        <span class="font-medium text-[15px] text-foreground/90">弹幕列表</span>
        <MoreVertical
          :size="16"
          class="text-muted-foreground hover:text-primary transition-colors"
          @click.stop
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ list.length }}条</span>
        <ChevronUp
          :size="18"
          class="text-muted-foreground transition-transform duration-300"
          :class="{ 'rotate-180': isCollapsed }"
        />
      </div>
    </div>

    <!-- Content -->
    <div v-show="!isCollapsed" class="flex-1 overflow-hidden flex flex-col">
      <!-- table header -->
      <div
        class="grid grid-cols-[50px_1fr_80px] gap-2 px-4 py-2 text-[13px] text-muted-foreground/70 bg-muted/5 border-b border-border/30"
      >
        <div>时间</div>
        <div>弹幕内容</div>
        <div class="text-right">发送时间</div>
      </div>

      <!-- list -->
      <div class="danmu-scroll flex-1 overflow-y-auto px-2 py-1">
        <div v-if="loading" class="flex items-center justify-center py-10">
          <div
            class="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          ></div>
        </div>
        <div v-else-if="list.length === 0" class="py-10 text-center text-xs text-muted-foreground">
          暂无弹幕
        </div>
        <template v-else>
          <div
            v-for="item in list"
            :key="item.id"
            class="grid grid-cols-[50px_1fr_80px] gap-2 px-2 py-1.5 text-[13px] hover:bg-muted/40 rounded transition-colors group items-center"
          >
            <div
              class="text-[#00a1d6] cursor-pointer hover:underline"
              @click="seekTo(item.timeOffset)"
            >
              {{ formatTime(item.timeOffset) }}
            </div>
            <div
              class="truncate font-medium drop-shadow-sm"
              :style="{
                color:
                  item.color && item.color.toUpperCase() !== '#FFFFFF' ? item.color : 'inherit',
              }"
              :title="item.content"
            >
              {{ item.content }}
            </div>
            <div class="text-right text-muted-foreground/60 text-xs">
              {{ formatDate(item.createdAt) }}
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div class="p-2 border-t border-border/50 bg-muted/5">
        <button
          class="w-full py-1.5 text-xs text-muted-foreground bg-muted/30 hover:bg-muted/50 hover:text-foreground rounded transition-colors"
        >
          查看历史弹幕
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.danmu-panel {
  height: 420px;
}

.danmu-panel.h-auto {
  height: auto;
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
</style>
