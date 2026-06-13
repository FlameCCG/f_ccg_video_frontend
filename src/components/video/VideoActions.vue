<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useVideoStore } from '@/stores/video'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'vue-sonner'
import { ThumbsUp, Coins, Star, Share2, Flag, ChevronDown } from 'lucide-vue-next'
import FolderPicker from './FolderPicker.vue'
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog'
import { formatCount } from '@/utils/format'

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
const showFolderPicker = ref(false)

// Custom Dialog State
const showCustomCoinDialog = ref(false)
const selectedCoins = ref<1 | 2>(2)
const alsoLikeVideo = ref(true)
const hoveredCoinOption = ref<1 | 2 | null>(null)

// Symmetrical Ray Burst for premium micro-interaction
interface Particle {
  id: number
  rot: number
  color: string
}
const likeParticles = ref<Particle[]>([])
const coinParticles = ref<Particle[]>([])
const favoriteParticles = ref<Particle[]>([])

// Charging/Long press state
const isCharging = ref(false)
const chargeProgress = ref(0)
const circumference = 2 * Math.PI * 12
const dashOffset = computed(() => {
  return circumference * (1 - chargeProgress.value / 100)
})

let chargeTimer: number | null = null
let chargeStartTimestamp = 0
const CHARGE_DURATION = 1500

const requireLogin = (): boolean => {
  if (!authStore.isLoggedIn) {
    toast.warning('请先登录')
    return false
  }
  return true
}

const handleLike = async () => {
  if (!requireLogin()) return
  const wasLiked = isLiked.value
  likeAnimating.value = true
  const ok = await videoStore.toggleLike()
  if (ok) {
    // If successfully liked from unliked state, trigger explosive particles!
    if (!wasLiked && isLiked.value) {
      createExplosion('like')
    }
  }
  setTimeout(() => {
    likeAnimating.value = false
  }, 600)
}

const confirmCoins = async () => {
  if (!requireLogin()) return
  showCustomCoinDialog.value = false
  hoveredCoinOption.value = null

  const coins = selectedCoins.value
  const ok = await videoStore.addCoin(coins)
  if (ok) {
    toast.success(`投了 ${coins} 个币`)

    if (alsoLikeVideo.value && !isLiked.value) {
      await videoStore.toggleLike()
      toast.success('点赞成功！')
    }
  }
}

const openCoinDialog = () => {
  if (isCoined.value) return
  hoveredCoinOption.value = null
  showCustomCoinDialog.value = true
}

const handleFavoriteClick = () => {
  if (!requireLogin()) return
  showFolderPicker.value = !showFolderPicker.value
}

const handleTriple = async (): Promise<boolean> => {
  if (!requireLogin()) return false
  tripleAnimating.value = true
  const ok = await videoStore.triple()
  if (ok) {
    toast.success('三连成功！')
  }
  setTimeout(() => {
    tripleAnimating.value = false
  }, 1000)
  return ok
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

// Custom particle explosion manager
const createExplosion = (action: 'like' | 'coin' | 'favorite') => {
  const targetArray =
    action === 'like' ? likeParticles : action === 'coin' ? coinParticles : favoriteParticles

  targetArray.value = []
  const count = 8
  const primaryColor = 'oklch(var(--primary))'
  const foregroundColor = 'oklch(var(--foreground))'

  const newParticles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const rot = (i / count) * 360
    const color = i % 2 === 0 ? primaryColor : foregroundColor

    newParticles.push({
      id: i,
      rot,
      color,
    })
  }

  targetArray.value = newParticles

  setTimeout(() => {
    targetArray.value = []
  }, 1000)
}

