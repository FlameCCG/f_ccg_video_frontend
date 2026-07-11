<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Globe,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverContent,
  PopoverPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日']

const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: '(UTC-10:00) 夏威夷' },
  { value: 'America/Anchorage', label: '(UTC-09:00) 阿拉斯加' },
  { value: 'America/Los_Angeles', label: '(UTC-08:00) 太平洋时间(美加)' },
  { value: 'America/Denver', label: '(UTC-07:00) 山地时间(美加)' },
  { value: 'America/Chicago', label: '(UTC-06:00) 中部时间(美加)' },
  { value: 'America/New_York', label: '(UTC-05:00) 东部时间(美加)' },
  { value: 'America/Caracas', label: '(UTC-04:00) 加拉加斯' },
  { value: 'America/St_Johns', label: '(UTC-03:30) 纽芬兰' },
  { value: 'America/Argentina/Buenos_Aires', label: '(UTC-03:00) 布宜诺斯艾利斯' },
  { value: 'Europe/London', label: '(UTC+00:00) 伦敦, 都柏林' },
  { value: 'Europe/Berlin', label: '(UTC+01:00) 柏林, 巴黎' },
  { value: 'Europe/Athens', label: '(UTC+02:00) 雅典, 耶路撒冷' },
  { value: 'Europe/Moscow', label: '(UTC+03:00) 莫斯科, 科威特' },
  { value: 'Asia/Dubai', label: '(UTC+04:00) 迪拜, 阿布扎比' },
  { value: 'Asia/Karachi', label: '(UTC+05:00) 伊斯兰堡, 卡拉奇' },
  { value: 'Asia/Kolkata', label: '(UTC+05:30) 孟买, 加尔各答' },
  { value: 'Asia/Dhaka', label: '(UTC+06:00) 达卡, 阿斯塔纳' },
  { value: 'Asia/Bangkok', label: '(UTC+07:00) 曼谷, 河内, 雅加达' },
  { value: 'Asia/Shanghai', label: '(UTC+08:00) 北京, 重庆, 乌鲁木齐' },
  { value: 'Asia/Tokyo', label: '(UTC+09:00) 大阪, 东京, 札幌' },
  { value: 'Australia/Adelaide', label: '(UTC+09:30) 阿德莱德' },
  { value: 'Australia/Sydney', label: '(UTC+10:00) 墨尔本, 悉尼' },
  { value: 'Asia/Magadan', label: '(UTC+11:00) 马加丹, 索罗门群岛' },
  { value: 'Pacific/Auckland', label: '(UTC+12:00) 奥克兰, 惠灵顿' },
]

// Determine initial timezone (fallback to Asia/Shanghai)
const initTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const tzMatch = TIMEZONES.find((t) => t.value === initTz)
const selectedTimezone = ref(tzMatch ? tzMatch.value : 'Asia/Shanghai')
const selectedTimezoneLabel = computed(
  () => TIMEZONES.find((t) => t.value === selectedTimezone.value)?.label || ''
)

// --- Time Utilities relative to chosen Timezone ---
const getTzNowStr = (tz: string) => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()) // MM/DD/YYYY, HH:mm:ss
}

const parseTzDate = (tzStr: string) => {
  const [datePart, timePart] = tzStr.split(', ')
  if (!datePart || !timePart) return new Date()
  const [mm, dd, yyyy] = datePart.split('/')
  const [hh, min, ss] = timePart.split(':')
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss))
}

const getBrowserDateFromTz = (tzDate: Date, tz: string) => {
  // Rough conversion back to absolute timestamp
  // We want to find an epoch time T such that formatting T in `tz` yields `tzDate` (ignoring seconds)
  // Newton's method or just approximate offset
  // Actually, calculating epoch is easy:
  // We format local epoch and subtract difference
  let epoch = tzDate.getTime()
  // Try 5 times to converge on exact epoch (handles DST transitions mostly)
  for (let i = 0; i < 5; i++) {
    const guessFormat = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(epoch))
    const guessParsed = parseTzDate(guessFormat)
    const err = guessParsed.getTime() - tzDate.getTime()
    if (err === 0) break
    epoch -= err
  }
  return new Date(epoch)
}

