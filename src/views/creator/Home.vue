<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import type { ComposeOption, EChartsType } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import type { LineSeriesOption, BarSeriesOption } from 'echarts/charts'
import {
  GraphicComponent,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  LegendComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type ToolboxComponentOption,
  type LegendComponentOption,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { LucideIcon } from 'lucide-vue-next'
import {
  CircleDollarSign,
  MessageSquare,
  PlaySquare,
  RefreshCw,
  Star,
  Tv,
  Users,
} from 'lucide-vue-next'

import SkeletonGroup from '@/components/common/SkeletonGroup.vue'
import {
  getCreatorAnalytics,
  getCreatorOverview,
  type CreatorAnalyticsQueryParams,
  type CreatorAnalyticsRange,
  type CreatorAnalyticsType,
  type CreatorAnalyticsTrendResult,
  type CreatorOverview,
} from '@/api/user'

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  GraphicComponent,
  ToolboxComponent,
  LegendComponent,
  CanvasRenderer,
])

type ECOption = ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | ToolboxComponentOption
  | LegendComponentOption
>

interface MetricCard {
  key: CreatorAnalyticsType
  title: string
  icon: LucideIcon
  color: string
}

const rangeOptions: Array<{ value: CreatorAnalyticsRange; label: string }> = [
  { value: '7d', label: '近7天' },
  { value: '30d', label: '近30天' },
  { value: 'month', label: '本月' },
]

const metricCards: MetricCard[] = [
  {
    key: 'fans',
    title: '粉丝',
    icon: Users,
    color: 'var(--color-brand-pink)',
  },
  {
    key: 'views',
    title: '播放',
    icon: PlaySquare,
    color: 'var(--color-brand-blue)',
  },
  {
    key: 'comments',
    title: '评论',
    icon: MessageSquare,
    color: 'var(--color-brand-blue)',
  },
  {
    key: 'danmu',
    title: '弹幕',
    icon: Tv,
    color: 'var(--color-brand-blue)',
  },
  {
    key: 'favorites',
    title: '收藏',
    icon: Star,
    color: 'var(--color-brand-blue)',
  },
  {
    key: 'coins',
    title: '投币',
    icon: CircleDollarSign,
    color: 'var(--color-brand-blue)',
  },
]

const overview = ref<CreatorOverview | null>(null)
const trend = ref<CreatorAnalyticsTrendResult | null>(null)
const overviewLoading = ref(true)
const trendLoading = ref(true)
const overviewError = ref('')
const trendError = ref('')
const selectedRange = ref<CreatorAnalyticsRange>('7d')
const selectedMetric = ref<CreatorAnalyticsType>('fans')
const chartRef = ref<HTMLDivElement | null>(null)

let chart: EChartsType | null = null
let resizeObserver: ResizeObserver | null = null
let themeObserver: MutationObserver | null = null
let trendRequestId = 0

const selectedMetricCard = computed(
  () => metricCards.find((card) => card.key === selectedMetric.value) ?? metricCards[0]!
)

const selectedRangeLabel = computed(
  () => rangeOptions.find((option) => option.value === selectedRange.value)?.label ?? '近7天'
)

const overviewStats = computed(() =>
  metricCards.map((card) => ({
    ...card,
    total: overview.value?.[card.key] ?? 0,
  }))
)

const dailyGrowthDelta = computed(() => {
  if (!trend.value || trend.value.values.length < 2) return null
  const last = trend.value.values[trend.value.values.length - 1]
  const prev = trend.value.values[trend.value.values.length - 2]
  if (last === undefined || prev === undefined) return null
  return last - prev
})

const getGrowthDisplay = (key: CreatorAnalyticsType) => {
  // Only the active card knows its exact daily growth, otherwise we show '0' structurally
  if (selectedMetric.value === key && dailyGrowthDelta.value !== null) {
    return dailyGrowthDelta.value > 0 ? `+${dailyGrowthDelta.value}` : `${dailyGrowthDelta.value}`
  }
  return '0'
}

const formatNumber = (value: number | undefined) =>
  new Intl.NumberFormat('zh-CN').format(value ?? 0)

const readCssVariable = (token: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}

const ensureChart = () => {
  if (!chartRef.value) return null
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }
  return chart
}