// Long press charging trigger
const startCharge = () => {
  // If already triple-actioned, do not start charging (clicking will instantly unlike)
  if (isLiked.value && isCoined.value && isFavorited.value) return

  if (!requireLogin()) return

  isCharging.value = true
  chargeProgress.value = 0
  chargeStartTimestamp = Date.now()

  if (chargeTimer) cancelAnimationFrame(chargeTimer)

  const tick = () => {
    if (!isCharging.value) return
    const elapsed = Date.now() - chargeStartTimestamp
    chargeProgress.value = Math.min(100, (elapsed / CHARGE_DURATION) * 100)

    if (chargeProgress.value >= 100) {
      void triggerTripleAction()
    } else {
      chargeTimer = requestAnimationFrame(tick)
    }
  }

  chargeTimer = requestAnimationFrame(tick)
}

const endCharge = (isLeave = false) => {
  if (!isCharging.value) return

  isCharging.value = false
  if (chargeTimer) {
    cancelAnimationFrame(chargeTimer)
    chargeTimer = null
  }

  const elapsed = Date.now() - chargeStartTimestamp
  chargeProgress.value = 0

  if (elapsed < 350 && !isLeave) {
    void handleLike()
  } else if (elapsed >= 350 && elapsed < CHARGE_DURATION && !isLeave) {
    toast.info('长按点赞可以一键三连哦~')
  }
}

let preventNextClick = false

const triggerTripleAction = async () => {
  isCharging.value = false
  if (chargeTimer) {
    cancelAnimationFrame(chargeTimer)
    chargeTimer = null
  }

  preventNextClick = true

  const wasLiked = isLiked.value
  const wasCoined = isCoined.value
  const wasFavorited = isFavorited.value

  // Perform Triple
  const ok = await handleTriple()
  if (ok) {
    // Burst particles only on newly activated items!
    if (!wasLiked) createExplosion('like')
    if (!wasCoined) createExplosion('coin')
    if (!wasFavorited) createExplosion('favorite')
  }
  chargeProgress.value = 0

  setTimeout(() => {
    preventNextClick = false
  }, 500)
}

const isTripleActive = computed(() => isLiked.value && isCoined.value && isFavorited.value)

const handleMouseDown = () => {
  if (isTripleActive.value) return
  startCharge()
}

const handleTouchStart = () => {
  if (isTripleActive.value) return
  startCharge()
}

const handleMouseUp = () => {
  if (isTripleActive.value) {
    if (isCharging.value) endCharge(false)
    return
  }
  endCharge(false)
}

const handleTouchEnd = () => {
  if (isTripleActive.value) {
    if (isCharging.value) endCharge(false)
    return
  }
  endCharge(false)
}

const handleMouseLeave = () => {
  if (isTripleActive.value) {
    if (isCharging.value) endCharge(true)
    return
  }
  endCharge(true)
}