const getLimitsInTz = (tz: string) => {
  const nowAbsolute = Date.now()
  const minAbsolute = nowAbsolute + 5 * 60 * 1000 // +5 mins
  const maxAbsolute = nowAbsolute + 15 * 24 * 60 * 60 * 1000 // +15 days

  const formatOpts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
  const minTz = parseTzDate(
    new Intl.DateTimeFormat('en-US', formatOpts).format(new Date(minAbsolute))
  )
  const maxTz = parseTzDate(
    new Intl.DateTimeFormat('en-US', formatOpts).format(new Date(maxAbsolute))
  )
  return { minTz, maxTz }
}

const limits = computed(() => getLimitsInTz(selectedTimezone.value))

// --- Parsing component's initial value (local browser time string "YYYY-MM-DDTHH:mm") ---
const parseLocalDateTime = (value: string) => {
  if (!value) return null
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, y, m, d, h, min] = match
  return new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min))
}

const formatLocalDateTime = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

// Convert absolute browser date to selected timezone date
const browserToTzDate = (browserAbsolute: Date, tz: string) => {
  const formatOpts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }
  return parseTzDate(new Intl.DateTimeFormat('en-US', formatOpts).format(browserAbsolute))
}

// Internal effective value in the SELECTED TIMEZONE!
const effectiveTzValue = computed(() => {
  const absoluteBrowser = parseLocalDateTime(props.modelValue)
  const { minTz, maxTz } = limits.value
  if (!absoluteBrowser) return minTz

  let targetTz = browserToTzDate(absoluteBrowser, selectedTimezone.value)
  if (targetTz.getTime() < minTz.getTime()) return minTz
  if (targetTz.getTime() > maxTz.getTime()) return maxTz
  return targetTz
})

// Update emitted value
const commitTzValue = (tzDate: Date) => {
  let { minTz, maxTz } = limits.value
  let d = tzDate
  if (d.getTime() < minTz.getTime()) d = minTz
  if (d.getTime() > maxTz.getTime()) d = maxTz

  const absoluteBrowser = getBrowserDateFromTz(d, selectedTimezone.value)
  emit('update:modelValue', formatLocalDateTime(absoluteBrowser))
}

// === Date Selector (Calendar Popover) ===
const datePanelOpen = ref(false)
const viewMonth = ref(
  new Date(effectiveTzValue.value.getFullYear(), effectiveTzValue.value.getMonth(), 1)
)

watch(
  () => [props.modelValue, selectedTimezone.value],
  () => {
    viewMonth.value = new Date(
      effectiveTzValue.value.getFullYear(),
      effectiveTzValue.value.getMonth(),
      1
    )
  }
)

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const calendarCells = computed(() => {
  const monthStart = startOfMonth(viewMonth.value)
  const gridStart = new Date(monthStart)
  const weekdayOffset = (monthStart.getDay() + 6) % 7
  gridStart.setDate(monthStart.getDate() - weekdayOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    const currentDay = startOfDay(date)

    const minDay = startOfDay(limits.value.minTz)
    const maxDay = startOfDay(limits.value.maxTz)

    const disabled =
      currentDay.getTime() < minDay.getTime() || currentDay.getTime() > maxDay.getTime()
    const selected = currentDay.getTime() === startOfDay(effectiveTzValue.value).getTime()

    // For "today", we look at Now in selected timezone
    const tzNow = parseTzDate(getTzNowStr(selectedTimezone.value))
    const today = currentDay.getTime() === startOfDay(tzNow).getTime()

    return {
      date,
      label: date.getDate(),
      inCurrentMonth: date.getMonth() === viewMonth.value.getMonth(),
      disabled,
      selected,
      today,
    }
  })
})

const goPrevMonth = () => {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() - 1, 1)
}
const goNextMonth = () => {
  viewMonth.value = new Date(viewMonth.value.getFullYear(), viewMonth.value.getMonth() + 1, 1)
}

const selectDate = (date: Date) => {
  const next = new Date(date)
  next.setHours(effectiveTzValue.value.getHours(), effectiveTzValue.value.getMinutes())
  commitTzValue(next)
  datePanelOpen.value = false
}

// === Time Selector (Popover) ===
const timePanelOpen = ref(false)
const hourListRef = ref<HTMLElement | null>(null)
const minuteListRef = ref<HTMLElement | null>(null)

