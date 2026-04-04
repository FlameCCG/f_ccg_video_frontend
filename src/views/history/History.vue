<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getPlayHistoryList, deletePlayHistory, type HistoryItem } from '@/api/video'
import { toast } from 'vue-sonner'
import { Search, Trash2, Loader2, Clock, X, Play, CheckSquare, Square } from 'lucide-vue-next'
import { formatDuration } from '@/utils/format'

const router = useRouter()

const historyItems = ref<HistoryItem[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyLoading = ref(false)
const historyInitLoaded = ref(false)

const searchKeyword = ref('')
const searchActive = ref(false)

const batchMode = ref(false)
const selectedIds = ref<Set<number>>(new Set())

const progressPercent = (item: HistoryItem): number => {
  if (!item.duration || item.duration === 0) return 0
  return Math.min((item.progress / item.duration) * 100, 100)
}

const progressText = (item: HistoryItem): string => {
  if (progressPercent(item) >= 95) return '已看完'
  return `看到 ${formatDuration(item.progress)}`
}

interface TimeGroup {
  label: string
  items: HistoryItem[]
}

const groupedHistory = computed<TimeGroup[]>(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000)

  const groups: Record<string, HistoryItem[]> = {}
  const order: string[] = []

  for (const item of historyItems.value) {
    const d = new Date(item.createdAt)
    let label: string
    if (d >= todayStart) {
      label = '今天'
    } else if (d >= yesterdayStart) {
      label = '昨天'
    } else if (d >= weekStart) {
      label = '近一周'
    } else {
      label = '更早'
    }
    if (!groups[label]) {
      groups[label] = []
      order.push(label)
    }
    groups[label]!.push(item)
  }

  const sortOrder = ['今天', '昨天', '近一周', '更早']
  order.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b))

  return order.map((label) => ({ label, items: groups[label]! }))
})

const selectableVideoIds = computed(() => historyItems.value.map((item) => item.videoId))

const hasSelectableItems = computed(() => selectableVideoIds.value.length > 0)

const allVisibleSelected = computed(
  () =>
    hasSelectableItems.value &&
    selectableVideoIds.value.every((videoId) => selectedIds.value.has(videoId))
)

const syncSelectedIds = () => {
  const visibleIds = new Set(selectableVideoIds.value)
  for (const videoId of Array.from(selectedIds.value)) {
    if (!visibleIds.has(videoId)) {
      selectedIds.value.delete(videoId)
    }
  }
}

const fetchHistory = async (page = 1) => {
  historyLoading.value = true
  try {
    const res = await getPlayHistoryList({
      page,
      pageSize: 40,
      keyword: searchKeyword.value.trim() || undefined,
    })
    historyItems.value = page === 1 ? res.list : [...historyItems.value, ...res.list]
    syncSelectedIds()
    historyTotal.value = res.total
    historyPage.value = page
    historyInitLoaded.value = true
  } catch {
    if (!historyInitLoaded.value) historyInitLoaded.value = true
    toast.error('获取历史记录失败')
  } finally {
    historyLoading.value = false
  }
}

const handleSearch = () => {
  selectedIds.value.clear()
  historyItems.value = []
  historyPage.value = 1
  void fetchHistory(1)
}

const clearSearch = () => {
  searchKeyword.value = ''
  searchActive.value = false
  selectedIds.value.clear()
  historyItems.value = []
  void fetchHistory(1)
}

const loadMore = () => {
  if (historyItems.value.length < historyTotal.value) {
    void fetchHistory(historyPage.value + 1)
  }
}

const toggleBatchMode = () => {
  batchMode.value = !batchMode.value
  if (!batchMode.value) selectedIds.value.clear()
}

const toggleSelect = (videoId: number) => {
  if (selectedIds.value.has(videoId)) {
    selectedIds.value.delete(videoId)
  } else {
    selectedIds.value.add(videoId)
  }
}

const handleItemClick = (videoId: number) => {
  if (!batchMode.value) return
  toggleSelect(videoId)
}

const handleVideoClick = (videoId: number) => {
  if (batchMode.value) {
    toggleSelect(videoId)
    return
  }
  goVideo(videoId)
}

const handleAuthorClick = (authorId: number, videoId: number) => {
  if (batchMode.value) {
    toggleSelect(videoId)
    return
  }
  void router.push(`/user/${authorId}`)
}