const handleClick = (e: Event) => {
  if (preventNextClick) {
    preventNextClick = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (isTripleActive.value) {
    void handleLike()
  }
}

onUnmounted(() => {
  if (chargeTimer) cancelAnimationFrame(chargeTimer)
})
</script>

<template>
  <!-- Hidden SVG Glow Filter for premium circular loader ring -->
  <svg style="position: absolute; width: 0; height: 0">
    <defs>
      <linearGradient id="premium-glow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="oklch(var(--primary))" />
        <stop offset="100%" stop-color="oklch(var(--foreground))" />
      </linearGradient>
      <filter id="glow-filter" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.8" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  </svg>

  <div class="flex items-center gap-1">
    <!-- 1. Like Button -->
    <div class="relative flex items-center overflow-visible">
      <button
        class="action-btn group relative"
        :class="{
          'is-active': isLiked || tripleAnimating,
          'is-animating': likeAnimating,
          'scale-95': isCharging && !isLiked,
        }"
        @mousedown="handleMouseDown"
        @touchstart.passive="handleTouchStart"
        @mouseup="handleMouseUp"
        @touchend="handleTouchEnd"
        @mouseleave="handleMouseLeave"
        @click="handleClick"
      >
        <div class="relative flex items-center justify-center w-5 h-5 overflow-visible">
          <!-- Circular Progress: only shown if NOT already liked -->
          <svg
            v-if="isCharging && !isLiked"
            class="absolute w-8 h-8 rotate-[-90deg] pointer-events-none z-10 overflow-visible"
            style="transform-origin: center"
          >
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="oklch(var(--border) / 0.4)"
              stroke-width="1.5"
              fill="transparent"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="url(#premium-glow-grad)"
              stroke-width="2.5"
              fill="transparent"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
              stroke-linecap="round"
              filter="url(#glow-filter)"
              class="transition-all duration-75 ease-out"
            />
          </svg>

          <ThumbsUp
            class="action-icon relative z-0"
            :class="{
              'fill-current': isLiked || tripleAnimating,
              'scale-110': isCharging && !isLiked,
              'charging-shake': isCharging && !isLiked,
            }"
            :size="20"
          />

          <!-- Symmetrical Sonic Shockwave centered on Like Icon -->
          <div
            v-if="likeParticles.length"
            class="absolute inset-0 flex items-center justify-center pointer-events-none z-50 overflow-visible"
          >
            <div class="shockwave-glow"></div>

            <!-- Concentric Sonic Rings -->
            <div class="shockwave-ring ring-1"></div>
            <div class="shockwave-ring ring-2"></div>
            <div class="shockwave-ring ring-3"></div>

            <!-- Wave Dust Particles -->
            <div
              v-for="p in likeParticles"
              :key="p.id"
              class="shockwave-dust absolute"
              :style="{
                backgroundColor: p.color,
                '--rot': p.rot + 'deg',
              }"
            />
          </div>
        </div>
        <span class="action-text">{{ formatCount(likes, { hideZero: true }) || '点赞' }}</span>
      </button>
    </div>

    <!-- 2. Coin Button -->
    <div class="relative overflow-visible">
      <button
        class="action-btn group relative"
        :class="{
          'is-active': isCoined,
          'scale-95': isCharging && !isCoined,
        }"
        @click="isCoined ? null : openCoinDialog()"
      >
        <div class="relative flex items-center justify-center w-5 h-5 overflow-visible">
          <!-- Circular Progress: only shown if NOT already coined -->
          <svg
            v-if="isCharging && !isCoined"
            class="absolute w-8 h-8 rotate-[-90deg] pointer-events-none z-10 overflow-visible"
            style="transform-origin: center"
          >
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="oklch(var(--border) / 0.4)"
              stroke-width="1.5"
              fill="transparent"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="url(#premium-glow-grad)"
              stroke-width="2.5"
              fill="transparent"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
              stroke-linecap="round"
              filter="url(#glow-filter)"
              class="transition-all duration-75 ease-out"
            />
          </svg>

          <Coins
            class="action-icon relative z-0"
            :class="{
              'fill-current': isCoined,
              'scale-110': isCharging && !isCoined,
              'charging-shake': isCharging && !isCoined,
            }"
            :size="20"
          />

          <!-- Symmetrical Sonic Shockwave centered on Coin Icon -->
          <div
            v-if="coinParticles.length"
            class="absolute inset-0 flex items-center justify-center pointer-events-none z-50 overflow-visible"
          >
            <div class="shockwave-glow"></div>

            <!-- Concentric Sonic Rings -->
            <div class="shockwave-ring ring-1"></div>
            <div class="shockwave-ring ring-2"></div>
            <div class="shockwave-ring ring-3"></div>

            <!-- Wave Dust Particles -->
            <div
              v-for="p in coinParticles"
              :key="p.id"
              class="shockwave-dust absolute"
              :style="{
                backgroundColor: p.color,
                '--rot': p.rot + 'deg',
              }"
            />
          </div>
        </div>
        <span class="action-text">{{ formatCount(coinCount, { hideZero: true }) || '投币' }}</span>
      </button>
    </div>

    <!-- 3. Favorite Button -->
    <div class="relative overflow-visible">
      <button
        class="action-btn group relative"
        :class="{
          'is-active': isFavorited,
          'scale-95': isCharging && !isFavorited,
        }"
        @click="handleFavoriteClick"
      >
        <div class="relative flex items-center justify-center w-5 h-5 overflow-visible">
          <!-- Circular Progress: only shown if NOT already favorited -->
          <svg
            v-if="isCharging && !isFavorited"
            class="absolute w-8 h-8 rotate-[-90deg] pointer-events-none z-10 overflow-visible"
            style="transform-origin: center"
          >
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="oklch(var(--border) / 0.4)"
              stroke-width="1.5"
              fill="transparent"
            />
            <circle
              cx="16"
              cy="16"
              r="12"
              stroke="url(#premium-glow-grad)"
              stroke-width="2.5"
              fill="transparent"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashOffset"
              stroke-linecap="round"
              filter="url(#glow-filter)"
              class="transition-all duration-75 ease-out"
            />
          </svg>

          <Star
            class="action-icon relative z-0"
            :class="{
              'fill-current': isFavorited,
              'scale-110': isCharging && !isFavorited,
              'charging-shake': isCharging && !isFavorited,
            }"
            :size="20"
          />

          <!-- Symmetrical Sonic Shockwave centered on Favorite Icon -->
          <div
            v-if="favoriteParticles.length"
            class="absolute inset-0 flex items-center justify-center pointer-events-none z-50 overflow-visible"
          >
            <div class="shockwave-glow"></div>

            <!-- Concentric Sonic Rings -->
            <div class="shockwave-ring ring-1"></div>
            <div class="shockwave-ring ring-2"></div>
            <div class="shockwave-ring ring-3"></div>

            <!-- Wave Dust Particles -->
            <div
              v-for="p in favoriteParticles"
              :key="p.id"
              class="shockwave-dust absolute"
              :style="{
                backgroundColor: p.color,
                '--rot': p.rot + 'deg',
              }"
            />
          </div>
        </div>
        <span class="action-text">{{
          formatCount(favoriteCount, { hideZero: true }) || '收藏'
        }}</span>
        <ChevronDown
          class="ml-0.5 h-3 w-3 text-muted-foreground transition-transform relative z-0"
          :class="{ 'rotate-180': showFolderPicker }"
        />
      </button>

      <FolderPicker v-model:open="showFolderPicker" :video-id="videoStore.currentVideo?.id ?? 0" />
    </div>

    <div class="mx-2 h-5 w-px bg-border"></div>

    <button class="action-btn group" @click="handleShare">
      <Share2 class="action-icon" :size="18" />
      <span class="action-text">分享</span>
    </button>

    <button class="action-btn group" @click="handleReport">
      <Flag class="action-icon" :size="18" />
      <span class="action-text">举报</span>
    </button>
  </div>

  <Dialog v-model:open="showCustomCoinDialog">
    <DialogContent class="coin-dialog-content">
      <DialogHeader class="coin-dialog-header">
        <DialogTitle class="coin-dialog-title">
          给UP主投上
          <span
            class="coin-count-highlight text-primary font-bold text-2xl mx-1 transition-all duration-300"
            >{{ selectedCoins }}</span
          >
          枚硬币
        </DialogTitle>
      </DialogHeader>

      <div class="coin-card-container">
        <div
          class="coin-card group/card"
          :class="{ 'is-selected': selectedCoins === 1 }"
          @click="selectedCoins = 1"
          @mouseenter="hoveredCoinOption = 1"
          @mouseleave="hoveredCoinOption = null"
        >
          <span class="coin-card-label">1硬币</span>
          <div class="sprite-container">
            <div
              class="coin-sprite ani-1"
              :class="{ 'is-playing': hoveredCoinOption === 1 || selectedCoins === 1 }"
            ></div>
          </div>
        </div>

        <div
          class="coin-card group/card"
          :class="{ 'is-selected': selectedCoins === 2 }"
          @click="selectedCoins = 2"
          @mouseenter="hoveredCoinOption = 2"
          @mouseleave="hoveredCoinOption = null"
        >
          <span class="coin-card-label">2硬币</span>
          <div class="sprite-container">
            <div
              class="coin-sprite ani-2"
              :class="{ 'is-playing': hoveredCoinOption === 2 || selectedCoins === 2 }"
            ></div>
          </div>
        </div>
      </div>

      <div class="coin-checkbox-row">
        <label class="custom-checkbox-label">
          <input v-model="alsoLikeVideo" type="checkbox" class="custom-checkbox" />
          <span>同时点赞内容</span>
        </label>
      </div>

      <div class="coin-dialog-footer">
        <button class="coin-submit-btn" @click="confirmCoins">确定</button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 9999px;
  transition:
    color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.3s cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  color: oklch(var(--muted-foreground) / 0.9);
  cursor: pointer;
  border: 1px solid transparent;
  background: oklch(var(--muted) / 0.3);
  white-space: nowrap;
  position: relative;
  overflow: visible;
  user-select: none;
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
  border-radius: inherit;
}

