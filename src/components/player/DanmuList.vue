<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue'
import { getDanmuList, type DanmuItem } from '@/api/danmu'
import { MoreVertical, ChevronUp, ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-vue-next'

const props = defineProps<{
  videoId: number
  partId?: number
}>()

const emit = defineEmits<{
  seek: [time: number]
}>()

const list = ref<DanmuItem[]>([])
const totalCount = ref(0)
const loading = ref(false)
const isCollapsed = ref(false)

const viewMode = ref<'current' | 'history'>('current')
const selectedDate = ref('')
const showCalendar = ref(false)
const availableDates = ref<Set<string>>(new Set())
const loadingDates = ref(false)

const today = new Date()
const calendarYear = ref(today.getFullYear())
const calendarMonth = ref(today.getMonth())

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

const calendarTitle = computed(() => `${calendarYear.value}年 ${MONTH_NAMES[calendarMonth.value]}`)

interface CalendarDay {
  day: number
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasData: boolean
}

const calendarDays = computed((): CalendarDay[] => {
  const y = calendarYear.value
  const m = calendarMonth.value
  const firstDay = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysInPrevMonth = new Date(y, m, 0).getDate()

  const days: CalendarDay[] = []
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i
    const pm = m === 0 ? 12 : m
    const py = m === 0 ? y - 1 : y
    const dateStr = `${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      dateStr,
      isCurrentMonth: false,
      isToday: false,
      isSelected: false,
      hasData: false,
    })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      isSelected: selectedDate.value === dateStr,
      hasData: availableDates.value.has(dateStr),
    })
  }

  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const nm = m + 2 > 12 ? 1 : m + 2
    const ny = m + 2 > 12 ? y + 1 : y
    const dateStr = `${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      dateStr,
      isCurrentMonth: false,
      isToday: false,
      isSelected: false,
      hasData: false,
    })
  }

  return days
})

const prevMonth = () => {
  if (calendarMonth.value === 0) {
    calendarMonth.value = 11
    calendarYear.value--
  } else {
    calendarMonth.value--
  }
  void probeMonthDates()
}

const nextMonth = () => {
  if (calendarMonth.value === 11) {
    calendarMonth.value = 0
    calendarYear.value++
  } else {
    calendarMonth.value++
  }
  void probeMonthDates()
}

const probeMonthDates = async () => {
  if (!props.videoId) return
  loadingDates.value = true
  const y = calendarYear.value
  const m = calendarMonth.value
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const newDates = new Set<string>()

  const probes: Promise<void>[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const futureDate = new Date(y, m, d)
    if (futureDate > today) continue

    probes.push(
      getDanmuList({
        videoId: props.videoId,
        partId: props.partId,
        date: dateStr,
        pageSize: 1,
      })
        .then((res) => {
          if ((res.list?.length ?? 0) > 0 || (res.total ?? 0) > 0) {
            newDates.add(dateStr)
          }
        })
        .catch(() => {})
    )
  }

  await Promise.all(probes)
  availableDates.value = newDates
  loadingDates.value = false
}

const selectDate = (day: CalendarDay) => {
  if (!day.isCurrentMonth || !day.hasData) return
  selectedDate.value = day.dateStr
  showCalendar.value = false
  void fetchList(day.dateStr)
}

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

const headerTitle = computed(() => {
  if (viewMode.value === 'history') {
    return '历史弹幕'
  }
  return '弹幕列表'
})

const fetchList = async (date?: string) => {
  if (!props.videoId) return
  loading.value = true
  try {
    const params: {
      videoId: number
      partId?: number
      pageSize?: number
      date?: string
    } = {
      videoId: props.videoId,
      pageSize: 200,
    }
    if (props.partId) params.partId = props.partId
    if (date) params.date = date
    const result = await getDanmuList(params)
    list.value = result.list ?? []
    totalCount.value = result.total ?? list.value.length
  } catch {
    list.value = []
    totalCount.value = 0
  } finally {
    loading.value = false
  }
}

const seekTo = (timeOffset: number) => {
  emit('seek', getRealTime(timeOffset))
}

const enterHistoryMode = () => {
  viewMode.value = 'history'
  showCalendar.value = true
  void probeMonthDates()
}

const exitHistoryMode = () => {
  viewMode.value = 'current'
  selectedDate.value = ''
  showCalendar.value = false
  void fetchList()
}

