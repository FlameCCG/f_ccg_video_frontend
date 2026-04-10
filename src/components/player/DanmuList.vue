<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick, useId } from 'vue'
import {
  danmuMillisecondsToSeconds,
  danmuSecondsToMilliseconds,
  getDanmuList,
  type DanmuItem,
} from '@/api/danmu'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import EmptyState from '@/components/common/EmptyState.vue'
import { formatClock } from '@/utils/format'
import { getDanmuMonthDates } from '@/utils/danmuDates'

const props = defineProps<{
  videoId: number
  partId?: number
}>()

const emit = defineEmits<{
  seek: [time: number]
}>()

const panelId = useId()
const list = ref<DanmuItem[]>([])
const totalCount = ref(0)
const loading = ref(false)
const listError = ref('')
const isCollapsed = ref(false)
const selectedDate = ref('')
const showCalendar = ref(false)
const availableDates = ref<Set<string>>(new Set())
const loadingDates = ref(false)
const datesReady = ref(false)
const datesError = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const dateTriggerRef = ref<HTMLButtonElement | null>(null)
const calendarRef = ref<HTMLElement | null>(null)
let calendarRequest = 0
let listRequest = 0

const today = ref(new Date())
const calendarYear = ref(today.value.getFullYear())
const calendarMonth = ref(today.value.getMonth())
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

const dateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const todayKey = computed(() => dateKey(today.value))
const isHistory = computed(() => Boolean(selectedDate.value))
const calendarTitle = computed(() => `${calendarYear.value}年 ${calendarMonth.value + 1}月`)
const isCurrentMonth = computed(
  () =>
    calendarYear.value === today.value.getFullYear() &&
    calendarMonth.value === today.value.getMonth()
)
const canGoNextMonth = computed(
  () =>
    calendarYear.value * 12 + calendarMonth.value <
    today.value.getFullYear() * 12 + today.value.getMonth()
)
const selectedDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  const [year, month, day] = selectedDate.value.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
})
const displayCount = computed(() => totalCount.value.toLocaleString('zh-CN'))
const calendarHint = computed(() => {
  if (loadingDates.value) return '正在查找有弹幕的日期…'
  if (datesError.value) return '日期标记未加载，仍可直接选日期'
  if (availableDates.value.size === 0) return '本月没有弹幕'
  return '选择高亮日期，查看当天及更早的弹幕'
})

interface CalendarDay {
  day: number
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  hasDanmu: boolean
  isEmpty: boolean
  disabled: boolean
}

const calendarDays = computed((): CalendarDay[] => {
  const year = calendarYear.value
  const month = calendarMonth.value
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: CalendarDay[] = []

  for (let index = 0; index < firstWeekday; index++) {
    cells.push({
      day: 0,
      dateStr: `pad-${year}-${month}-${index}`,
      isCurrentMonth: false,
      isToday: false,
      isSelected: false,
      hasDanmu: false,
      isEmpty: false,
      disabled: true,
    })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day)
    const dateStr = dateKey(date)
    const future = dateStr > todayKey.value
    const hasDanmu = !future && availableDates.value.has(dateStr)
    const isEmpty = datesReady.value && !future && !hasDanmu
    const isToday = dateStr === todayKey.value
    cells.push({
      day,
      dateStr,
      isCurrentMonth: true,
      isToday,
      isSelected:
        dateStr === selectedDate.value ||
        (!selectedDate.value && isToday && (!datesReady.value || hasDanmu)),
      hasDanmu,
      isEmpty,
      // 没弹幕的日期变灰后不能点；未来日期同样不可点。
      disabled: future || isEmpty,
    })
  }

  return cells
})

const probeMonthDates = async () => {
  const request = ++calendarRequest
  loadingDates.value = false
  datesError.value = false
  datesReady.value = false
  availableDates.value = new Set()
  if (!props.videoId) return
  const year = calendarYear.value
  const month = calendarMonth.value
  loadingDates.value = true
  try {
    const dates = await getDanmuMonthDates(props.videoId, props.partId, year, month)
    if (request !== calendarRequest) return
    availableDates.value = dates
    datesReady.value = true
  } catch {
    if (request !== calendarRequest) return
    datesError.value = true
  } finally {
    if (request === calendarRequest) loadingDates.value = false
  }
}