const toggleSelectAll = () => {
  if (!hasSelectableItems.value) return
  if (allVisibleSelected.value) {
    selectedIds.value.clear()
    return
  }
  selectedIds.value = new Set(selectableVideoIds.value)
}

const isSelected = (videoId: number) => selectedIds.value.has(videoId)

const deleteSelected = async () => {
  if (selectedIds.value.size === 0) {
    toast.warning('请选择要删除的记录')
    return
  }
  try {
    await deletePlayHistory({ videoIds: Array.from(selectedIds.value) })
    toast.success('删除成功')
    selectedIds.value.clear()
    batchMode.value = false
    void fetchHistory(1)
  } catch {
    toast.error('删除失败')
  }
}

const deleteSingle = async (videoId: number) => {
  try {
    await deletePlayHistory({ videoIds: [videoId] })
    historyItems.value = historyItems.value.filter((i) => i.videoId !== videoId)
    syncSelectedIds()
    historyTotal.value = Math.max(0, historyTotal.value - 1)
    toast.success('已删除')
  } catch {
    toast.error('删除失败')
  }
}

const goVideo = (id: number) => void router.push(`/video/${id}`)

onMounted(() => {
  void fetchHistory(1)
})

watch(searchKeyword, (val) => {
  searchActive.value = val.length > 0
})
</script>

<template>
  <div class="hist-page">
    <div class="hist-container">
      <!-- Page Header -->
      <div class="hist-header">
        <div class="hist-header-left">
          <Clock :size="22" class="hist-header-icon" />
          <h1 class="hist-title">历史记录</h1>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="hist-toolbar">
        <div class="hist-search">
          <Search :size="15" class="hist-search-icon" />
          <input
            v-model="searchKeyword"
            class="hist-search-input"
            placeholder="搜索历史记录"
            @keyup.enter="handleSearch"
          />
          <button v-if="searchActive" class="hist-search-clear" @click="clearSearch">
            <X :size="14" />
          </button>
        </div>
        <button class="hist-batch-btn" @click="toggleBatchMode">
          {{ batchMode ? '取消' : '批量管理' }}
        </button>
      </div>

      <!-- Batch Action Bar -->
      <div v-if="batchMode" class="hist-batch-bar">
        <span class="hist-batch-count">已选择 {{ selectedIds.size }} 项</span>
        <div class="hist-batch-actions">
          <button
            class="hist-batch-select-all"
            :disabled="!hasSelectableItems"
            @click="toggleSelectAll"
          >
            <CheckSquare v-if="allVisibleSelected" :size="16" />
            <Square v-else :size="16" />
            {{ allVisibleSelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="hist-batch-delete"
            :disabled="selectedIds.size === 0"
            @click="deleteSelected"
          >
            <Trash2 :size="16" />
            删除所选
          </button>
        </div>
      </div>

      <!-- Timeline Content -->
      <div class="hist-content">
        <template v-for="group in groupedHistory" :key="group.label">
          <div class="hist-time-group">
            <div class="hist-time-label">
              <span class="hist-time-dot"></span>
              <span class="hist-time-text">{{ group.label }}</span>
            </div>
            <div class="hist-time-line">
              <div class="hist-items">
                <div
                  v-for="item in group.items"
                  :key="item.videoId"
                  class="hist-item"
                  :class="{
                    'hist-item-selected': isSelected(item.videoId),
                    'hist-item-batch': batchMode,
                  }"
                  @click="handleItemClick(item.videoId)"
                >
                  <button
                    v-if="batchMode"
                    class="hist-checkbox"
                    :class="{ 'hist-checkbox-checked': isSelected(item.videoId) }"
                    @click.stop="toggleSelect(item.videoId)"
                  >
                    <CheckSquare v-if="isSelected(item.videoId)" :size="18" />
                    <Square v-else :size="18" />
                  </button>
                  <div class="hist-item-cover" @click.stop="handleVideoClick(item.videoId)">
                    <img :src="item.cover" />
                    <span class="hist-item-dur">{{ formatDuration(item.duration) }}</span>
                    <div class="hist-item-progress-bar">
                      <div
                        class="hist-item-progress-fill"
                        :style="{ width: `${progressPercent(item)}%` }"
                      ></div>
                    </div>
                    <div class="hist-item-play-overlay">
                      <Play :size="28" fill="white" />
                    </div>
                  </div>
                  <div class="hist-item-info">
                    <h4 class="hist-item-title" @click.stop="handleVideoClick(item.videoId)">
                      {{ item.title }}
                    </h4>
                    <div class="hist-item-meta">
                      <span
                        class="hist-item-author"
                        @click.stop="handleAuthorClick(item.authorId, item.videoId)"
                      >
                        {{ item.author }}
                      </span>
                    </div>
                    <div class="hist-item-progress-text">
                      {{ progressText(item) }}
                    </div>
                  </div>
                  <button
                    v-if="!batchMode"
                    class="hist-item-delete"
                    title="删除"
                    @click.stop="deleteSingle(item.videoId)"
                  >
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty State -->
        <div
          v-if="historyItems.length === 0 && !historyLoading && historyInitLoaded"
          class="hist-empty"
        >
          <Clock :size="48" class="text-muted-foreground" />
          <p>暂无历史记录</p>
        </div>

        <!-- Loading -->
        <div v-if="historyLoading && historyItems.length === 0" class="hist-loading">
          <Loader2 :size="24" class="animate-spin text-primary" />
          <span>加载中...</span>
        </div>

        <!-- Load More -->
        <div
          v-if="historyItems.length > 0 && historyItems.length < historyTotal"
          class="hist-loadmore"
        >
          <button class="hist-loadmore-btn" :disabled="historyLoading" @click="loadMore">
            {{ historyLoading ? '加载中...' : '加载更多' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.hist-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}

.hist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;

  &-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &-icon {
    color: var(--color-primary);
  }
}

.hist-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-foreground);
}

