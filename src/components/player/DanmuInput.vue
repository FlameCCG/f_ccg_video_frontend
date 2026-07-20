<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  sendDanmu,
  danmuMillisecondsToSeconds,
  danmuSecondsToMilliseconds,
  type DanmuPositionType,
  DanmuPosition,
  type PlayerDanmuPayload,
} from '@/api/danmu'
import { toast } from 'vue-sonner'
import { Send, Settings2, ArrowUpToLine, ArrowDownToLine, MoveHorizontal } from 'lucide-vue-next'

const props = defineProps<{
  videoId: number
  partId?: number
  currentTime: number
  getCurrentTime?: () => number
}>()

const emit = defineEmits<{
  sent: [danmu: PlayerDanmuPayload]
}>()

const authStore = useAuthStore()

const inputText = ref('')
const selectedColor = ref('#ffffff')
const selectedPosition = ref<DanmuPositionType>(DanmuPosition.SCROLL)
const showSettings = ref(false)
const sending = ref(false)
const settingsBtnRef = ref<HTMLElement | null>(null)
const settingsPanelRef = ref<HTMLElement | null>(null)

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

const getExactCurrentTime = (): number => {
  const exactTime = props.getCurrentTime?.()
  if (typeof exactTime === 'number' && Number.isFinite(exactTime) && exactTime >= 0) {
    return exactTime
  }

  if (Number.isFinite(props.currentTime) && props.currentTime >= 0) {
    return props.currentTime
  }

  return 0
}

const normalizeDanmuTime = (timeOffset?: number): number | undefined => {
  if (typeof timeOffset !== 'number' || !Number.isFinite(timeOffset) || timeOffset < 0) {
    return undefined
  }

  return danmuMillisecondsToSeconds(timeOffset)
}

const handleSend = async () => {
  if (!canSend.value) {
    if (!authStore.isLoggedIn) {
      toast.warning('请先登录')
    }
    return
  }

  sending.value = true
  const text = inputText.value.trim()
  const sendAt = getExactCurrentTime()
  const timeMs = danmuSecondsToMilliseconds(sendAt)

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
      time: normalizeDanmuTime(result.timeOffset) ?? sendAt,
      color: selectedColor.value,
      mode: selectedPosition.value as 0 | 1 | 2,
      likeCount: result.likeCount ?? 0,
      isLiked: result.isLiked ?? false,
      createdAt: result.createdAt,
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

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void handleSend()
  }
  e.stopPropagation()
}

const toggleSettings = () => {
  showSettings.value = !showSettings.value
}

