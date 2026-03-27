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
    color: '#fb7299', // pink
  },
  {
    key: 'views',
    title: '播放',
    icon: PlaySquare,
    color: '#00aeec', // blue
  },
  {
    key: 'comments',
    title: '评论',
    icon: MessageSquare,
    color: '#00aeec', // blue
  },
  {
    key: 'danmu',
    title: '弹幕',
    icon: Tv,
    color: '#00aeec',
  },
  {
    key: 'favorites',
    title: '收藏',
    icon: Star,
    color: '#00aeec',
  },
  {
    key: 'coins',
    title: '投币',
    icon: CircleDollarSign,
    color: '#00aeec',
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
        borderColor: '#9ca3af',
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
      textStyle: { color: '#666', fontSize: 13 },
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
          color: '#e5e7eb',
        },
      },
      axisTick: {
        show: false,
      },
      axisLabel: {
        color: '#9ca3af',
        margin: 12,
        formatter: (value: string) => value,
      },
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          color: '#f3f4f6',
          type: 'solid',
        },
      },
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9ca3af' },
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
              text: '暂无趋势数据',
              fill: '#9ca3af',
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

      <div v-if="overviewLoading" class="flat-grid">
        <div v-for="i in 6" :key="i" class="flat-card is-skeleton">
          <!-- loading block -->
          <div class="skeleton-shimmer h-[70px] rounded"></div>
        </div>
      </div>

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
        <div ref="chartRef" class="flat-chart-canvas"></div>

        <div v-if="trendLoading" class="flat-chart-overlay">
          <span>正在加载趋势...</span>
        </div>
        <div v-else-if="trendError" class="flat-chart-overlay">
          <p class="text-red-500 mb-2">{{ trendError }}</p>
          <button type="button" class="flat-action" @click="fetchTrend">重试</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.flat-home {
  display: block;
}

.flat-panel {
  background: var(--color-card, #ffffff);
  border: 1px solid var(--color-border, #f1f2f3);
  border-radius: 4px;
  overflow: hidden;
}

.flat-panel__header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #f1f2f3);
}

.flat-panel__header.with-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flat-panel__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-foreground, #333333);
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
}

.flat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0, 0, 0, 0.05);
}

.flat-card.is-active {
  background-color: var(--color-accent);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px oklch(var(--accent) / 0.25);
}

.flat-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.flat-card__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--color-muted-foreground);
}

.flat-card.is-active .flat-card__label {
  color: #ffffff;
}

.flat-card__growth {
  font-size: 12px;
  color: var(--color-accent);
}

.flat-card__growth.is-negative {
  color: #16a34a;
}

.flat-card.is-active .flat-card__growth {
  color: #ffffff;
}

.flat-card__bottom {
  display: block;
}

.flat-card__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-primary); /* Default blue for values */
  line-height: 1;
}

/* Hardcode specific colors for inactive to match bilibili logic if we want, but flat blue is standard */
.flat-card.is-active .flat-card__value {
  color: #ffffff;
}

/* Range Picker */
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
}

.flat-range-btn.is-active {
  background-color: var(--color-card);
  color: var(--color-foreground);
  box-shadow: 0 1px 2px rgb(0, 0, 0, 0.05);
  font-weight: 500;
}

/* Chart */
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
  background: rgb(255, 255, 255, 0.8);
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
  color: #fff;
  border: 0;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

/* Skeleton */
.skeleton-shimmer {
  background: linear-gradient(90deg, #f1f2f3 25%, #e3e5e7 50%, #f1f2f3 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}

/* Dark mode adjustments (subtle) */
:global(.dark) .flat-panel {
  background: var(--color-card);
  border-color: var(--color-border);
}

:global(.dark) .flat-card {
  background: color-mix(in srgb, var(--color-muted) 30%, transparent);
}

:global(.dark) .flat-card.is-active {
  background-color: var(--color-accent);
}

:global(.dark) .flat-card__label {
  color: var(--color-muted-foreground);
}

:global(.dark) .flat-range-picker {
  background: var(--color-muted);
}

:global(.dark) .flat-range-btn.is-active {
  background: var(--color-border);
  color: var(--color-foreground);
}

:global(.dark) .flat-chart-overlay {
  background: rgb(0, 0, 0, 0.6);
  color: #e5e7eb;
}

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