.hist-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.hist-search {
  position: relative;
  display: flex;
  align-items: center;

  &-icon {
    position: absolute;
    left: 10px;
    color: var(--color-muted-foreground);
    pointer-events: none;
  }

  &-input {
    width: 220px;
    height: 34px;
    padding: 0 32px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    font-size: 13px;
    color: var(--color-foreground);
    outline: none;
    transition: border-color 0.2s;
    background-color: var(--color-secondary);

    &:focus {
      border-color: var(--color-primary);
      background-color: var(--color-card);
    }

    &::placeholder {
      color: var(--color-muted-foreground);
    }
  }

  &-clear {
    position: absolute;
    right: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: var(--color-secondary);
    border: none;
    cursor: pointer;
    color: var(--color-muted-foreground);
    transition: background 0.12s;

    &:hover {
      background-color: var(--color-muted);
    }
  }
}

.hist-batch-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--color-muted-foreground);
  background: none;
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;

  &:hover {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.hist-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 12px 20px;
  margin-bottom: 20px;
  background-color: var(--color-card);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm, 0 2px 8px rgb(0, 0, 0, 0.05));
  transition: all 0.2s;
}

html.dark .hist-batch-bar {
  box-shadow: 0 4px 12px rgb(0, 0, 0, 0.2);
}

.hist-batch-count {
  font-size: 15px;
  color: var(--color-foreground);
  font-weight: 600;
}

.hist-batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hist-batch-select-all,
.hist-batch-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hist-batch-select-all {
  color: var(--color-foreground);
  background-color: transparent;
  border: 1px solid var(--color-border);

  &:hover:not(:disabled) {
    background-color: var(--color-secondary);
    border-color: var(--color-foreground);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}

.hist-batch-delete {
  color: var(--color-background);
  background-color: var(--color-foreground);
  border: 1px solid var(--color-foreground);

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }
}

.hist-batch-select-all:disabled,
.hist-batch-delete:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hist-content {
  position: relative;
}

.hist-time-group {
  position: relative;
  margin-bottom: 8px;
}

.hist-time-label {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  position: relative;
  z-index: 1;
}

.hist-time-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: oklch(var(--primary) / 0.06);
  color: var(--color-primary);
  border: 1px solid oklch(var(--primary) / 0.15);
  flex-shrink: 0;
}

.hist-time-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-foreground);
}

.hist-time-line {
  position: relative;
  padding-left: 22px;
  margin-left: 4px;
  border-left: 2px solid var(--color-border);
}

.hist-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  padding: 4px 0 16px;
}