.action-btn > * {
  position: relative;
  z-index: 1;
}

.action-btn:hover {
  color: oklch(var(--foreground));
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.06);
  border-color: oklch(var(--border) / 0.6);
}

:global(.dark) .action-btn:hover {
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
}

.action-btn:hover::after {
  opacity: 0.04;
}

.action-btn:active {
  transform: translateY(-1px) scale(0.97);
  transition-duration: 0.08s;
}

.action-btn.is-active {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.08);
  border-color: oklch(var(--primary) / 0.2);
}

.action-btn.is-active:hover {
  color: var(--color-primary);
  background: oklch(var(--primary) / 0.12);
  border-color: oklch(var(--primary) / 0.35);
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 6px 20px oklch(var(--primary) / 0.18);
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

.charging-shake {
  animation: charge-shake 0.1s infinite alternate;
}

@keyframes charge-shake {
  0% {
    transform: scale(1.1) translate(0.5px, 0.5px) rotate(0.5deg);
  }

  100% {
    transform: scale(1.1) translate(-0.5px, -0.5px) rotate(-0.5deg);
  }
}

/* Volumetric Radial Glow Wave */
.shockwave-glow {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    oklch(var(--primary) / 0.35) 0%,
    oklch(var(--primary) / 0.15) 50%,
    transparent 75%
  );
  animation: glow-wave 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  pointer-events: none;
  z-index: 38;
}