const renderChart = () => {
  const instance = ensureChart()
  if (!instance) return

  const foreground = readCssVariable('--color-foreground', '#333333')
  const mutedFg = readCssVariable('--color-muted-foreground', '#9ca3af')
  const border = readCssVariable('--color-border', '#f1f2f3')
  const card = readCssVariable('--color-card', '#ffffff')
  const metric = selectedMetricCard.value
  const xAxisData = trend.value?.x ?? []
  const seriesData = trend.value?.values ?? []
  const hasData = seriesData.length > 0

  const option: ECOption = {
    animationDuration: 260,
    animationDurationUpdate: 220,
    animationEasing: 'cubicOut',
    backgroundColor: 'transparent',
    color: [metric.color],
    tooltip: {
      trigger: 'axis',
      backgroundColor: card,
      borderColor: border,
      borderWidth: 1,
      textStyle: {
        color: foreground,
      },
      formatter: (params) => {
        const point = Array.isArray(params) ? params[0] : params
        if (!point) return ''
        const val = point as { axisValue?: string; data?: number | string }
        return `${val.axisValue}<br/>${metric.title}：${formatNumber(Number(val.data))}`
      },
    },
    toolbox: {
      right: 20,
      top: 10,
      iconStyle: {
        borderColor: mutedFg,
      },
      feature: {
        dataView: { show: true, readOnly: true, title: '数据视图' },
        magicType: { show: true, type: ['line', 'bar'], title: { line: '折线图', bar: '柱状图' } },
        restore: { show: true, title: '还原' },
        saveAsImage: { show: true, title: '保存图片' },
      },
    },
    legend: {
      data: [metric.title],
      top: 12,
      icon: 'emptyCircle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: mutedFg, fontSize: 13 },
    },
    grid: {
      left: 10,
      right: 20,
      top: 60,
      bottom: 20,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xAxisData,
      axisLine: {
        lineStyle: {
          color: border,
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: mutedFg,
        margin: 12,
        formatter: (value: string) => value,
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: border,
          type: 'dashed',
        },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: mutedFg },
    },
    series: [
      {
        name: metric.title,
        type: 'line',
        symbol: 'emptyCircle',
        symbolSize: 6,
        lineStyle: {
          width: 2,
          color: metric.color,
        },
        itemStyle: {
          color: metric.color,
        },
        data: seriesData,
      },
    ],
    graphic: hasData
      ? []
      : [
          {
            type: 'text',
            left: 'center',
            top: 'middle',
            style: {
              text: '这段时间还没有数据',
              fill: mutedFg,
              font: '500 14px sans-serif',
            },
          },
        ],
  }

  instance.setOption(option, true)
  instance.resize()
}

const fetchOverview = async () => {
  overviewLoading.value = true
  overviewError.value = ''
  try {
    overview.value = await getCreatorOverview()
  } catch (error) {
    console.error('Failed to fetch creator overview:', error)
    overviewError.value = '总览数据加载失败'
  } finally {
    overviewLoading.value = false
  }
}

const fetchTrend = async () => {
  trendLoading.value = true
  trendError.value = ''
  const requestId = ++trendRequestId
  let shouldRender = false

  try {
    const params: CreatorAnalyticsQueryParams = {
      range: selectedRange.value,
      type: selectedMetric.value,
    }
    const nextTrend = await getCreatorAnalytics(params)
    if (requestId !== trendRequestId) return
    trend.value = nextTrend
  } catch (error) {
    if (requestId !== trendRequestId) return
    console.error('Failed to fetch trend:', error)
    trend.value = null
    trendError.value = '趋势加载失败'
  } finally {
    if (requestId === trendRequestId) {
      trendLoading.value = false
      shouldRender = true
    }
  }

  if (shouldRender) {
    void nextTick(renderChart)
  }
}

const selectMetric = (metric: CreatorAnalyticsType) => {
  if (selectedMetric.value === metric) return
  selectedMetric.value = metric
}

const selectRange = (range: CreatorAnalyticsRange) => {
  if (selectedRange.value === range) return
  selectedRange.value = range
}

watch([selectedMetric, selectedRange], () => {
  void fetchTrend()
})

onMounted(() => {
  void fetchOverview()
  void fetchTrend()

  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      chart?.resize()
    })
    resizeObserver.observe(chartRef.value)
  }

  themeObserver = new MutationObserver(() => {
    renderChart()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  themeObserver?.disconnect()
  if (chart) {
    chart.dispose()
    chart = null
  }
})
</script>