const handleClickOutside = (e: MouseEvent) => {
  if (!showSettings.value) return
  const target = e.target as Node
  if (settingsPanelRef.value?.contains(target)) return
  if (settingsBtnRef.value?.contains(target)) return
  showSettings.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div class="danmu-input-shell">
    <div class="danmu-control-bar relative flex items-center gap-2 px-3 py-2">
      <!-- Input -->
      <div class="relative flex-1">
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
      <div class="relative">
        <button
          ref="settingsBtnRef"
          class="icon-btn shrink-0"
          :class="{ 'is-active': showSettings }"
          title="弹幕设置"
          @click="toggleSettings"
        >
          <Settings2 :size="18" />
        </button>
      </div>

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
    </div>

    <Transition name="panel-pop">
      <div v-if="showSettings" ref="settingsPanelRef" class="settings-panel">
        <!-- Color Picker -->
        <div class="settings-section">
          <p class="settings-label">弹幕颜色</p>
          <div class="color-grid">
            <button
              v-for="color in PRESET_COLORS"
              :key="color"
              class="color-dot"
              :class="{ 'is-active': selectedColor === color }"
              :style="{ '--dot-color': color }"
              @click="selectedColor = color"
            >
              <span class="color-dot-inner" :style="{ backgroundColor: color }" />
            </button>
          </div>
        </div>

        <!-- Position (Segmented Control) -->
        <div class="settings-section">
          <p class="settings-label">弹幕位置</p>
          <div class="position-seg">
            <button
              v-for="pos in positionOptions"
              :key="pos.value"
              class="position-seg-item"
              :class="{ 'is-active': selectedPosition === pos.value }"
              @click="selectedPosition = pos.value"
            >
              <component :is="pos.icon" :size="14" />
              <span>{{ pos.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
/* ============================================
   DanmuInput — Refined Bilibili-grade Popover
   ============================================ */
.danmu-control-bar {
  background: var(--surface-1, oklch(96.5% 0.008 240deg));
  border-top: 1px solid oklch(0% 0 0deg / 0.04);
  transition: background 0.2s ease;
}

.dark .danmu-control-bar {
  background: var(--surface-1, oklch(22% 0.012 250deg));
  border-top-color: oklch(100% 0 0deg / 0.06);
}

.danmu-input {
  height: 34px;
  border-radius: 17px;
  background-color: oklch(96% 0.004 240deg);
  border: 1.5px solid transparent;
  padding: 0 14px;
  font-size: 13px;
  color: var(--color-foreground);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  outline: none;

  &-shell {
    position: relative;
  }

  &::placeholder {
    color: var(--color-muted-foreground);
    font-size: 13px;
  }

  &:hover:not(:disabled) {
    background-color: oklch(94% 0.006 240deg);
  }

  &:focus {
    background-color: var(--color-card);
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2.5px oklch(var(--primary) / 0.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.dark .danmu-input {
  background: oklch(24% 0.01 250deg);
  color: oklch(92% 0.01 250deg);

  &::placeholder {
    color: oklch(55% 0.015 250deg);
  }

  &:hover:not(:disabled) {
    background: oklch(28% 0.012 250deg);
  }

  &:focus {
    background: oklch(18% 0.01 250deg);
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2.5px oklch(var(--primary) / 0.25);
  }
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: oklch(55% 0.02 240deg);
  background: transparent;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  cursor: pointer;
  border: none;

  &:hover {
    color: var(--color-foreground);
    background: oklch(0% 0 0deg / 0.06);
  }

  &:active {
    transform: scale(0.92);
  }

  &.is-active {
    color: var(--color-primary);
    background: oklch(var(--primary) / 0.1);
  }
}

.dark .icon-btn {
  color: oklch(60% 0.015 250deg);

  &:hover {
    color: oklch(90% 0.01 250deg);
    background: oklch(100% 0 0deg / 0.08);
  }

  &.is-active {
    color: var(--color-primary);
    background: oklch(var(--primary) / 0.15);
  }
}

.send-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 34px;
  padding: 0 16px;
  border-radius: 17px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-primary-foreground);
  background-color: var(--color-primary);
  border: none;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 4px oklch(var(--primary) / 0.25);

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 3px 10px oklch(var(--primary) / 0.35);

    .send-icon {
      transform: translateX(1px) translateY(-1px);
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.97);
  }

  &:disabled {
    background-color: oklch(92% 0.005 240deg);
    color: oklch(60% 0.02 240deg);
    box-shadow: none;
    cursor: not-allowed;
  }

  &.is-success {
    background: oklch(60% 0.16 155deg);
    box-shadow: 0 1px 4px oklch(60% 0.16 155deg / 0.3);
    cursor: default;
  }
}

.dark .send-btn:disabled {
  background: oklch(26% 0.01 250deg);
  color: oklch(45% 0.015 250deg);
}

.send-icon {
  transition: transform 0.18s ease;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 60;
  width: 248px;
  background: oklch(99.5% 0.002 240deg / 0.95);
  backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid oklch(0% 0 0deg / 0.08);
  border-radius: 12px;
  padding: 14px;
  box-shadow:
    0 4px 16px oklch(0% 0 0deg / 0.08),
    0 1px 4px oklch(0% 0 0deg / 0.04);
  transform-origin: top right;
}

.dark .settings-panel {
  background: oklch(22% 0.012 250deg / 0.92);
  border-color: oklch(100% 0 0deg / 0.08);
  box-shadow:
    0 4px 16px oklch(0% 0 0deg / 0.3),
    0 1px 4px oklch(0% 0 0deg / 0.15);
}

.settings-section {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid oklch(0% 0 0deg / 0.05);

  &:last-child {
    padding-bottom: 0;
    margin-bottom: 0;
    border-bottom: none;
  }
}

.dark .settings-section {
  border-bottom-color: oklch(100% 0 0deg / 0.06);
}

.settings-label {
  font-size: 12px;
  font-weight: 600;
  color: oklch(40% 0.02 240deg);
  margin-bottom: 10px;
  letter-spacing: 0.03em;
}

.dark .settings-label {
  color: oklch(70% 0.015 250deg);
}

.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.color-dot {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  background: transparent;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &-inner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px oklch(0% 0 0deg / 0.1);
    transition: transform 0.15s ease;
  }

  &:hover .color-dot-inner {
    transform: scale(1.1);
  }

  &.is-active {
    border-color: var(--dot-color);
    box-shadow: 0 0 0 1px oklch(0% 0 0deg / 0.06);

    .color-dot-inner {
      transform: scale(0.85);
    }
  }

  &:first-child .color-dot-inner {
    box-shadow: inset 0 0 0 1px oklch(0% 0 0deg / 0.15);
  }
}

.dark .color-dot:first-child .color-dot-inner {
  box-shadow: inset 0 0 0 1px oklch(100% 0 0deg / 0.2);
}

.position-seg {
  display: flex;
  gap: 1px;
  background: oklch(0% 0 0deg / 0.06);
  border-radius: 8px;
  padding: 2px;

  &-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 0;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    color: oklch(50% 0.02 240deg);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

    &:hover {
      color: var(--color-foreground);
    }

    &.is-active {
      color: var(--color-primary);
      background: var(--color-card);
      box-shadow: 0 1px 3px oklch(0% 0 0deg / 0.06);
    }
  }
}

.dark .position-seg {
  background: oklch(0% 0 0deg / 0.2);

  &-item {
    color: oklch(60% 0.015 250deg);

    &:hover {
      color: oklch(85% 0.01 250deg);
    }

    &.is-active {
      color: var(--color-primary);
      background: oklch(28% 0.015 250deg);
      box-shadow: 0 1px 3px oklch(0% 0 0deg / 0.2);
    }
  }
}

.panel-pop-enter-active,
.panel-pop-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel-pop-enter-from,
.panel-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

/* --- Input Field --- */

/* --- Icon Button --- */

/* --- Send Button --- */

/* --- Color Picker (compact dots) --- */

/* White color dot needs visible border */

/* --- Position Segmented Control --- */

/* --- Panel Animation --- */
</style>