const toggleCalendar = () => {
  showCalendar.value = !showCalendar.value
  if (showCalendar.value) {
    void probeMonthDates()
  }
}

const displayCount = computed(() => {
  return totalCount.value || list.value.length
})

const scrollRef = ref<HTMLElement | null>(null)

const addDanmu = (danmu: {
  id?: number
  text: string
  time: number
  color: string
  mode: 0 | 1 | 2
  createdAt?: string
}) => {
  if (viewMode.value !== 'current') return
  const item: DanmuItem = {
    id: danmu.id ?? Date.now(),
    videoId: props.videoId,
    videoPartId: props.partId ?? 0,
    userId: 0,
    content: danmu.text,
    timeOffset: Math.round(danmu.time * 1000),
    color: danmu.color,
    fontSize: 25,
    position: danmu.mode,
    likeCount: 0,
    isLiked: false,
    createdAt: danmu.createdAt ?? new Date().toISOString(),
  }
  list.value.push(item)
  totalCount.value++
  void nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}

defineExpose({ addDanmu })

onMounted(() => void fetchList())
watch(
  () => [props.videoId, props.partId],
  () => {
    viewMode.value = 'current'
    selectedDate.value = ''
    showCalendar.value = false
    void fetchList()
  }
)
</script>

<template>
  <div
    class="danmu-panel flex flex-col rounded-lg border border-border"
    :class="{ 'is-collapsed': isCollapsed }"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none border-b border-border hover:bg-secondary transition-colors rounded-t-lg"
      style="background-color: var(--color-card)"
      @click="isCollapsed = !isCollapsed"
    >
      <div class="flex items-center gap-2">
        <button
          v-if="viewMode === 'history'"
          class="flex items-center justify-center w-5 h-5 rounded hover:bg-accent transition-colors"
          title="返回"
          @click.stop="exitHistoryMode"
        >
          <ArrowLeft :size="14" style="color: var(--color-muted-foreground)" />
        </button>
        <span class="font-medium text-[14px]" style="color: var(--color-foreground)">{{
          headerTitle
        }}</span>
        <MoreVertical
          :size="16"
          style="color: var(--color-muted-foreground)"
          class="hover:text-primary transition-colors"
          @click.stop
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs" style="color: var(--color-muted-foreground)"
          >{{ displayCount }}条</span
        >
        <ChevronUp
          :size="18"
          style="color: var(--color-muted-foreground)"
          class="transition-transform duration-300"
          :class="{ 'rotate-180': isCollapsed }"
        />
      </div>
    </div>

    <!-- Content -->
    <div
      v-show="!isCollapsed"
      class="flex-1 overflow-hidden flex flex-col rounded-b-lg"
      style="background-color: var(--color-card)"
    >
      <!-- History mode: date display + calendar toggle -->
      <div
        v-if="viewMode === 'history'"
        class="flex items-center justify-between px-4 py-2 border-b border-border"
        style="background-color: var(--color-secondary)"
      >
        <span class="text-xs" style="color: var(--color-muted-foreground)">
          {{ selectedDate || '请选择日期' }}
        </span>
        <button
          class="text-xs px-2 py-1 rounded transition-colors"
          style="color: var(--color-primary)"
          @click="toggleCalendar"
        >
          {{ showCalendar ? '收起' : '选择日期' }}
        </button>
      </div>

      <!-- Calendar popup (inline, compact) -->
      <div
        v-if="viewMode === 'history' && showCalendar"
        class="border-b border-border px-3 py-2"
        style="background-color: var(--color-card)"
      >
        <div class="flex items-center justify-between mb-1">
          <button
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-secondary transition-colors"
            @click="prevMonth"
          >
            <ChevronLeft :size="14" style="color: var(--color-muted-foreground)" />
          </button>
          <span class="text-[12px] font-medium" style="color: var(--color-foreground)">{{
            calendarTitle
          }}</span>
          <button
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-secondary transition-colors"
            @click="nextMonth"
          >
            <ChevronRight :size="14" style="color: var(--color-muted-foreground)" />
          </button>
        </div>

        <div class="grid grid-cols-7 gap-0">
          <div
            v-for="label in WEEKDAY_LABELS"
            :key="label"
            class="text-center text-[10px] py-0.5"
            style="color: var(--color-muted-foreground)"
          >
            {{ label }}
          </div>
        </div>

        <div class="grid grid-cols-7 gap-0">
          <button
            v-for="(day, idx) in calendarDays"
            :key="idx"
            class="calendar-day"
            :class="{
              'is-other': !day.isCurrentMonth,
              'is-today': day.isToday && !day.isSelected,
              'is-selected': day.isSelected,
              'is-disabled': day.isCurrentMonth && !day.hasData,
              'is-active': day.isCurrentMonth && day.hasData && !day.isSelected,
            }"
            :disabled="!day.isCurrentMonth || !day.hasData"
            @click="selectDate(day)"
          >
            {{ day.day }}
          </button>
        </div>

        <div v-if="loadingDates" class="text-center py-1">
          <span class="text-[10px]" style="color: var(--color-muted-foreground)">加载中...</span>
        </div>
      </div>

      <!-- Table header -->
      <div
        class="grid grid-cols-[50px_1fr_80px] gap-2 px-4 py-2 text-[12px] border-b"
        style="color: var(--color-muted-foreground); border-color: var(--color-border)"
      >
        <div>时间</div>
        <div>弹幕内容</div>
        <div class="text-right">发送时间</div>
      </div>

      <!-- List -->
      <div ref="scrollRef" class="danmu-scroll flex-1 overflow-y-auto px-2 py-1">
        <div v-if="loading" class="flex items-center justify-center py-10">
          <div
            class="h-5 w-5 animate-spin rounded-full border-2 border-[#00a1d6]/30 border-t-[#00a1d6]"
          ></div>
        </div>
        <div
          v-else-if="list.length === 0"
          class="py-10 text-center text-xs"
          style="color: var(--color-muted-foreground)"
        >
          {{
            viewMode === 'history' && selectedDate
              ? '该日期无弹幕'
              : viewMode === 'history'
                ? '请选择日期查看弹幕'
                : '暂无弹幕'
          }}
        </div>
        <template v-else>
          <div
            v-for="item in list"
            :key="item.id"
            class="grid grid-cols-[50px_1fr_80px] gap-2 px-2 py-1.5 text-[13px] hover:bg-secondary rounded transition-colors group items-center"
          >
            <div
              class="cursor-pointer hover:underline tabular-nums"
              style="color: var(--color-primary)"
              @click="seekTo(item.timeOffset)"
            >
              {{ formatTime(item.timeOffset) }}
            </div>
            <div class="truncate" style="color: var(--color-foreground)" :title="item.content">
              {{ item.content }}
            </div>
            <div
              class="text-right text-xs tabular-nums"
              style="color: var(--color-muted-foreground)"
            >
              {{ formatDate(item.createdAt) }}
            </div>
          </div>
        </template>
      </div>

      <!-- Footer -->
      <div
        v-if="viewMode === 'current'"
        class="p-2 border-t"
        style="border-color: var(--color-border)"
      >
        <button
          class="w-full py-1.5 text-xs font-medium rounded transition-colors"
          style="color: var(--color-primary); background-color: var(--color-secondary)"
          @click="enterHistoryMode"
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
  background-color: var(--color-card);
}