const changeMonth = (offset: number) => {
  if (offset > 0 && !canGoNextMonth.value) return
  const date = new Date(calendarYear.value, calendarMonth.value + offset, 1)
  calendarYear.value = date.getFullYear()
  calendarMonth.value = date.getMonth()
  void probeMonthDates()
}

const goToCurrentMonth = () => {
  today.value = new Date()
  calendarYear.value = today.value.getFullYear()
  calendarMonth.value = today.value.getMonth()
  void probeMonthDates()
}

const focusCalendarDate = () => {
  if (!showCalendar.value || isCollapsed.value) return
  const target =
    calendarRef.value?.querySelector<HTMLButtonElement>(
      '.calendar-day.is-selected:not(:disabled)'
    ) ?? calendarRef.value?.querySelector<HTMLButtonElement>('.calendar-day:not(:disabled)')
  target?.focus({ preventScroll: true })
}

const openCalendar = () => {
  today.value = new Date()
  const date = selectedDate.value ? new Date(selectedDate.value + 'T00:00:00') : today.value
  calendarYear.value = date.getFullYear()
  calendarMonth.value = date.getMonth()
  showCalendar.value = true
  void probeMonthDates()
}

const closeCalendar = () => {
  showCalendar.value = false
  dateTriggerRef.value?.focus({ preventScroll: true })
}

const toggleCalendar = () => {
  if (showCalendar.value) closeCalendar()
  else openCalendar()
}

const formatTime = (ms: number): string => formatClock(Math.floor(danmuMillisecondsToSeconds(ms)))

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const fetchList = async () => {
  const request = ++listRequest
  listError.value = ''
  loading.value = false
  list.value = []
  totalCount.value = 0
  if (!props.videoId) return
  loading.value = true
  try {
    const result = await getDanmuList({
      videoId: props.videoId,
      partId: props.partId,
      date: selectedDate.value || undefined,
    })
    if (request !== listRequest) return
    list.value = result.list ?? []
    totalCount.value = result.total ?? list.value.length
    void nextTick(() => {
      if (request === listRequest && scrollRef.value) scrollRef.value.scrollTop = 0
    })
  } catch (error) {
    if (request !== listRequest) return
    listError.value = error instanceof Error ? error.message : '请稍后重试'
  } finally {
    if (request === listRequest) loading.value = false
  }
}

const returnToLatest = () => {
  const needsReload = isHistory.value || Boolean(listError.value)
  selectedDate.value = ''
  closeCalendar()
  if (needsReload) void fetchList()
}

const selectDate = (day: CalendarDay) => {
  if (day.disabled) return
  if (day.isToday) {
    returnToLatest()
    return
  }
  const needsReload = selectedDate.value !== day.dateStr || Boolean(listError.value)
  selectedDate.value = day.dateStr
  closeCalendar()
  if (needsReload) void fetchList()
}

const seekTo = (timeOffset: number) => {
  emit('seek', danmuMillisecondsToSeconds(timeOffset))
}

const addDanmu = (danmu: {
  id?: number
  text: string
  time: number
  color: string
  mode: 0 | 1 | 2
  createdAt?: string
}) => {
  if (isHistory.value || (danmu.id && list.value.some((item) => item.id === danmu.id))) return
  const item: DanmuItem = {
    id: danmu.id ?? Date.now(),
    videoId: props.videoId,
    videoPartId: props.partId ?? 0,
    userId: 0,
    content: danmu.text,
    timeOffset: danmuSecondsToMilliseconds(danmu.time),
    color: danmu.color,
    fontSize: 25,
    position: danmu.mode,
    likeCount: 0,
    isLiked: false,
    createdAt: danmu.createdAt ?? new Date().toISOString(),
  }
  // 接口按发送时间倒序返回；插入新弹幕时保留正在回看的阅读位置。
  const scrollTop = scrollRef.value?.scrollTop ?? 0
  const rowHeight = scrollRef.value?.firstElementChild?.getBoundingClientRect().height ?? 36
  list.value.unshift(item)
  if (list.value.length > 500) list.value.pop()
  totalCount.value++
  void nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollTop > 32 ? scrollTop + rowHeight : 0
  })
}