<template>
  <div class="flat-home">
    <!-- 视频数据 Panel -->
    <section class="flat-panel mb-4">
      <div class="flat-panel__header">
        <h3 class="flat-panel__title">视频数据</h3>
      </div>

      <SkeletonGroup v-if="overviewLoading" :count="6" class="flat-grid">
        <div class="flat-card ov-sk pointer-events-none">
          <div class="flat-card__top">
            <div class="skeleton-shimmer w-16 h-[18px] rounded"></div>
            <div class="ov-sk-b skeleton-shimmer w-6 h-[12px] rounded"></div>
          </div>
          <div class="flat-card__bottom mt-1">
            <div class="ov-sk-c skeleton-shimmer w-20 h-[24px] rounded"></div>
          </div>
        </div>
      </SkeletonGroup>

      <div v-else-if="overview" class="flat-grid">
        <button
          v-for="card in overviewStats"
          :key="card.key"
          type="button"
          class="flat-card"
          :class="{ 'is-active': selectedMetric === card.key }"
          @click="selectMetric(card.key)"
        >
          <div class="flat-card__top">
            <span class="flat-card__label">
              <component :is="card.icon" :size="14" class="flat-card__icon" />
              {{ card.title }}
            </span>
            <span
              class="flat-card__growth"
              :class="{ 'is-negative': getGrowthDisplay(card.key).startsWith('-') }"
            >
              {{ getGrowthDisplay(card.key) }}
            </span>
          </div>
          <div class="flat-card__bottom">
            <strong class="flat-card__value">{{ formatNumber(card.total) }}</strong>
          </div>
        </button>
      </div>

      <div v-else class="flat-error">
        <p>{{ overviewError }}</p>
        <button type="button" class="flat-action" @click="fetchOverview">
          <RefreshCw :size="14" /> 重试
        </button>
      </div>
    </section>

    <!-- 趋势 Panel -->
    <section class="flat-panel">
      <div class="flat-panel__header with-controls">
        <h3 class="flat-panel__title">{{ selectedRangeLabel }}{{ selectedMetricCard.title }}量</h3>
        <div class="flat-range-picker">
          <button
            v-for="option in rangeOptions"
            :key="option.value"
            type="button"
            class="flat-range-btn"
            :class="{ 'is-active': selectedRange === option.value }"
            @click="selectRange(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div class="flat-chart-shell">
        <div v-show="!trendLoading" ref="chartRef" class="flat-chart-canvas"></div>

        <div v-if="trendLoading" class="chart-skeleton">
          <!-- Legend row -->
          <div class="chart-skeleton__legend">
            <div class="skeleton-shimmer chart-skeleton__dot"></div>
            <div class="skeleton-shimmer chart-skeleton__label"></div>
            <div class="chart-skeleton__toolbox">
              <div v-for="t in 4" :key="t" class="skeleton-shimmer chart-skeleton__tool"></div>
            </div>
          </div>
          <!-- Grid area -->
          <div class="chart-skeleton__grid">
            <div class="chart-skeleton__hlines">
              <div v-for="l in 5" :key="l" class="chart-skeleton__hline"></div>
            </div>
            <!-- Animated Premium Fluid Chart Skeleton -->
            <svg class="chart-skeleton__wave" viewBox="0 0 1000 300" preserveAspectRatio="none">
              <path
                d="M0,250 C200,200 300,50 500,120 C700,190 800,80 1000,150 L1000,300 L0,300 Z"
                class="chart-skeleton__area"
              />
              <path
                d="M0,250 C200,200 300,50 500,120 C700,190 800,80 1000,150"
                class="chart-skeleton__line-base"
              />
              <path
                d="M0,250 C200,200 300,50 500,120 C700,190 800,80 1000,150"
                class="chart-skeleton__line-anim"
              />
            </svg>
          </div>
          <!-- X-axis labels -->
          <div class="chart-skeleton__xaxis">
            <div v-for="x in 7" :key="x" class="skeleton-shimmer chart-skeleton__xlabel"></div>
          </div>
        </div>

        <div v-else-if="trendError" class="flat-chart-overlay">
          <p class="mb-2 text-destructive">{{ trendError }}</p>
          <button type="button" class="flat-action" @click="fetchTrend">重试</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.flat-home {
  display: block;
}

.flat-panel {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;

  &__header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--color-border);

    &.with-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-foreground);
  }
}

.flat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  padding: 20px;
}

.flat-card {
  display: flex;
  flex-direction: column;
  padding: 14px 20px 20px;
  background-color: var(--color-secondary);
  border-radius: 4px;
  border: 0;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgb(0, 0, 0, 0.05);
  }

  &.is-active {
    background-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px color-mix(in oklch, var(--color-primary) 25%, transparent);

    .flat-card__label {
      color: color-mix(in oklch, var(--color-primary-foreground) 80%, transparent);
    }

    .flat-card__growth {
      color: color-mix(in oklch, var(--color-primary-foreground) 90%, transparent);
    }

    .flat-card__value {
      color: var(--color-primary-foreground);
    }
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--color-muted-foreground);
  }

  &__growth {
    font-size: 12px;
    color: var(--color-brand-pink);

    &.is-negative {
      color: var(--color-status-success);
    }
  }

  &__bottom {
    display: block;
  }

  &__value {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-foreground);
    line-height: 1;
  }
}

