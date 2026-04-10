<script setup lang="ts">
import { TrendingUp } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { useHotSearch } from '@/composables/useHotSearch'
import { useSearchHistory } from '@/composables/useSearchHistory'
import HotSearchList from './HotSearchList.vue'
import SearchPlaceholder from './SearchPlaceholder.vue'

const router = useRouter()
const { hot, loading, failed, refresh } = useHotSearch()
const { addHistory } = useSearchHistory()
const search = (keyword: string) => {
  addHistory(keyword)
  void router.push({ name: 'search', query: { keyword } })
}
</script>

<template>
  <section class="hot-search-card" aria-label="CCG 热搜">
    <header class="hot-search-card__header">
      <div>
        <span class="hot-search-card__eyebrow">发现热门</span>
        <h2>CCG 热搜<TrendingUp :size="18" aria-hidden="true" /></h2>
      </div>
      <span class="hot-search-card__mark" aria-hidden="true">TOP<br />10</span>
    </header>
    <SearchPlaceholder v-if="loading" loading title="正在发现热门内容" />
    <SearchPlaceholder v-else-if="failed" title="热搜暂时未能加载" />
    <HotSearchList v-else-if="hot.length" :items="hot" @select="search" />
    <SearchPlaceholder v-else title="热搜榜暂时留白" description="精彩值得被发现" />
    <footer class="hot-search-card__footer">
      <button v-if="failed" type="button" @click="refresh">重新加载</button
      ><span v-else>从热爱出发，发现更多精彩</span>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.hot-search-card {
  padding: 20px 16px 0;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 16px;
}
.hot-search-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 16px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--color-border);
}
.hot-search-card__eyebrow {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--color-muted-foreground);
}
.hot-search-card__header h2 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 5px 0 0;
  font-size: 17px;
  font-weight: 650;
}
.hot-search-card__header svg {
  color: var(--color-primary);
}
.hot-search-card__mark {
  font-size: 11px;
  font-weight: 650;
  line-height: 1.3;
  text-align: right;
  letter-spacing: 0.06em;
  color: var(--color-muted-foreground);
}
.hot-search-card__footer {
  padding: 13px 4px;
  margin-top: 10px;
  font-size: 10px;
  color: var(--color-muted-foreground);
  border-top: 1px solid var(--color-border);
}
.hot-search-card__footer button {
  min-height: 32px;
  color: var(--color-primary);
}
</style>
