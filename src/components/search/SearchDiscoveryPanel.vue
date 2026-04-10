<script setup lang="ts">
import {
  ArrowUpRight,
  CornerDownLeft,
  History,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import type { HotKeywordItem, SearchSuggestItem } from '@/api/video'
import HotSearchList from './HotSearchList.vue'
import SearchPlaceholder from './SearchPlaceholder.vue'

defineProps<{
  id: string
  query: string
  history: string[]
  hot: HotKeywordItem[]
  suggestions: SearchSuggestItem[]
  active: number
  hotLoading: boolean
  hotFailed: boolean
  suggestLoading: boolean
  suggestFailed: boolean
}>()
defineEmits<{
  select: [keyword: string]
  remove: [keyword: string]
  clear: []
  retry: []
}>()
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, { ALLOWED_TAGS: ['em'], ALLOWED_ATTR: [] })
</script>

<template>
  <div class="discovery-panel">
    <div v-if="!query.trim()" class="discovery-panel__heading">
      <h3 :id="`${id}-history-heading`"><History :size="15" aria-hidden="true" />搜索历史</h3>
      <button
        v-if="history.length"
        type="button"
        class="discovery-panel__clear"
        @mousedown.prevent
        @click="$emit('clear')"
      >
        <Trash2 :size="13" aria-hidden="true" />清空
      </button>
      <span v-else class="discovery-panel__meta">从一次好奇开始</span>
    </div>
    <div v-else class="discovery-panel__heading">
      <h3><Search :size="15" aria-hidden="true" />搜索建议</h3>
      <span class="discovery-panel__meta">发现你感兴趣的内容</span>
    </div>

    <div :id="`${id}-list`" role="listbox" aria-label="搜索建议" class="discovery-panel__content">
      <template v-if="!query.trim()">
        <div role="group" :aria-labelledby="`${id}-history-heading`">
          <Transition name="discovery-state" mode="out-in">
            <TransitionGroup
              v-if="history.length"
              key="history"
              name="history-chip"
              tag="div"
              class="discovery-panel__history"
            >
              <div
                v-for="(keyword, index) in history"
                :key="keyword"
                class="discovery-panel__chip"
                :class="{ 'is-active': active === index }"
              >
                <button
                  :id="`${id}-option-${index}`"
                  type="button"
                  role="option"
                  :aria-selected="active === index"
                  class="discovery-panel__history-label"
                  :title="keyword"
                  @mousedown.prevent
                  @click="$emit('select', keyword)"
                >
                  {{ keyword }}
                </button>
                <button
                  type="button"
                  class="discovery-panel__remove"
                  :aria-label="`删除搜索历史：${keyword}`"
                  @mousedown.prevent
                  @click="$emit('remove', keyword)"
                >
                  <X :size="12" aria-hidden="true" />
                </button>
              </div>
            </TransitionGroup>
            <SearchPlaceholder
              v-else
              key="empty-history"
              kind="history"
              title="还没有搜索足迹"
              description="搜过的精彩，会在这里为你留存"
            />
          </Transition>
        </div>
        <div class="discovery-panel__hot" role="group" :aria-labelledby="`${id}-hot-heading`">
          <div class="discovery-panel__heading">
            <h3 :id="`${id}-hot-heading`"><TrendingUp :size="16" aria-hidden="true" />CCG 热搜</h3>
            <span class="discovery-panel__meta">大家都在搜</span>
          </div>
          <Transition name="discovery-state" mode="out-in">
            <SearchPlaceholder
              v-if="hotLoading"
              key="loading"
              loading
              title="正在发现热门内容"
              description="精彩即将出现"
            />
            <SearchPlaceholder
              v-else-if="hotFailed"
              key="failed"
              title="热搜暂时未能加载"
              description="你仍然可以直接输入关键词搜索"
            />
            <HotSearchList
              v-else-if="hot.length"
              key="hot"
              compact
              :items="hot"
              :option-prefix="`${id}-option-`"
              :offset="history.length"
              :active="active"
              @select="$emit('select', $event)"
            />
            <SearchPlaceholder
              v-else
              key="empty-hot"
              title="热搜榜暂时留白"
              description="不妨先搜搜你喜欢的内容"
            />
          </Transition>
        </div>
      </template>
      <template v-else>
        <SearchPlaceholder v-if="suggestLoading" kind="suggest" loading title="正在寻找相关内容" />
        <div v-else-if="suggestions.length" class="discovery-panel__suggestions">
          <button
            v-for="(item, index) in suggestions"
            :id="`${id}-option-${index}`"
            :key="item.value"
            type="button"
            role="option"
            :aria-selected="active === index"
            class="discovery-panel__suggestion"
            :class="{ 'is-active': active === index }"
            @mousedown.prevent
            @click="$emit('select', item.value)"
          >
            <Search :size="15" aria-hidden="true" />
            <span
              v-if="item.highlight"
              class="discovery-panel__suggestion-label"
              v-html="sanitize(item.highlight)"
            ></span>
            <span v-else class="discovery-panel__suggestion-label">{{ item.value }}</span>
            <ArrowUpRight :size="15" aria-hidden="true" />
          </button>
        </div>
        <SearchPlaceholder
          v-else
          kind="suggest"
          :title="suggestFailed ? '搜索建议暂时不可用' : '暂时没有相关建议'"
          description="按回车，直接搜索你输入的内容"
        />
      </template>
    </div>
    <div class="discovery-panel__footer">
      <button
        v-if="!query.trim() && hotFailed"
        type="button"
        class="discovery-panel__retry"
        @click="$emit('retry')"
      >
        重新加载热搜
      </button>
      <span v-else>发现下一份喜欢</span>
      <span class="discovery-panel__keys"
        ><span>↑ ↓ 选择</span
        ><span><CornerDownLeft :size="12" aria-hidden="true" />搜索</span></span
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.discovery-panel {
  padding: 12px 16px 0;
}
.discovery-panel__heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  margin-bottom: 6px;

  h3 {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 0;
    font-size: 13px;
    font-weight: 650;
    color: var(--color-foreground);
  }
  h3 svg {
    color: var(--color-primary);
  }
}
.discovery-panel__meta {
  font-size: 11px;
  color: var(--color-muted-foreground);
}
.discovery-panel__clear {
  display: flex;
  gap: 5px;
  align-items: center;
  min-height: 26px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--color-muted-foreground);
  border-radius: 6px;
}
.discovery-panel__clear:hover {
  color: var(--status-danger-ink);
  background: var(--color-muted);
}
.discovery-panel__history {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 30px;
  padding: 2px 0;
}
.discovery-panel__chip {
  display: flex;
  align-items: center;
  max-width: calc((100% - 12px) / 3);
  color: var(--color-muted-foreground);
  background: var(--color-secondary);
  border: 1px solid transparent;
  border-radius: 8px;
}
.discovery-panel__chip:hover,
.discovery-panel__chip.is-active {
  color: var(--color-foreground);
  background: var(--color-accent);
  border-color: var(--color-border);
}
.discovery-panel__history-label {
  min-width: 0;
  min-height: 28px;
  padding: 3px 2px 3px 9px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.discovery-panel__remove {
  display: grid;
  flex: 0 0 24px;
  height: 28px;
  place-items: center;
  opacity: 0.65;
}
.discovery-panel__remove:hover {
  color: var(--status-danger-ink);
  opacity: 1;
}
.discovery-panel__hot {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid var(--color-border);
}
.discovery-panel__suggestion {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 10px 8px;
  font-size: 14px;
  text-align: left;
  border-radius: 8px;
}
.discovery-panel__suggestion:hover,
.discovery-panel__suggestion.is-active {
  background: var(--color-accent);
}
.discovery-panel__suggestion-label {
  flex: 1;
  overflow: hidden;
  color: var(--color-foreground);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.discovery-panel__footer {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  margin-top: 8px;
  font-size: 10px;
  color: var(--color-muted-foreground);
  border-top: 1px solid var(--color-border);
}
.discovery-panel__keys,
.discovery-panel__keys > span {
  display: flex;
  gap: 10px;
  align-items: center;
}
.discovery-panel__keys > span {
  gap: 4px;
}
.discovery-panel__retry {
  min-height: 32px;
  color: var(--color-primary);
}
:deep(em) {
  font-style: normal;
  font-weight: 600;
  color: var(--color-primary);
}
.history-chip-move,
.history-chip-enter-active,
.history-chip-leave-active {
  transition:
    transform 240ms var(--ease-out-expo),
    opacity 180ms;
}
.history-chip-leave-active {
  position: absolute;
}
.history-chip-enter-from,
.history-chip-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.discovery-state-enter-active {
  transition:
    opacity 220ms,
    transform 220ms var(--ease-out-expo);
}
.discovery-state-leave-active {
  transition: opacity 120ms;
}
.discovery-state-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.discovery-state-leave-to {
  opacity: 0;
}

@media (width <= 480px) {
  .discovery-panel {
    padding: 10px 12px 0;
  }
  .discovery-panel__meta,
  .discovery-panel__keys {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-chip-move,
  .history-chip-enter-active,
  .history-chip-leave-active,
  .discovery-state-enter-active,
  .discovery-state-leave-active {
    transition: none;
  }
}
</style>
