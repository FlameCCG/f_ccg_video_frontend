<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'vue-sonner'
import { ThumbsUp, Coins, Star, Zap, Share2, Flag, ChevronDown } from 'lucide-vue-next'
import FolderPicker from './FolderPicker.vue'

const videoStore = useVideoStore()
const authStore = useAuthStore()

const isLiked = computed(() => videoStore.interactionState.isLiked)
const isFavorited = computed(() => videoStore.interactionState.isFavorited)
const isCoined = computed(() => videoStore.interactionState.isCoined)

const likes = computed(() => videoStore.likes)
const coinCount = computed(() => videoStore.coinCount)
const favoriteCount = computed(() => videoStore.favoriteCount)

const likeAnimating = ref(false)
const tripleAnimating = ref(false)
const showCoinPicker = ref(false)
const showFolderPicker = ref(false)

const formatCount = (count: number): string => {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`
  return count > 0 ? count.toString() : ''
}

const requireLogin = (): boolean => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录')
    return false
  }
  return true
}

const handleLike = async () => {
  if (!requireLogin()) return
  likeAnimating.value = true
  await videoStore.toggleLike()
  setTimeout(() => {
    likeAnimating.value = false
  }, 600)
}

const handleCoin = async (coins: 1 | 2) => {
  if (!requireLogin()) return
  showCoinPicker.value = false
  const ok = await videoStore.addCoin(coins)
  if (ok) {
    toast.success(`投了${coins}个币`)
  }
}

/**
 * 收藏按钮点击：
 * 始终弹出收藏夹选择器，允许用户将视频添加到多个收藏夹
 */
const handleFavoriteClick = () => {
  if (!requireLogin()) return
  showFolderPicker.value = !showFolderPicker.value
}

const handleTriple = async () => {
  if (!requireLogin()) return
  tripleAnimating.value = true
  const ok = await videoStore.triple()
  if (ok) {
    toast.success('三连成功！')
  }
  setTimeout(() => {
    tripleAnimating.value = false
  }, 1000)
}

const handleShare = () => {
  navigator.clipboard
    .writeText(window.location.href)
    .then(() => toast.success('链接已复制'))
    .catch(() => toast.error('复制失败'))
}

const handleReport = () => {
  toast.info('举报功能即将上线')
}
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- Like -->
    <button
      class="action-btn group"
      :class="{ 'is-active': isLiked, 'is-animating': likeAnimating }"
      @click="handleLike"
    >
      <ThumbsUp class="action-icon" :class="{ 'fill-current': isLiked }" :size="20" />
      <span class="action-text">{{ formatCount(likes) || '点赞' }}</span>
    </button>

    <!-- Coin -->
    <div class="relative">
      <button
        class="action-btn group"
        :class="{ 'is-active': isCoined }"
        @click="isCoined ? null : (showCoinPicker = !showCoinPicker)"
      >
        <Coins class="action-icon" :class="{ 'fill-current': isCoined }" :size="20" />
        <span class="action-text">{{ formatCount(coinCount) || '投币' }}</span>
        <ChevronDown
          v-if="!isCoined"
          class="ml-0.5 h-3 w-3 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': showCoinPicker }"
        />
      </button>
      <!-- Coin Picker Dropdown -->
      <Transition name="fade-slide">
        <div
          v-if="showCoinPicker"
          class="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-lg border border-border bg-popover p-2 shadow-lg"
        >
          <div class="flex gap-2">
            <button class="coin-option" @click="handleCoin(1)">1币</button>
            <button class="coin-option" @click="handleCoin(2)">2币</button>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Favorite -->
    <div class="relative">
      <button
        class="action-btn group"
        :class="{ 'is-active': isFavorited }"
        @click="handleFavoriteClick"
      >
        <Star class="action-icon" :class="{ 'fill-current': isFavorited }" :size="20" />
        <span class="action-text">{{ formatCount(favoriteCount) || '收藏' }}</span>
        <ChevronDown
          class="ml-0.5 h-3 w-3 text-muted-foreground transition-transform"
          :class="{ 'rotate-180': showFolderPicker }"
        />
      </button>

      <!-- 收藏夹选择器（Dialog） -->
      <FolderPicker v-model:open="showFolderPicker" :video-id="videoStore.currentVideo?.id ?? 0" />
    </div>

    <!-- Triple -->
    <button
      class="action-btn triple-btn group"
      :class="{ 'is-animating': tripleAnimating }"
      @click="handleTriple"
    >
      <Zap class="action-icon" :size="20" />
      <span class="action-text">三连</span>
    </button>

    <div class="mx-2 h-5 w-px bg-border"></div>

    <!-- Share -->
    <button class="action-btn group" @click="handleShare">
      <Share2 class="action-icon" :size="18" />
      <span class="action-text">分享</span>
    </button>

    <!-- Report -->
    <button class="action-btn group" @click="handleReport">
      <Flag class="action-icon" :size="18" />
      <span class="action-text">举报</span>
    </button>
  </div>
</template>

<style scoped>
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  color: oklch(var(--muted-foreground) / 0.9);
  cursor: pointer;
  border: 1px solid transparent;
  background: oklch(var(--muted) / 0.3);
  white-space: nowrap;
  position: relative;
  overflow: hidden;
}

.action-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: currentcolor;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
  z-index: 0;
}

.action-btn > * {
  position: relative;
  z-index: 1;
}

.action-btn:hover {
  color: oklch(var(--foreground));
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.05);
  border-color: oklch(var(--border) / 0.5);
}

:global(.dark) .action-btn:hover {
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.2);
}

.action-btn:hover::after {
  opacity: 0.04;
}

.action-btn:active {
  transform: translateY(0) scale(0.96);
  transition-duration: 0.1s;
}

.action-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.08);
  border-color: oklch(var(--primary) / 0.2);
}

.action-btn.is-active:hover {
  background: oklch(var(--primary) / 0.12);
  box-shadow: 0 4px 12px oklch(var(--primary) / 0.15);
}

.action-icon {
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}

.action-btn:hover .action-icon {
  transform: scale(1.15) rotate(-4deg);
}

.action-btn.is-animating .action-icon {
  animation: like-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.action-text {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.triple-btn {
  color: var(--brand-pink);
  border-color: color-mix(in oklch, var(--brand-pink) 25%, transparent);
  background: color-mix(in oklch, var(--brand-pink) 8%, transparent);
}

.triple-btn:hover {
  color: white;
  border-color: transparent;
  background: linear-gradient(135deg, var(--brand-blue), var(--brand-pink));
  box-shadow: 0 6px 16px -4px color-mix(in oklch, var(--brand-pink) 50%, transparent);
}

.triple-btn:hover::after {
  opacity: 0;
}

:global(.dark) .triple-btn {
  color: var(--brand-pink);
  border-color: color-mix(in oklch, var(--brand-pink) 30%, transparent);
  background: color-mix(in oklch, var(--brand-pink) 15%, transparent);
}

:global(.dark) .triple-btn:hover {
  color: var(--bg-surface-0);
  background: linear-gradient(135deg, var(--brand-blue), var(--brand-pink));
  box-shadow: 0 6px 16px -4px color-mix(in oklch, var(--brand-pink) 30%, transparent);
}

.triple-btn.is-animating .action-icon {
  animation: triple-spin 1s cubic-bezier(0.16, 1, 0.3, 1);
  color: inherit;
}

.triple-btn.is-animating {
  color: white;
  border-color: transparent;
  background: linear-gradient(135deg, var(--brand-blue), var(--brand-pink));
  box-shadow: 0 8px 20px -4px color-mix(in oklch, var(--brand-pink) 60%, transparent);
}

:global(.dark) .triple-btn.is-animating {
  color: var(--bg-surface-0);
  background: linear-gradient(135deg, var(--brand-blue), var(--brand-pink));
  box-shadow: 0 8px 20px -4px color-mix(in oklch, var(--brand-pink) 40%, transparent);
}

.coin-option {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: oklch(var(--foreground));
  background: oklch(var(--card));
  border: 1px solid oklch(var(--border));
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.coin-option:hover {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px oklch(var(--primary) / 0.25);
}

.coin-option:active {
  transform: translateY(0) scale(0.96);
}

@keyframes like-bounce {
  0% {
    transform: scale(1);
  }

  30% {
    transform: scale(1.5) rotate(-10deg);
  }

  50% {
    transform: scale(0.8) rotate(5deg);
  }

  70% {
    transform: scale(1.2) rotate(-2deg);
  }

  100% {
    transform: scale(1) rotate(0deg);
  }
}

@keyframes triple-spin {
  0% {
    transform: scale(1) rotate(0deg);
  }

  25% {
    transform: scale(1.4) rotate(-20deg);
  }

  50% {
    transform: scale(1.5) rotate(20deg);
  }

  75% {
    transform: scale(1.1) rotate(-5deg);
  }

  100% {
    transform: scale(1) rotate(0deg);
  }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px) scale(0.95);
}
</style>