.flat-range-picker {
  display: inline-flex;
  gap: 4px;
  background-color: var(--color-secondary);
  padding: 3px;
  border-radius: 4px;
}

.flat-range-btn {
  padding: 4px 12px;
  font-size: 13px;
  color: var(--color-muted-foreground);
  border-radius: 2px;
  border: 0;
  background: transparent;
  cursor: pointer;

  &.is-active {
    background-color: var(--color-card);
    color: var(--color-foreground);
    box-shadow: 0 1px 2px rgb(0, 0, 0, 0.05);
    font-weight: 500;
  }
}

.flat-chart-shell {
  position: relative;
  width: 100%;
  padding: 10px 0;
}

.flat-chart-canvas {
  width: 100%;
  height: 380px;
}

.flat-chart-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in oklch, var(--color-card) 88%, transparent);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-muted-foreground);
}

.flat-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  border: 0;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

/* 概览卡骨架错峰：--skeleton-phase 落在卡片上，卡内两块基于它偏移
   （同一元素既读又写 --skeleton-index 会构成 CSS 循环）。 */
.ov-sk {
  --skeleton-phase: var(--skeleton-index, 0);
}

.ov-sk-b {
  --skeleton-index: calc(var(--skeleton-phase) + 0.25);
}

.ov-sk-c {
  --skeleton-index: calc(var(--skeleton-phase) + 0.45);
}

.chart-skeleton {
  display: flex;
  flex-direction: column;
  height: 380px;
  padding: 12px 20px 16px;
  gap: 8px;

  &__legend {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
  }

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &__label {
    width: 40px;
    height: 12px;
    border-radius: 2px;
  }

  &__toolbox {
    margin-left: auto;
    display: flex;
    gap: 10px;
  }

  &__tool {
    width: 16px;
    height: 16px;
    border-radius: 2px;
  }

  &__grid {
    flex: 1;
    position: relative;
  }

  &__hlines {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    z-index: 0;
  }

  &__hline {
    height: 1px;
    background: var(--color-border);
    opacity: 0.3;
  }

  &__wave {
    position: absolute;
    inset: 10% 0 20%;
    width: 100%;
    height: 60%;
    z-index: 1;
  }

  &__area {
    fill: var(--color-muted);
    opacity: 0.2;
  }

  &__line-base {
    fill: none;
    stroke: var(--color-muted);
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.5;
  }

  &__line-anim {
    fill: none;
    stroke: var(--color-primary);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 400 1500;
    stroke-dashoffset: 1900;
    animation: skel-line-flow 2.4s linear infinite;
    opacity: 0.7;
  }

  &__xaxis {
    display: flex;
    justify-content: space-between;
    padding-top: 4px;
  }

  &__xlabel {
    width: 40px;
    height: 10px;
    border-radius: 2px;
  }
}

:global(.dark) .flat-panel {
  background: var(--color-card);
  border-color: var(--color-border);
}

:global(.dark) .flat-card {
  background: color-mix(in srgb, var(--color-muted) 30%, transparent);

  &.is-active {
    background-color: var(--color-accent);
  }

  &__label {
    color: var(--color-muted-foreground);
  }
}

:global(.dark) .flat-range-picker {
  background: var(--color-muted);
}

:global(.dark) .flat-range-btn.is-active {
  background: var(--color-border);
  color: var(--color-foreground);
}

:global(.dark) .flat-chart-overlay {
  background: color-mix(in oklch, var(--color-card) 88%, transparent);
  color: var(--color-muted-foreground);
}

/* Range Picker */

/* Chart */

/* Chart Skeleton */
@keyframes skel-line-flow {
  0% {
    stroke-dashoffset: 1900;
    opacity: 0;
  }

  10% {
    opacity: 0.8;
  }

  90% {
    opacity: 0.8;
  }

  100% {
    stroke-dashoffset: -100;
    opacity: 0;
  }
}

/* Dark mode adjustments (subtle) */

/* Responsive constraints */
@media (width <= 1024px) {
  .flat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (width <= 768px) {
  .flat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .flat-chart-canvas {
    height: 320px;
  }
}

@media (width <= 480px) {
  .flat-grid {
    grid-template-columns: 1fr;
  }
}
</style>
