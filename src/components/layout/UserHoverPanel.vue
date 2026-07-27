<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { User, LogOut, FileVideo, Sun, Moon } from 'lucide-vue-next'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { levelColor, formatCount } from '@/utils/format'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const isDark = computed(() => themeStore.theme === 'dark')

const navigate = (target: RouteLocationRaw) => {
  emit('close')
  void router.push(target)
}

const navigateToUserTab = (tab: 'following' | 'fans' | 'dynamic') => {
  navigate({
    path: `/user/${authStore.userId}`,
    query: { tab },
  })
}

const handleLogout = () => {
  emit('close')
  authStore.logout()
  void router.push('/')
}

const toggleTheme = () => {
  themeStore.setTheme(isDark.value ? 'light' : 'dark')
}
</script>

<template>
  <div class="user-hover-panel text-popover-foreground bg-popover">
    <!-- Big Avatar -->
    <div class="panel-avatar-wrap" @click="navigate(`/user/${authStore.userId}`)">
      <AppAvatar
        :src="authStore.user?.avatar"
        :name="authStore.user?.username"
        alt="Avatar"
        container-class="panel-avatar"
        text-class="text-2xl font-bold"
      />
    </div>

    <!-- User Info (Centered) -->
    <div class="user-info">
      <div class="username-row">
        <span class="username" @click="navigate(`/user/${authStore.userId}`)">
          {{ authStore.user?.username || '用户' }}
        </span>
      </div>
      <div class="level-row">
        <span class="level-badge" :style="{ backgroundColor: levelColor(authStore.level) }">
          LV{{ authStore.level }}
        </span>
      </div>
      <div class="coin-row">
        <div class="coin-item">
          硬币: <span class="tabular mr-3 font-medium">{{ authStore.coinCount }}</span> B币:
          <span class="tabular font-medium">0</span>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="panel-stats">
      <div class="stat-item" @click="navigateToUserTab('following')">
        <span class="stat-value tabular">{{ formatCount(authStore.user?.followCount ?? 0) }}</span>
        <span class="stat-label">关注</span>
      </div>
      <div class="stat-item" @click="navigateToUserTab('fans')">
        <span class="stat-value tabular">{{ formatCount(authStore.user?.fansCount ?? 0) }}</span>
        <span class="stat-label">粉丝</span>
      </div>
      <div class="stat-item" @click="navigateToUserTab('dynamic')">
        <span class="stat-value tabular">{{ formatCount(authStore.user?.dynamicCount ?? 0) }}</span>
        <span class="stat-label">动态</span>
      </div>
    </div>

    <!-- Menu Links -->
    <div class="panel-menu">
      <div class="menu-item" @click="navigate('/settings')">
        <User :size="18" class="text-muted-foreground mr-1" />
        <span>个人中心</span>
        <span class="ml-auto text-muted-foreground font-mono text-xs">❯</span>
      </div>
      <div class="menu-item" @click="navigate('/creator')">
        <FileVideo :size="18" class="text-muted-foreground mr-1" />
        <span>投稿管理</span>
        <span class="ml-auto text-muted-foreground font-mono text-xs">❯</span>
      </div>
    </div>

    <!-- Bottom Area -->
    <div class="panel-menu border-b-0">
      <div class="menu-item" @click="toggleTheme">
        <component :is="isDark ? Sun : Moon" :size="18" class="text-muted-foreground mr-1" />
        <span>主题: {{ isDark ? '深色' : '浅色' }}</span>
        <span class="ml-auto text-muted-foreground font-mono text-xs">❯</span>
      </div>
    </div>

    <div class="panel-menu border-b-0 border-t-0 pt-0">
      <div class="menu-item logout-item" @click="handleLogout">
        <LogOut :size="18" class="text-muted-foreground mr-1" />
        <span>退出登录</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.user-hover-panel {
  width: 300px;
  position: relative;
  background-color: var(--color-popover);
  border-radius: var(--radius-xl);
  color: var(--color-popover-foreground);
  box-shadow: var(--shadow-overlay);
  border: 1px solid var(--color-border);
  animation: panel-enter var(--duration-normal) var(--ease-out-quint) both;
}

.panel-avatar-wrap {
  position: absolute;
  top: -40px;
  left: 50%;
  margin-left: -40px;
  z-index: 20;
  cursor: pointer;
  animation: avatar-enter var(--duration-slow) var(--ease-out-expo) both;
}

:deep(.panel-avatar) {
  width: 80px !important;
  height: 80px !important;
  border-radius: 50% !important;
  border: 2px solid var(--color-popover) !important;
  background-color: var(--color-popover) !important;
  transition:
    transform var(--duration-normal) var(--ease-out-expo),
    box-shadow var(--duration-normal) var(--ease-out-expo);
}

:deep(.panel-avatar:hover) {
  transform: scale(1.05);
}

.user-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 48px;
  padding-bottom: 12px;
}

.username {
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  color: var(--color-foreground);
  transition: color var(--duration-fast) linear;

  &-row {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  &:hover {
    color: var(--color-primary);
  }
}

.level-row {
  margin-top: 4px;
}

.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 14px;
  border-radius: 2px;
  font-size: 10px;
  line-height: 1;
  font-weight: 800;
  color: var(--signal-foreground);
  letter-spacing: 0.05em;
  font-style: italic;
}

.coin-row {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-muted-foreground);
}

.panel-stats {
  display: flex;
  padding: 0 20px 16px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 6px 0;
  border-radius: var(--radius-sm, 0.375rem);
  transition: background-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    background-color: var(--color-muted);
  }
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-foreground);
}

.stat-label {
  font-size: 12px;
  color: var(--color-muted-foreground);
  margin-top: 2px;
}

.vip-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(
    90deg,
    oklch(from var(--color-accent) l c h / 0.08) 0%,
    var(--color-card) 100%
  );
  border: 1px solid oklch(from var(--color-accent) l c h / 0.2);
  border-radius: 6px;
  padding: 10px 14px;
}

:global(.dark) .vip-banner {
  background: linear-gradient(
    90deg,
    oklch(from var(--color-brand-pink) l c h / 0.14) 0%,
    oklch(from var(--color-brand-pink) l c h / 0) 100%
  );
  border-color: oklch(from var(--color-brand-pink) l c h / 0.22);
}

.vip-btn {
  background: var(--color-accent);
  color: var(--signal-foreground);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity var(--duration-fast) linear;

  &:hover {
    opacity: 0.9;
  }
}

.panel-menu {
  padding: 6px 12px;
  border-top: 1px solid var(--color-border);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear;
  color: var(--color-foreground);

  &:hover {
    background-color: var(--color-muted);
  }
}

.logout-item:hover {
  background-color: var(--color-muted);
}

@keyframes panel-enter {
  0% {
    opacity: 0;
    transform: translateY(-8px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes avatar-enter {
  0% {
    transform: translate(0, -24px) scale(0.4);
  }

  100% {
    transform: translate(0, 0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .user-hover-panel,
  .panel-avatar-wrap {
    animation: none;
  }
}
</style>