@keyframes glow-wave {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }

  100% {
    transform: scale(4.5);
    opacity: 0;
  }
}

/* Concentric Sonic Rings */
.shockwave-ring {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 40;
}

.shockwave-ring.ring-1 {
  border: 1px solid oklch(var(--primary) / 0.7);
  animation: sonic-wave-1 0.48s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.shockwave-ring.ring-2 {
  border: 1px dashed oklch(var(--foreground) / 0.4);
  animation: sonic-wave-2 0.52s cubic-bezier(0.16, 1, 0.3, 1) 0.05s forwards;
}

.shockwave-ring.ring-3 {
  border: 1.5px solid oklch(var(--primary) / 0.3);
  animation: sonic-wave-3 0.56s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards;
}

@keyframes sonic-wave-1 {
  0% {
    transform: scale(0.6);
    opacity: 0.9;
  }

  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}

@keyframes sonic-wave-2 {
  0% {
    transform: scale(0.5);
    opacity: 0.8;
  }

  100% {
    transform: scale(2.2);
    opacity: 0;
  }
}

@keyframes sonic-wave-3 {
  0% {
    transform: scale(0.4);
    opacity: 0.7;
  }

  100% {
    transform: scale(1.7);
    opacity: 0;
  }
}

/* Wave Dust Particles pushed along the crest */
.shockwave-dust {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  pointer-events: none;
  will-change: transform, opacity;
  animation: dust-push 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes dust-push {
  0% {
    transform: translate(-50%, -50%) rotate(var(--rot)) translateY(-6px) scale(0.2);
    opacity: 0.9;
  }

  50% {
    opacity: 0.8;
  }

  100% {
    transform: translate(-50%, -50%) rotate(var(--rot)) translateY(22px) scale(1);
    opacity: 0;
  }
}

.coin-dialog-content {
  max-width: 400px !important;
  padding: 0;
  gap: 0;
  overflow: hidden;
  border-radius: 16px !important;
  background-color: oklch(var(--card)) !important;
  border: 1px solid oklch(var(--border)) !important;
}

.coin-dialog-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid oklch(var(--border) / 0.5);
}

.coin-dialog-title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: oklch(var(--foreground));
}

