<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  sendDanmu,
  getDanmuHistory,
  type DanmuPositionType,
  DanmuPosition,
  type PlayerDanmuPayload,
} from '@/api/danmu'
import { toast } from 'vue-sonner'
import {
  Send,
  Settings2,
  ArrowUpToLine,
  ArrowDownToLine,
  MoveHorizontal,
  Calendar,
} from 'lucide-vue-next'

const props = defineProps<{
  videoId: number
  partId?: number
  currentTime: number
}>()

const emit = defineEmits<{
  sent: [danmu: PlayerDanmuPayload]
  toggleVisible: [visible: boolean]
  loadHistory: [danmuList: PlayerDanmuPayload[]]
}>()

const authStore = useAuthStore()

const inputText = ref('')
const selectedColor = ref('#ffffff')
const selectedPosition = ref<DanmuPositionType>(DanmuPosition.SCROLL)
const showSettings = ref(false)
const sending = ref(false)

const PRESET_COLORS = [
  '#ffffff',
  '#fe0302',
  '#ff7204',
  '#ffaa02',
  '#ffd302',
  '#00cd00',
  '#00a1d6',
  '#aa58d6',
  '#fb7299',
  '#e2027a',
]

const positionOptions = [
  { value: DanmuPosition.SCROLL, label: '滚动', icon: MoveHorizontal },
  { value: DanmuPosition.TOP, label: '顶部', icon: ArrowUpToLine },
  { value: DanmuPosition.BOTTOM, label: '底部', icon: ArrowDownToLine },
]

const canSend = computed(
  () => authStore.isLoggedIn && inputText.value.trim().length > 0 && !sending.value
)

const sendSuccess = ref(false)

const handleSend = async () => {
  if (!canSend.value) {
    if (!authStore.isLoggedIn) {
      toast.warning('请先登录')
    }
    return
  }

  sending.value = true
  const text = inputText.value.trim()
  const timeMs = Math.round(props.currentTime * 1000)

  try {
    const sendParams: Parameters<typeof sendDanmu>[0] = {
      videoId: props.videoId,
      content: text,
      timeOffset: timeMs,
      color: selectedColor.value,
      position: selectedPosition.value,
    }
    if (props.partId) sendParams.partId = props.partId
    const result = await sendDanmu(sendParams)
    const sentDanmu: PlayerDanmuPayload = {
      id: result.id,
      text,
      time: props.currentTime,
      color: selectedColor.value,
      mode: selectedPosition.value as 0 | 1 | 2,
      isSelf: true,
    }

    inputText.value = ''
    sendSuccess.value = true
    setTimeout(() => {
      sendSuccess.value = false
    }, 1500)
    toast.success('弹幕发送成功')

    try {
      emit('sent', sentDanmu)
    } catch (error) {
      console.error('Failed to sync sent danmu to player', error)
    }
  } catch {
    toast.error('弹幕发送失败')
  } finally {
    sending.value = false
  }
}

const historyDate = ref('')
const loadingHistory = ref(false)