defineExpose({ addDanmu })

onMounted(() => void fetchList())
watch(
  () => [props.videoId, props.partId],
  () => {
    selectedDate.value = ''
    showCalendar.value = false
    today.value = new Date()
    calendarYear.value = today.value.getFullYear()
    calendarMonth.value = today.value.getMonth()
    availableDates.value = new Set()
    datesReady.value = false
    datesError.value = false
    calendarRequest++
    loadingDates.value = false
    void fetchList()
  }
)
onBeforeUnmount(() => {
  calendarRequest++
  listRequest++
})
</script>

<template>
  <section class="danmu-panel" :class="{ 'is-collapsed': isCollapsed }" aria-label="弹幕列表">
    <button
      type="button"
      class="danmu-header"
      :aria-expanded="!isCollapsed"
      :aria-controls="panelId + '-content'"
      @click="isCollapsed = !isCollapsed"
    >
      <span class="danmu-heading">
        <History v-if="isHistory" :size="16" aria-hidden="true" />
        <span>{{ isHistory ? '历史弹幕' : '弹幕列表' }}</span>
      </span>
      <span class="danmu-header-meta">
        <span class="danmu-count">{{
          loading ? '加载中' : listError ? '未加载' : displayCount + ' 条'
        }}</span>
        <ChevronDown
          :size="16"
          class="panel-chevron"
          :class="{ 'is-open': !isCollapsed }"
          aria-hidden="true"
        />
      </span>
    </button>

    <Transition name="panel-body">
      <div v-show="!isCollapsed" :id="panelId + '-content'" class="danmu-body">
        <div class="danmu-toolbar" @keydown.esc.prevent="closeCalendar">
          <button
            ref="dateTriggerRef"
            type="button"
            class="date-trigger"
            :class="{ 'is-active': showCalendar || isHistory }"
            :aria-expanded="showCalendar"
            :aria-controls="panelId + '-calendar'"
            @click="toggleCalendar"
          >
            <CalendarDays :size="15" aria-hidden="true" />
            <span>{{ isHistory ? '截至 ' + selectedDateLabel : '按日期回看' }}</span>
            <ChevronDown
              :size="13"
              class="date-chevron"
              :class="{ 'is-open': showCalendar }"
              aria-hidden="true"
            />
          </button>
          <button v-if="isHistory" type="button" class="latest-button" @click="returnToLatest">
            <RotateCcw :size="12" aria-hidden="true" />最新
          </button>
          <button
            v-else-if="showCalendar"
            type="button"
            class="quiet-button"
            @click="closeCalendar"
          >
            取消
          </button>
        </div>

        <div class="danmu-content">
          <Transition name="panel-switch" mode="out-in" @after-enter="focusCalendarDate">
            <div
              v-if="showCalendar"
              :id="panelId + '-calendar'"
              key="calendar"
              ref="calendarRef"
              class="danmu-calendar"
              role="group"
              aria-label="选择截止日期，查看当天及更早的弹幕"
              @keydown.esc.stop.prevent="closeCalendar"
            >
              <div class="calendar-navigation">
                <button
                  type="button"
                  class="month-button"
                  aria-label="上个月"
                  @click="changeMonth(-1)"
                >
                  <ChevronLeft :size="16" aria-hidden="true" />
                </button>
                <div class="calendar-month">
                  <span aria-live="polite">{{ calendarTitle }}</span>
                  <button
                    v-if="!isCurrentMonth"
                    type="button"
                    class="month-today"
                    @click="goToCurrentMonth"
                  >
                    本月
                  </button>
                </div>
                <button
                  type="button"
                  class="month-button"
                  :disabled="!canGoNextMonth"
                  aria-label="下个月"
                  @click="changeMonth(1)"
                >
                  <ChevronRight :size="16" aria-hidden="true" />
                </button>
              </div>

              <div class="calendar-weekdays" aria-hidden="true">
                <span v-for="label in WEEKDAY_LABELS" :key="label">{{ label }}</span>
              </div>
              <div class="calendar-grid">
                <template v-for="day in calendarDays" :key="day.dateStr">
                  <span
                    v-if="!day.isCurrentMonth"
                    class="calendar-day is-placeholder"
                    aria-hidden="true"
                  />
                  <button
                    v-else
                    type="button"
                    class="calendar-day"
                    :class="{
                      'is-today': day.isToday,
                      'is-selected': day.isSelected,
                      'has-danmu': day.hasDanmu,
                      'is-empty': day.isEmpty,
                    }"
                    :disabled="day.disabled"
                    :aria-pressed="day.isSelected"
                    :aria-current="day.isToday ? 'date' : undefined"
                    :aria-label="
                      day.dateStr +
                      (day.isToday ? '，今天，查看最新弹幕' : '，查看当天及更早的弹幕') +
                      (day.hasDanmu ? '，当天有弹幕' : day.isEmpty ? '，当天没有弹幕' : '')
                    "
                    @click="selectDate(day)"
                  >
                    {{ day.day }}
                  </button>
                </template>
              </div>

              <div class="calendar-hint" role="status">
                <span>{{ calendarHint }}</span>
                <button
                  v-if="datesError"
                  type="button"
                  class="quiet-button"
                  @click="probeMonthDates"
                >
                  重试
                </button>
              </div>
            </div>

            <div v-else key="results" class="danmu-results" :aria-busy="loading">
              <div
                v-if="loading || (!listError && list.length)"
                class="danmu-columns danmu-table-header"
                aria-hidden="true"
              >
                <span>时间</span>
                <span>弹幕内容</span>
                <span class="text-right">发送时间</span>
              </div>

              <div v-if="loading" class="danmu-skeleton" role="status">
                <span class="sr-only">正在加载弹幕</span>
                <div
                  v-for="row in 6"
                  :key="row"
                  class="danmu-columns skeleton-row"
                  aria-hidden="true"
                >
                  <Skeleton class="h-3 w-8" :index="row" />
                  <Skeleton class="h-3" :class="row % 2 ? 'w-4/5' : 'w-3/5'" :index="row + 0.3" />
                  <Skeleton class="h-3 w-16 justify-self-end" :index="row + 0.6" />
                </div>
              </div>

              <EmptyState
                v-else-if="listError"
                class="danmu-empty"
                size="sm"
                icon="offline"
                title="弹幕暂时没能加载"
                :description="listError"
                announce
              >
                <Button variant="outline" size="sm" @click="fetchList">
                  <RotateCcw :size="13" aria-hidden="true" />重新加载
                </Button>
              </EmptyState>

              <EmptyState
                v-else-if="list.length === 0"
                class="danmu-empty"
                size="sm"
                :icon="isHistory ? 'history' : 'chat'"
                :title="isHistory ? '这个时间点，还没有弹幕' : '还没有弹幕，等你开场'"
                :description="
                  isHistory
                    ? '截至' + selectedDateLabel + '没有弹幕，试试更晚的日期。'
                    : '在喜欢的瞬间，留下第一条弹幕吧。'
                "
                announce
              >
                <template v-if="isHistory" #default>
                  <Button variant="outline" size="sm" @click="openCalendar">
                    <CalendarDays :size="13" aria-hidden="true" />换个日期
                  </Button>
                </template>
              </EmptyState>

              <template v-else>
                <div
                  ref="scrollRef"
                  class="danmu-scroll"
                  role="list"
                  aria-label="按发送时间从新到旧排列的弹幕"
                >
                  <div
                    v-for="item in list"
                    :key="item.id"
                    class="danmu-columns danmu-row"
                    role="listitem"
                  >
                    <button
                      type="button"
                      class="danmu-time"
                      :aria-label="'跳转到 ' + formatTime(item.timeOffset)"
                      @click="seekTo(item.timeOffset)"
                    >
                      {{ formatTime(item.timeOffset) }}
                    </button>
                    <span class="danmu-text" :title="item.content">{{ item.content }}</span>
                    <time
                      class="danmu-sent-at"
                      :datetime="item.createdAt"
                      :title="new Date(item.createdAt).toLocaleString('zh-CN')"
                      >{{ formatDate(item.createdAt) }}</time
                    >
                  </div>
                </div>
                <p class="danmu-list-note">
                  <span>由新到旧</span>
                  <span>{{
                    totalCount > list.length
                      ? '展示最近 ' + list.length + ' 条'
                      : '点击时间，跳转到精彩瞬间'
                  }}</span>
                </p>
              </template>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped lang="scss">