.coin-count-highlight {
  color: oklch(var(--foreground));
  font-weight: 700;
}

.coin-card-container {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 28px 24px;
}

.coin-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 140px;
  height: 210px;
  padding: 16px 12px 12px;
  border-radius: 12px;
  cursor: pointer;
  position: relative;
  background: oklch(var(--muted) / 0.15);
  border: 2px dashed oklch(var(--border));
  transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  user-select: none;
}

.coin-card:hover {
  border-color: oklch(var(--foreground) / 0.4);
  background: oklch(var(--muted) / 0.3);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px oklch(0% 0 0deg / 0.04);
}

:global(.dark) .coin-card:hover {
  box-shadow: 0 8px 24px oklch(0% 0 0deg / 0.25);
}

.coin-card.is-selected {
  border-style: solid;
  border-color: oklch(var(--foreground));
  background: oklch(var(--foreground) / 0.03);
  transform: translateY(-4px);
  box-shadow: 0 10px 28px oklch(0% 0 0deg / 0.06);
}

:global(.dark) .coin-card.is-selected {
  background: oklch(var(--foreground) / 0.06);
  box-shadow: 0 10px 28px oklch(0% 0 0deg / 0.35);
}

.coin-card-label {
  font-size: 13px;
  font-weight: 600;
  color: oklch(var(--muted-foreground));
  transition: color 0.2s ease;
  margin-bottom: 4px;
}

.coin-card:hover .coin-card-label,
.coin-card.is-selected .coin-card-label {
  color: oklch(var(--foreground));
}

.sprite-container {
  position: relative;
  width: 93.5px;
  height: 150px;
  overflow: hidden;
}

.coin-sprite {
  width: 93.5px;
  height: 150px;

  /* 24 frames × 100% = 2400% background size width */
  background-size: 2400% 100%;
  background-repeat: no-repeat;
  background-position: 0% 0%;
  contain: paint;
  transition: none !important;
}

.coin-sprite.ani-1 {
  background-image: url('/1-coin-ani.png');
}

.coin-sprite.ani-2 {
  background-image: url('/2-coin-ani.png');
}

.coin-sprite.is-playing {
  animation: play-coin-sprite 1.2s steps(24) infinite;
}

@keyframes play-coin-sprite {
  from {
    background-position: 0 0;
  }

  to {
    background-position: -2244px 0; /* Exact 24 frames * 93.5px = 2244px */
  }
}

@media (prefers-reduced-motion: reduce) {
  .coin-sprite.is-playing {
    animation: none;
    background-position: 0 0;
  }
}

.coin-checkbox-row {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 4px 0 12px;
}

.custom-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  font-weight: 500;
  color: oklch(var(--muted-foreground));
  transition: color 0.2s ease;
}

.custom-checkbox-label:hover {
  color: oklch(var(--foreground));
}

.custom-checkbox {
  appearance: none;
  width: 16px;
  height: 16px;
  border: 2px solid oklch(var(--border));
  border-radius: 4px;
  outline: none;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  background: transparent;
}

.custom-checkbox:checked {
  background-color: oklch(var(--foreground));
  border-color: oklch(var(--foreground));
}

.custom-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid oklch(var(--background));
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.coin-dialog-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 24px 28px;
}

.coin-submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 40px;
  border-radius: 8px;
  background-color: oklch(var(--foreground));
  color: oklch(var(--background));
  font-weight: 600;
  font-size: 14px;
  border: none;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.coin-submit-btn:hover {
  opacity: 0.9;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px oklch(0% 0 0deg / 0.12);
}

:global(.dark) .coin-submit-btn:hover {
  box-shadow: 0 6px 20px oklch(0% 0 0deg / 0.4);
}

.coin-submit-btn:active {
  transform: translateY(0);
}
</style>