const handleLoadHistory = async () => {
  if (!historyDate.value || loadingHistory.value) return
  loadingHistory.value = true
  try {
    const historyParams: Parameters<typeof getDanmuHistory>[0] = {
      videoId: props.videoId,
    }
    if (props.partId) historyParams.partId = props.partId
    const result = await getDanmuHistory(historyParams)
    const mapped = (result.list ?? []).map((d) => ({
      text: d.content,
      time: d.timeOffset / 1000,
      color: d.color || '#ffffff',
      mode: (d.position ?? 0) as 0 | 1 | 2,
    }))
    emit('loadHistory', mapped)
    toast.success(`已加载 ${mapped.length} 条历史弹幕`)
  } catch {
    toast.error('加载历史弹幕失败')
  } finally {
    loadingHistory.value = false
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
  e.stopPropagation()
}
</script>

<template>
  <div class="danmu-control-bar relative flex items-center gap-3 px-4 py-2.5">
    <!-- Input -->
    <div class="relative flex-1 group">
      <input
        v-model="inputText"
        type="text"
        :placeholder="authStore.isLoggedIn ? '发个弹幕见证当下~' : '登录后发弹幕'"
        maxlength="200"
        class="danmu-input w-full"
        :disabled="!authStore.isLoggedIn"
        @keydown="handleKeydown"
      />
    </div>

    <!-- Settings Toggle -->
    <button
      class="icon-btn shrink-0"
      :class="{ 'is-active': showSettings }"
      title="弹幕设置"
      @click="showSettings = !showSettings"
    >
      <Settings2 :size="18" />
    </button>

    <!-- Send Button -->
    <button
      class="send-btn shrink-0"
      :class="{ 'is-success': sendSuccess }"
      :disabled="!canSend && !sendSuccess"
      @click="handleSend"
    >
      <Send v-if="!sendSuccess" :size="14" class="send-icon" />
      <span>{{ sendSuccess ? '已发送 ✓' : '发送' }}</span>
    </button>

    <!-- Settings Panel -->
    <Transition name="panel-fade">
      <div
        v-if="showSettings"
        class="settings-panel absolute bottom-[calc(100%+12px)] right-0 z-50 w-[280px]"
      >
        <div class="space-y-5">
          <!-- Color Picker -->
          <div>
            <p class="setting-title">弹幕颜色</p>
            <div class="color-grid">
              <button
                v-for="color in PRESET_COLORS"
                :key="color"
                class="color-dot"
                :class="{ 'is-active': selectedColor === color }"
                :style="{ backgroundColor: color }"
                @click="selectedColor = color"
              />
            </div>
          </div>

          <!-- Position -->
          <div>
            <p class="setting-title">弹幕位置</p>
            <div class="position-grid">
              <button
                v-for="pos in positionOptions"
                :key="pos.value"
                class="position-btn"
                :class="{ 'is-active': selectedPosition === pos.value }"
                @click="selectedPosition = pos.value"
              >
                <component :is="pos.icon" :size="16" />
                <span>{{ pos.label }}</span>
              </button>
            </div>
          </div>

          <!-- Historical Danmu -->
          <div>
            <p class="setting-title">历史弹幕</p>
            <div class="flex items-center gap-2">
              <Calendar :size="14" class="shrink-0 text-muted-foreground" />
              <input v-model="historyDate" type="date" class="history-date-input flex-1" />
              <button
                class="history-load-btn"
                :disabled="!historyDate || loadingHistory"
                @click="handleLoadHistory"
              >
                {{ loadingHistory ? '加载中...' : '加载' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* ============================================
   DanmuInput — Bilibili Style Refined
   Ambition: Polished Bilibili Experience
   ============================================ */

.danmu-control-bar {
  background: var(--surface-1, oklch(99% 0.001 80deg));
  border-radius: 0 0 8px 8px;
  box-shadow: 0 -1px 2px rgb(0 0 0 / 0.03);
  transition: background 0.3s ease;
}

:deep(.dark) .danmu-control-bar,
.dark .danmu-control-bar {
  background: var(--surface-1, oklch(16% 0.01 260deg));
  box-shadow: 0 -1px 2px rgb(0 0 0 / 0.2);
}

/* --- Icon Buttons --- */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #757575;
  background: transparent;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  border: none;
}

.icon-btn:hover {
  color: var(--color-foreground);
  background: rgb(0 0 0 / 0.05);
  transform: scale(1.05);
}

.icon-btn:active {
  transform: scale(0.95);
}

.icon-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.1);
}

:deep(.dark) .icon-btn,
.dark .icon-btn {
  color: var(--color-muted-foreground);
}

:deep(.dark) .icon-btn:hover,
.dark .icon-btn:hover {
  color: #e3e5e7;
  background: rgb(255 255 255 / 0.1);
}

:deep(.dark) .icon-btn.is-active,
.dark .icon-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.15);
}

/* --- Input Field --- */
.danmu-input {
  height: 32px;
  border-radius: 16px;
  background-color: var(--color-secondary);
  border: 1px solid transparent;
  padding: 0 16px;
  font-size: 13px;
  color: var(--color-foreground);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;
}

.danmu-input::placeholder {
  color: var(--color-muted-foreground);
}

.danmu-input:hover:not(:disabled) {
  background-color: var(--color-secondary);
}

.danmu-input:focus {
  background-color: var(--color-card);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px oklch(var(--primary) / 0.2);
}

.danmu-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

:deep(.dark) .danmu-input,
.dark .danmu-input {
  background: #2f3134;
  color: #e3e5e7;
}

:deep(.dark) .danmu-input::placeholder,
.dark .danmu-input::placeholder {
  color: #797b80;
}