.hist-item {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background-color: var(--color-card);
  overflow: hidden;
  transition:
    box-shadow 0.18s,
    transform 0.18s;
  box-shadow: var(--shadow-surface);

  &:hover {
    box-shadow: var(--shadow-raised);
    transform: translateY(-2px);

    .hist-item-cover img {
      transform: scale(1.05);
    }

    .hist-item-play-overlay {
      opacity: 1;
    }

    .hist-item-title {
      color: var(--color-primary);
    }

    .hist-item-delete {
      opacity: 1;
    }
  }

  &-selected {
    outline: 2px solid var(--color-primary);
    outline-offset: -2px;
  }

  &-batch {
    cursor: pointer;

    .hist-item-play-overlay {
      display: none;
    }

    &:hover .hist-item-title {
      color: var(--color-foreground);
    }

    .hist-item-author:hover {
      color: var(--color-muted-foreground);
    }
  }

  &-cover {
    position: relative;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    cursor: pointer;
    background-color: var(--color-secondary);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s;
    }
  }

  &-dur {
    position: absolute;
    bottom: 14px;
    right: 6px;
    background: rgb(0 0 0 / 0.7);
    color: var(--color-primary-foreground);
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 3px;
    line-height: 1.6;
    z-index: 1;
  }

  &-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgb(128, 128, 128, 0.4);
    z-index: 2;
    backdrop-filter: blur(2px);
  }

  &-progress-fill {
    height: 100%;
    background: rgb(220, 40, 70);
    border-radius: 0 2px 2px 0;
    transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 0 4px rgb(220, 40, 70, 0.4);
  }

  &-play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 0.25);
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 1;
  }

  &-info {
    padding: 8px 10px 10px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-foreground);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
    cursor: pointer;
    transition: color 0.12s;
  }

  &-meta {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &-author {
    font-size: 12px;
    color: var(--color-muted-foreground);
    cursor: pointer;
    transition: color 0.12s;

    &:hover {
      color: var(--color-primary);
    }
  }

  &-progress-text {
    font-size: 11px;
    color: var(--color-muted-foreground);
    margin-top: auto;
  }

  &-delete {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 3;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.5);
    color: var(--color-primary-foreground);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;

    &:hover {
      background-color: var(--color-accent);
    }
  }
}

.hist-checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  background-color: rgb(0, 0, 0, 0.6);
  border-radius: 6px;
  border: 1px solid rgb(255, 255, 255, 0.2);
  cursor: pointer;
  padding: 4px;
  color: rgb(255, 255, 255, 0.7);
  backdrop-filter: blur(4px);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &-checked {
    background-color: var(--color-foreground);
    color: var(--color-background);
    border-color: var(--color-foreground);

    &:hover {
      background-color: var(--color-foreground);
      color: var(--color-background);
      opacity: 0.9;
    }
  }

  &:hover {
    background-color: rgb(0, 0, 0, 0.8);
    color: white;
  }
}

.hist-item-batch .hist-item-cover,
.hist-item-batch .hist-item-title,
.hist-item-batch .hist-item-author,
.hist-item-batch .hist-item-progress-text {
  cursor: pointer;
}

.hist-empty {
  padding: 80px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  p {
    font-size: 14px;
    color: var(--color-muted-foreground);
  }
}

.hist-loading {
  padding: 60px 0;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-muted-foreground);
}

.hist-loadmore {
  text-align: center;
  padding: 16px 0;

  &-btn {
    padding: 8px 32px;
    border-radius: 20px;
    border: 1px solid var(--color-border);
    background-color: var(--color-card);
    color: var(--color-muted-foreground);
    font-size: 13px;
    cursor: pointer;
    transition:
      color 0.12s,
      border-color 0.12s;

    &:hover:not(:disabled) {
      color: var(--color-primary);
      border-color: var(--color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}

/* ===================== Header ===================== */

/* ===================== Toolbar ===================== */

/* ===================== Batch Bar ===================== */

/* ===================== Timeline ===================== */

/* ===================== History Items ===================== */

/* ===================== States ===================== */

/* ===================== Responsive ===================== */
@media (width <= 768px) {
  .hist-items {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px;
  }

  .hist-toolbar {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;

    &-right {
      width: 100%;
      justify-content: space-between;
    }
  }

  .hist-search-input {
    width: 160px;
  }
}

@media (width <= 480px) {
  .hist-items {
    grid-template-columns: 1fr;
  }
}
</style>
