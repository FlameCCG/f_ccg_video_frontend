<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getCreatorAnalytics, type CreatorAnalyticsResult } from '@/api/user'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, PlaySquare, MessageSquare, CircleDollarSign, Tv, Star } from 'lucide-vue-next'

const analytics = ref<CreatorAnalyticsResult | null>(null)
const loading = ref(true)

const fetchAnalytics = async () => {
  try {
    loading.value = true
    analytics.value = await getCreatorAnalytics('7d')
  } catch (error) {
    console.error('Failed to fetch creator analytics:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchAnalytics()
})

const statCards = [
  { key: 'views', title: '播放量', icon: PlaySquare, color: 'text-blue-500', bg: 'bg-blue-50' },
  { key: 'fans', title: '粉丝数', icon: Users, color: 'text-pink-500', bg: 'bg-pink-50' },
  {
    key: 'comments',
    title: '评论数',
    icon: MessageSquare,
    color: 'text-green-500',
    bg: 'bg-green-50',
  },
  {
    key: 'coins',
    title: '硬币数',
    icon: CircleDollarSign,
    color: 'text-yellow-500',
    bg: 'bg-yellow-50',
  },
  { key: 'danmu', title: '弹幕数', icon: Tv, color: 'text-purple-500', bg: 'bg-purple-50' },
  { key: 'favorites', title: '收藏数', icon: Star, color: 'text-orange-500', bg: 'bg-orange-50' },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight">数据概览</h1>
      <div class="text-sm text-muted-foreground">近 7 天数据</div>
    </div>

    <div v-if="loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="i in 6" :key="i" class="animate-pulse">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <div class="h-4 w-16 bg-muted rounded"></div>
          <div class="h-8 w-8 bg-muted rounded-full"></div>
        </CardHeader>
        <CardContent>
          <div class="h-8 w-24 bg-muted rounded mt-2"></div>
        </CardContent>
      </Card>
    </div>

    <div v-else-if="analytics" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card v-for="card in statCards" :key="card.key" class="hover:shadow-md transition-shadow">
        <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle class="text-sm font-medium text-muted-foreground">
            {{ card.title }}
          </CardTitle>
          <div :class="['p-2 rounded-full', card.bg]">
            <component :is="card.icon" :class="['h-4 w-4', card.color]" />
          </div>
        </CardHeader>
        <CardContent>
          <div class="text-2xl font-bold">
            {{ analytics.total[card.key as keyof typeof analytics.total].toLocaleString() }}
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Placeholder for charts -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle>趋势图表</CardTitle>
      </CardHeader>
      <CardContent
        class="h-[300px] flex items-center justify-center text-muted-foreground bg-muted/20 rounded-lg border border-dashed m-6 mt-0"
      >
        图表区域 (可接入 ECharts)
      </CardContent>
    </Card>
  </div>
</template>