const hourOptions = computed(() =>
  Array.from({ length: 24 }, (_, hour) => {
    const d = new Date(effectiveTzValue.value)
    d.setHours(hour)
    const disabled =
      d.getTime() < limits.value.minTz.getTime() || d.getTime() > limits.value.maxTz.getTime()

    return {
      value: String(hour).padStart(2, '0'),
      label: `${String(hour).padStart(2, '0')} 时`,
      disabled,
    }
  })
)

const minuteOptions = computed(() =>
  Array.from({ length: 60 }, (_, minute) => {
    const d = new Date(effectiveTzValue.value)
    d.setMinutes(minute)
    const disabled =
      d.getTime() < limits.value.minTz.getTime() || d.getTime() > limits.value.maxTz.getTime()

    return {
      value: String(minute).padStart(2, '0'),
      label: `${String(minute).padStart(2, '0')} 分`,
      disabled,
    }
  })
)

const selectHour = (hour: string) => {
  const d = new Date(effectiveTzValue.value)
  d.setHours(Number(hour))

  // Snap minute to valid if disabled
  if (d.getTime() < limits.value.minTz.getTime()) {
    d.setMinutes(limits.value.minTz.getMinutes())
  } else if (d.getTime() > limits.value.maxTz.getTime()) {
    d.setMinutes(limits.value.maxTz.getMinutes())
  }

  commitTzValue(d)
}

const selectMinute = (minute: string) => {
  const d = new Date(effectiveTzValue.value)
  d.setMinutes(Number(minute))
  commitTzValue(d)
}

const scrollActiveTimeIntoView = () => {
  hourListRef.value
    ?.querySelector<HTMLElement>('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest' })
  minuteListRef.value
    ?.querySelector<HTMLElement>('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest' })
}

watch(timePanelOpen, (open) => {
  if (open) void nextTick(scrollActiveTimeIntoView)
})