:deep(.dark) .danmu-input:hover:not(:disabled),
.dark .danmu-input:hover:not(:disabled) {
  background: #3e4043;
}

:deep(.dark) .danmu-input:focus,
.dark .danmu-input:focus {
  background: #18191c;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px oklch(var(--primary) / 0.3);
}

/* --- Send Button --- */
.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 16px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #ffffff;
  background-color: var(--color-primary);
  border: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 6px oklch(var(--primary) / 0.3);
}

.send-btn:hover:not(:disabled) {
  background-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(var(--primary) / 0.4);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.96);
  box-shadow: 0 2px 4px oklch(var(--primary) / 0.3);
}

.send-btn:disabled {
  background-color: var(--color-secondary);
  color: var(--color-muted-foreground);
  box-shadow: none;
  cursor: not-allowed;
}

.send-btn.is-success {
  background: #00b578;
  box-shadow: 0 2px 6px oklch(var(--primary) / 0.3);
  cursor: default;
}

:deep(.dark) .send-btn:disabled,
.dark .send-btn:disabled {
  background: #2f3134;
  color: #5f6165;
}

.send-icon {
  transition: transform 0.2s ease;
}

.send-btn:hover:not(:disabled) .send-icon {
  transform: translateX(2px) translateY(-2px);
}

/* --- Settings Panel (Glassmorphism) --- */
.settings-panel {
  background: rgb(255 255 255 / 0.85);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgb(0 0 0 / 0.08);
  border-radius: 12px;
  padding: 20px;
  box-shadow:
    0 8px 24px rgb(0 0 0 / 0.12),
    0 2px 8px rgb(0 0 0 / 0.04);
  transform-origin: bottom right;
}

:deep(.dark) .settings-panel,
.dark .settings-panel {
  background: rgb(34 35 38 / 0.85);
  border-color: rgb(255 255 255 / 0.08);
  box-shadow:
    0 8px 24px rgb(0 0 0 / 0.3),
    0 2px 8px rgb(0 0 0 / 0.2);
}

.setting-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-foreground);
  margin-bottom: 12px;
  letter-spacing: 0.02em;
}

:deep(.dark) .setting-title,
.dark .setting-title {
  color: #e3e5e7;
}

/* --- Color Picker --- */
.color-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.color-dot {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.1);
}

.color-dot:hover {
  transform: scale(1.1) translateY(-2px);
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 0.1),
    0 4px 8px rgb(0 0 0 / 0.15);
}

.color-dot.is-active {
  transform: scale(1.15);
  border-color: #ffffff;
  box-shadow:
    0 0 0 2px #00a1d6,
    0 4px 12px oklch(var(--primary) / 0.3);
  z-index: 1;
}

:deep(.dark) .color-dot.is-active,
.dark .color-dot.is-active {
  border-color: #222326;
}

/* --- Position Buttons --- */
.position-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.position-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 4px;
  border-radius: 8px;
  font-size: 12px;
  color: #757575;
  background-color: var(--color-secondary);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.position-btn:hover {
  background-color: var(--color-secondary);
  color: var(--color-foreground);
}

.position-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.1);
  border-color: oklch(var(--primary) / 0.3);
  font-weight: 500;
}

:deep(.dark) .position-btn,
.dark .position-btn {
  background: #2f3134;
  color: var(--color-muted-foreground);
}

:deep(.dark) .position-btn:hover,
.dark .position-btn:hover {
  background: #3e4043;
  color: #e3e5e7;
}

:deep(.dark) .position-btn.is-active,
.dark .position-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.15);
  border-color: oklch(var(--primary) / 0.4);
}

/* --- Historical Danmu --- */
.history-date-input {
  height: 30px;
  border-radius: 6px;
  background-color: var(--color-secondary);
  border: 1px solid transparent;
  padding: 0 8px;
  font-size: 12px;
  color: var(--color-foreground);
  outline: none;
  transition: all 0.2s ease;
}

.history-date-input:focus {
  border-color: var(--color-primary);
  background-color: var(--color-card);
}

:deep(.dark) .history-date-input,
.dark .history-date-input {
  background: #2f3134;
  color: #e3e5e7;
}

.history-load-btn {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background-color: var(--color-primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.history-load-btn:hover:not(:disabled) {
  background: #0091c2;
}

.history-load-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Animations --- */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition:
    opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.96);
}
</style>