.danmu-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 420px;
  overflow: hidden;
  color: var(--color-foreground);
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);

  &.is-collapsed {
    height: auto;
  }

  button {
    transition:
      transform var(--duration-fast) var(--ease-out-quart),
      opacity var(--duration-fast) linear;
    &:disabled {
      cursor: default;
    }
  }
}

.danmu-header,
.danmu-heading,
.danmu-header-meta,
.danmu-toolbar,
.date-trigger,
.latest-button,
.calendar-navigation,
.calendar-month,
.calendar-hint,
.danmu-list-note {
  display: flex;
  align-items: center;
}

.danmu-header {
  flex: none;
  justify-content: space-between;
  width: 100%;
  min-height: 48px;
  padding: 0 16px;
  text-align: left;
  background: transparent;
  &:hover {
    background: var(--color-accent);
  }
  &:focus-visible {
    outline-offset: -3px;
  }
}
.danmu-heading {
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  svg {
    color: var(--color-primary);
  }
}
.danmu-header-meta {
  gap: 12px;
  color: var(--color-muted-foreground);
}
.danmu-count {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.panel-chevron,
.date-chevron {
  flex-shrink: 0;
  transition: transform var(--duration-normal) var(--ease-out-quart);
  &.is-open {
    transform: rotate(180deg);
  }
}
.danmu-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border-top: 1px solid var(--color-border);
}
.danmu-toolbar {
  flex: none;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--color-border);
}
.date-trigger {
  gap: 8px;
  min-width: 0;
  min-height: 32px;
  padding: 0 8px;
  color: var(--color-muted-foreground);
  font-size: 12px;
  background: transparent;
  border-radius: var(--radius-sm);
  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  > svg:first-child {
    flex-shrink: 0;
  }
  &:hover,
  &.is-active {
    color: var(--color-primary);
    background: color-mix(in oklch, var(--color-primary) 8%, transparent);
  }
}
.latest-button,
.quiet-button {
  flex-shrink: 0;
  min-height: 30px;
  padding: 0 6px;
  color: var(--color-muted-foreground);
  font-size: 11px;
  background: transparent;
  border-radius: var(--radius-sm);
  &:hover {
    color: var(--color-primary);
    background: var(--color-accent);
  }
}
.latest-button {
  gap: 4px;
}
.danmu-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.danmu-calendar,
.danmu-results {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.danmu-calendar {
  padding: 10px 16px 12px;
  overflow-y: auto;
}
.calendar-navigation {
  flex-shrink: 0;
  justify-content: space-between;
  margin-bottom: 6px;
}
.calendar-month {
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.month-today {
  padding: 3px 6px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 500;
  background: var(--color-secondary);
  border-radius: var(--radius-sm);
}
.month-button {
  display: grid;
  width: 30px;
  height: 30px;
  color: var(--color-muted-foreground);
  background: transparent;
  border-radius: var(--radius-sm);
  place-items: center;
  &:hover:not(:disabled) {
    color: var(--color-foreground);
    background: var(--color-secondary);
  }
  &:disabled {
    opacity: 0.28;
  }
}
.calendar-weekdays,
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 3px;
  text-align: center;
}
.calendar-weekdays {
  flex-shrink: 0;
  padding: 3px 0 7px;
  color: var(--color-muted-foreground);
  font-size: 10px;
}
.calendar-grid {
  flex-shrink: 0;
}
.calendar-day {
  position: relative;
  display: grid;
  height: 30px;
  padding: 0;
  color: var(--color-foreground);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  place-items: center;
  &:hover:not(:disabled) {
    background: var(--color-secondary);
    transform: translateY(-1px);
  }
  &:active:not(:disabled) {
    transform: scale(0.94);
  }
  &:disabled {
    color: var(--color-muted-foreground);
    opacity: 0.35;
  }
  &.is-placeholder {
    visibility: hidden;
    pointer-events: none;
  }
  &.is-today:not(:disabled) {
    border-color: color-mix(in oklch, var(--color-primary) 40%, transparent);
  }
  &.has-danmu:not(.is-selected) {
    color: var(--color-primary);
    font-weight: 600;
    opacity: 1;
  }
  &.is-selected {
    color: var(--color-primary-foreground);
    font-weight: 600;
    background: var(--color-primary);
    border-color: transparent;
    opacity: 1;
    &:hover {
      background: var(--color-primary);
    }
  }
}
.calendar-hint {
  flex-shrink: 0;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  margin-top: auto;
  padding-top: 8px;
  color: var(--color-muted-foreground);
  font-size: 10px;
  line-height: 1.6;
  .quiet-button {
    min-height: 20px;
    padding: 0 3px;
    color: var(--color-primary);
    font-size: inherit;
  }
}
.danmu-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 82px;
  gap: 10px;
  align-items: center;
}
.danmu-table-header {
  flex-shrink: 0;
  min-height: 35px;
  padding: 0 16px;
  color: var(--color-muted-foreground);
  font-size: 11px;
  border-bottom: 1px solid color-mix(in oklch, var(--color-border) 65%, transparent);
}
.danmu-scroll {
  flex: 1;
  min-height: 0;
  padding: 5px 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
.danmu-row {
  min-height: 36px;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: var(--radius-sm);
  &:hover,
  &:focus-within {
    background: var(--color-accent);
  }
}
.danmu-time {
  min-height: 30px;
  padding: 0;
  color: var(--color-primary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  background: transparent;
  border-radius: 3px;
  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}
.danmu-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.danmu-sent-at {
  color: var(--color-muted-foreground);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.danmu-list-note {
  flex-shrink: 0;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
  color: var(--color-muted-foreground);
  font-size: 10px;
  border-top: 1px solid var(--color-border);
}
.danmu-skeleton {
  padding: 5px 16px;
}
.skeleton-row {
  min-height: 36px;
}
.danmu-empty {
  flex: 1;
  min-height: 0;
  padding: 20px 18px;
  overflow-y: auto;
  :deep(.empty-state__art) {
    width: 114px;
    margin-bottom: 10px;
  }
  :deep(.empty-state__art),
  :deep(.empty-state__copy),
  :deep(.empty-state__actions) {
    animation-duration: var(--duration-normal);
    animation-delay: 0ms;
  }
  :deep(.empty-state__title) {
    font-size: 14px;
    letter-spacing: 0;
  }
  :deep(.empty-state__description) {
    max-width: 28ch;
    margin-top: 6px;
    overflow-wrap: anywhere;
  }
}
.panel-body-enter-active,
.panel-switch-enter-active {
  transition:
    opacity var(--duration-normal) ease,
    transform var(--duration-normal) var(--ease-out-quart);
}
.panel-body-leave-active,
.panel-switch-leave-active {
  transition: opacity var(--duration-fast) ease;
}
.panel-body-enter-from,
.panel-switch-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.panel-body-leave-to,
.panel-switch-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .danmu-panel button,
  .panel-chevron,
  .date-chevron,
  .panel-body-enter-active,
  .panel-body-leave-active,
  .panel-switch-enter-active,
  .panel-switch-leave-active {
    transition: none;
  }

  .calendar-day:hover:not(:disabled),
  .calendar-day:active:not(:disabled) {
    transform: none;
  }
}
</style>