const displayDateStr = computed(() => {
  if (!props.modelValue) return '选择日期'
  const y = effectiveTzValue.value.getFullYear()
  const m = String(effectiveTzValue.value.getMonth() + 1).padStart(2, '0')
  const d = String(effectiveTzValue.value.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
})

const displayTimeStr = computed(() => {
  if (!props.modelValue) return '请选择时间'
  const h = String(effectiveTzValue.value.getHours()).padStart(2, '0')
  const m = String(effectiveTzValue.value.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
})
</script>

<template>
  <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
    <!-- Timezone Selector：非 modal，避免打开时锁定 body 滚动条导致页面横向抖动 -->
    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger as-child>
        <button
          class="flex h-11 items-center justify-between gap-3 min-w-[200px] rounded-[14px] border border-border/70 bg-background/60 px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="disabled"
        >
          <div class="flex items-center gap-2 truncate text-foreground">
            <Globe class="h-4 w-4 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ selectedTimezoneLabel }}</span>
          </div>
          <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="start"
          class="z-50 max-h-[300px] min-w-[240px] overflow-y-auto rounded-xl border border-border/60 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl mac-scrollbar"
        >
          <DropdownMenuItem
            v-for="tz in TIMEZONES"
            :key="tz.value"
            class="flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/80 focus:bg-muted/80 focus:outline-none"
            :class="
              selectedTimezone === tz.value ? 'bg-primary/10 text-primary' : 'text-foreground/90'
            "
            @select="
              () => {
                selectedTimezone = tz.value
                if (props.modelValue) commitTzValue(effectiveTzValue)
              }
            "
          >
            {{ tz.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <!-- Date Selector -->
    <PopoverRoot v-model:open="datePanelOpen">
      <PopoverTrigger as-child>
        <button
          class="flex h-11 items-center justify-between gap-3 min-w-[140px] rounded-[14px] border border-border/70 bg-background/60 px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="disabled"
        >
          <div class="flex items-center gap-2 text-foreground">
            <CalendarDays class="h-4 w-4 text-muted-foreground" />
            <span>{{ displayDateStr }}</span>
          </div>
          <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          side="bottom"
          :side-offset="8"
          class="z-50 w-auto rounded-[20px] border border-border/70 bg-background/95 p-4 shadow-xl backdrop-blur-xl"
        >
          <div class="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-full hover:bg-muted/60"
              @click="goPrevMonth"
            >
              <ChevronLeft class="h-4 w-4" />
            </Button>
            <div class="text-sm font-semibold text-foreground">
              {{ viewMonth.getFullYear() }}年{{ viewMonth.getMonth() + 1 }}月
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 rounded-full hover:bg-muted/60"
              @click="goNextMonth"
            >
              <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          <div
            class="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground"
          >
            <div v-for="day in WEEK_DAYS" :key="day" class="py-1">{{ day }}</div>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1">
            <button
              v-for="cell in calendarCells"
              :key="cell.date.toISOString()"
              type="button"
              class="flex h-8 w-8 mx-auto items-center justify-center rounded-lg text-sm transition-all focus:outline-none"
              :class="[
                cell.selected
                  ? 'bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/30'
                  : cell.disabled
                    ? 'cursor-not-allowed text-muted-foreground/30 opacity-60'
                    : cell.inCurrentMonth
                      ? 'text-foreground hover:bg-muted focus:bg-muted'
                      : 'text-muted-foreground/50 hover:bg-muted/50 text-[13px]',
                cell.today && !cell.selected ? 'ring-1 ring-primary/40 font-semibold' : '',
              ]"
              :disabled="cell.disabled"
              @click="selectDate(cell.date)"
            >
              {{ cell.label }}
            </button>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>

    <!-- Time Selector -->
    <PopoverRoot v-model:open="timePanelOpen">
      <PopoverTrigger as-child>
        <button
          class="flex h-11 items-center justify-between gap-3 min-w-[120px] rounded-[14px] border border-border/70 bg-background/60 px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent data-[state=open]:border-primary/50 data-[state=open]:ring-2 data-[state=open]:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="disabled || !props.modelValue"
        >
          <div class="flex items-center gap-2 text-foreground">
            <Clock3 class="h-4 w-4 text-muted-foreground" />
            <span>{{ displayTimeStr }}</span>
          </div>
          <ChevronDown class="h-4 w-4 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align="start"
          side="bottom"
          :side-offset="8"
          class="z-50 w-[240px] rounded-[20px] border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur-xl"
        >
          <div class="grid grid-cols-2 gap-3 h-[240px]">
            <div class="flex flex-col min-h-0 h-full">
              <span class="mb-2 text-center text-xs font-medium text-muted-foreground px-1"
                >小时</span
              >
              <div
                ref="hourListRef"
                class="mac-scrollbar flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-1"
              >
                <button
                  v-for="option in hourOptions"
                  :key="option.value"
                  type="button"
                  class="flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm transition-all focus:outline-none"
                  :class="
                    option.disabled
                      ? 'cursor-not-allowed text-muted-foreground/30 opacity-60'
                      : option.value === String(effectiveTzValue.getHours()).padStart(2, '0')
                        ? 'bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/20'
                        : 'text-foreground/90 hover:bg-muted/80 focus:bg-muted/80 hover:text-foreground'
                  "
                  :aria-selected="
                    option.value === String(effectiveTzValue.getHours()).padStart(2, '0')
                      ? 'true'
                      : undefined
                  "
                  :disabled="option.disabled"
                  @click="selectHour(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
            <div class="flex flex-col min-h-0 h-full">
              <span class="mb-2 text-center text-xs font-medium text-muted-foreground px-1"
                >分钟</span
              >
              <div
                ref="minuteListRef"
                class="mac-scrollbar flex-1 min-h-0 overflow-y-auto rounded-xl border border-border/50 bg-muted/20 p-1"
              >
                <button
                  v-for="option in minuteOptions"
                  :key="option.value"
                  type="button"
                  class="flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm transition-all focus:outline-none"
                  :class="
                    option.disabled
                      ? 'cursor-not-allowed text-muted-foreground/30 opacity-60'
                      : option.value === String(effectiveTzValue.getMinutes()).padStart(2, '0')
                        ? 'bg-primary text-primary-foreground font-medium shadow-sm shadow-primary/20'
                        : 'text-foreground/90 hover:bg-muted/80 focus:bg-muted/80 hover:text-foreground'
                  "
                  :aria-selected="
                    option.value === String(effectiveTzValue.getMinutes()).padStart(2, '0')
                      ? 'true'
                      : undefined
                  "
                  :disabled="option.disabled"
                  @click="selectMinute(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>
  </div>
</template>

<style>
.mac-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: oklch(var(--foreground) / 0.15) transparent;
}

.mac-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.mac-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.mac-scrollbar::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: oklch(var(--foreground) / 0.15);
  background-clip: padding-box;
}

.mac-scrollbar::-webkit-scrollbar-thumb:hover {
  background: oklch(var(--foreground) / 0.25);
}
</style>