.danmu-panel.is-collapsed {
  height: auto;
}

.danmu-scroll {
  scrollbar-width: thin;
  scrollbar-color: #e3e5e7 transparent;
}

.danmu-scroll::-webkit-scrollbar {
  width: 4px;
}

.danmu-scroll::-webkit-scrollbar-thumb {
  background-color: var(--color-secondary);
  border-radius: 2px;
}

.danmu-scroll::-webkit-scrollbar-thumb:hover {
  background: #c9ccd0;
}

/* Calendar day cells */
.calendar-day {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  font-size: 11px;
  color: var(--color-foreground);
  border-radius: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: all 0.12s ease;
}

.calendar-day:hover:not(:disabled) {
  background-color: var(--color-secondary);
}

.calendar-day.is-other {
  color: #e3e5e7;
  pointer-events: none;
}

.calendar-day.is-disabled {
  color: #c9ccd0;
  cursor: default;
}

.calendar-day.is-active {
  color: var(--color-foreground);
  font-weight: 500;
}

.calendar-day.is-today {
  color: var(--color-primary);
  font-weight: 600;
  outline: 1px solid #00a1d6;
  outline-offset: -1px;
}

.calendar-day.is-selected {
  color: #fff;
  background-color: var(--color-primary);
  font-weight: 500;
}

.calendar-day.is-selected:hover {
  background: #0091c2;
}
</style>
