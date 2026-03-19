<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { getPlayHistoryList, deletePlayHistory, type HistoryItem } from '@/api/video'
import { toast } from 'vue-sonner'
import { Search, Trash2, Loader2, Clock, X, Play, CheckSquare, Square } from 'lucide-vue-next'

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

const fmtDuration = (s: number): string => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const progressPercent = (item: HistoryItem): number => {
  if (!item.duration || item.duration === 0) return 0
  return Math.min((item.progress / item.duration) * 100, 100)
}

const progressText = (item: HistoryItem): string => {
  if (progressPercent(item) >= 95) return '已看完'
  return `看到 ${fmtDuration(item.progress)}`
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

const fetchHistory = async (page = 1) => {
  historyLoading.value = true
  try {
    const res = await getPlayHistoryList({
      page,
      pageSize: 40,
      keyword: searchKeyword.value.trim() || undefined,
    })
    historyItems.value = page === 1 ? res.list : [...historyItems.value, ...res.list]
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
  historyItems.value = []
  historyPage.value = 1
  void fetchHistory(1)
}

const clearSearch = () => {
  searchKeyword.value = ''
  searchActive.value = false
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
        <button
          class="hist-batch-delete"
          :disabled="selectedIds.size === 0"
          @click="deleteSelected"
        >
          <Trash2 :size="14" />
          删除所选
        </button>
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
                  :class="{ 'hist-item-selected': isSelected(item.videoId) }"
                >
                  <button
                    v-if="batchMode"
                    class="hist-checkbox"
                    @click.stop="toggleSelect(item.videoId)"
                  >
                    <CheckSquare
                      v-if="isSelected(item.videoId)"
                      :size="18"
                      class="text-[#00a1d6]"
                    />
                    <Square v-else :size="18" class="text-[#c9ccd0]" />
                  </button>
                  <div class="hist-item-cover" @click="goVideo(item.videoId)">
                    <img :src="item.cover" />
                    <span class="hist-item-dur">{{ fmtDuration(item.duration) }}</span>
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
                    <h4 class="hist-item-title" @click="goVideo(item.videoId)">
                      {{ item.title }}
                    </h4>
                    <div class="hist-item-meta">
                      <span class="hist-item-author" @click="router.push(`/user/${item.authorId}`)">
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
          <Clock :size="48" class="text-[#c9ccd0]" />
          <p>暂无历史记录</p>
        </div>

        <!-- Loading -->
        <div v-if="historyLoading && historyItems.length === 0" class="hist-loading">
          <Loader2 :size="24" class="animate-spin text-[#00a1d6]" />
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

<style scoped>
.hist-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 60px;
}

/* ===================== Header ===================== */
.hist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.hist-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hist-header-icon {
  color: #00a1d6;
}

.hist-title {
  font-size: 20px;
  font-weight: 700;
  color: #18191c;
}

/* ===================== Toolbar ===================== */
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
}

.hist-search-icon {
  position: absolute;
  left: 10px;
  color: #9499a0;
  pointer-events: none;
}

.hist-search-input {
  width: 220px;
  height: 34px;
  padding: 0 32px;
  border: 1px solid #e3e5e7;
  border-radius: 8px;
  font-size: 13px;
  color: #18191c;
  outline: none;
  transition: border-color 0.2s;
  background: #f6f7f8;
}

.hist-search-input:focus {
  border-color: #00a1d6;
  background: #fff;
}

.hist-search-input::placeholder {
  color: #c0c0c0;
}

.hist-search-clear {
  position: absolute;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e3e5e7;
  border: none;
  cursor: pointer;
  color: #61666d;
  transition: background 0.12s;
}

.hist-search-clear:hover {
  background: #d3d5d7;
}

.hist-batch-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #61666d;
  background: none;
  border: 1px solid #e3e5e7;
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;
}

.hist-batch-btn:hover {
  color: #00a1d6;
  border-color: #00a1d6;
}

/* ===================== Batch Bar ===================== */
.hist-batch-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #f0f8ff;
  border-radius: 8px;
  border: 1px solid #d3ecff;
}

.hist-batch-count {
  font-size: 13px;
  color: #00a1d6;
  font-weight: 500;
}

.hist-batch-delete {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #fff;
  background: #fb7299;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}

.hist-batch-delete:hover:not(:disabled) {
  background: #fc8bab;
}

.hist-batch-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===================== Timeline ===================== */
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
  background: #00a1d6;
  border: 2px solid #d3ecff;
  flex-shrink: 0;
}

.hist-time-text {
  font-size: 14px;
  font-weight: 600;
  color: #18191c;
}

.hist-time-line {
  position: relative;
  padding-left: 22px;
  margin-left: 4px;
  border-left: 2px solid #e3e5e7;
}

/* ===================== History Items ===================== */
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
  background: #fff;
  overflow: hidden;
  transition:
    box-shadow 0.18s,
    transform 0.18s;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.04);
}

.hist-item:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08);
  transform: translateY(-2px);
}

.hist-item-selected {
  outline: 2px solid #00a1d6;
  outline-offset: -2px;
}

.hist-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 3;
  background: #fff;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  padding: 2px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.15);
}

.hist-item-cover {
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  cursor: pointer;
  background: #e3e5e7;
}

.hist-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.hist-item:hover .hist-item-cover img {
  transform: scale(1.05);
}

.hist-item-dur {
  position: absolute;
  bottom: 14px;
  right: 6px;
  background: rgb(0 0 0 / 0.7);
  color: #fff;
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  line-height: 1.6;
  z-index: 1;
}

.hist-item-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgb(255 255 255 / 0.3);
  z-index: 2;
}

.hist-item-progress-fill {
  height: 100%;
  background: #fb7299;
  border-radius: 0 2px 2px 0;
  transition: width 0.3s;
}

.hist-item-play-overlay {
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

.hist-item:hover .hist-item-play-overlay {
  opacity: 1;
}

.hist-item-info {
  padding: 8px 10px 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hist-item-title {
  font-size: 13px;
  font-weight: 500;
  color: #18191c;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
  cursor: pointer;
  transition: color 0.12s;
}

.hist-item:hover .hist-item-title {
  color: #00a1d6;
}

.hist-item-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hist-item-author {
  font-size: 12px;
  color: #9499a0;
  cursor: pointer;
  transition: color 0.12s;
}

.hist-item-author:hover {
  color: #00a1d6;
}

.hist-item-progress-text {
  font-size: 11px;
  color: #9499a0;
  margin-top: auto;
}

.hist-item-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgb(0 0 0 / 0.5);
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.15s;
}

.hist-item:hover .hist-item-delete {
  opacity: 1;
}

.hist-item-delete:hover {
  background: #fb7299;
}

/* ===================== States ===================== */
.hist-empty {
  padding: 80px 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.hist-empty p {
  font-size: 14px;
  color: #9499a0;
}

.hist-loading {
  padding: 60px 0;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #9499a0;
}

.hist-loadmore {
  text-align: center;
  padding: 16px 0;
}

.hist-loadmore-btn {
  padding: 8px 32px;
  border-radius: 20px;
  border: 1px solid #e3e5e7;
  background: #fff;
  color: #61666d;
  font-size: 13px;
  cursor: pointer;
  transition:
    color 0.12s,
    border-color 0.12s;
}

.hist-loadmore-btn:hover:not(:disabled) {
  color: #00a1d6;
  border-color: #00a1d6;
}

.hist-loadmore-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

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
  }

  .hist-toolbar-right {
    width: 100%;
    justify-content: space-between;
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
