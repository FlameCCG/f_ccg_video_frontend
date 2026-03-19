<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { User, LogOut, FileVideo, Sun, Moon } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

const isDark = computed(() => themeStore.theme === 'dark')

const levelColor = (level: number): string => {
  if (level >= 6) return '#ff6699'
  if (level >= 4) return '#ffb636'
  if (level >= 2) return '#7bcfa6'
  return '#c0c0c0'
}

const formatCount = (n: number): string => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toString()
}

const navigate = (path: string) => {
  emit('close')
  void router.push(path)
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
  <div class="user-hover-panel">
    <!-- User Header -->
    <div class="panel-header">
      <div class="avatar-area" @click="navigate(`/user/${authStore.userId}`)">
        <img
          :src="authStore.user?.avatar || '/placeholder-avatar.png'"
          alt="Avatar"
          class="panel-avatar"
        />
      </div>
      <div class="user-meta">
        <div class="username-row">
          <span class="username" @click="navigate(`/user/${authStore.userId}`)">
            {{ authStore.user?.username || '用户' }}
          </span>
          <span
            v-if="authStore.user"
            class="level-badge"
            :style="{ backgroundColor: levelColor(authStore.level) }"
          >
            Lv{{ authStore.level }}
          </span>
        </div>
        <div class="coin-row">
          <span class="coin-item">硬币: {{ authStore.coinCount }}</span>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="panel-stats">
      <div class="stat-item" @click="navigate(`/user/${authStore.userId}`)">
        <span class="stat-value">{{ formatCount(authStore.user?.followCount ?? 0) }}</span>
        <span class="stat-label">关注</span>
      </div>
      <div class="stat-item" @click="navigate(`/user/${authStore.userId}`)">
        <span class="stat-value">{{ formatCount(authStore.user?.fansCount ?? 0) }}</span>
        <span class="stat-label">粉丝</span>
      </div>
      <div class="stat-item" @click="navigate(`/user/${authStore.userId}`)">
        <span class="stat-value">{{ formatCount(authStore.user?.dynamicCount ?? 0) }}</span>
        <span class="stat-label">动态</span>
      </div>
    </div>

    <!-- Menu Links -->
    <div class="panel-menu">
      <div class="menu-item" @click="navigate('/settings')">
        <User :size="18" />
        <span>个人中心</span>
      </div>
      <div class="menu-item" @click="navigate('/creator')">
        <FileVideo :size="18" />
        <span>投稿管理</span>
      </div>
    </div>

    <!-- Bottom Area -->
    <div class="panel-bottom">
      <div class="menu-item" @click="toggleTheme">
        <component :is="isDark ? Sun : Moon" :size="18" />
        <span>主题: {{ isDark ? '深色' : '浅色' }}</span>
      </div>
      <div class="menu-item logout-item" @click="handleLogout">
        <LogOut :size="18" />
        <span>退出登录</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-hover-panel {
  width: 280px;
  border-radius: 12px;
  background: hsl(var(--popover));
  color: hsl(var(--popover-foreground));
  box-shadow:
    0 4px 6px -1px rgb(0 0 0 / 0.05),
    0 12px 40px -4px rgb(0 0 0 / 0.15);
  border: 1px solid hsl(var(--border));
  overflow: hidden;
  animation: panel-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes panel-enter {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 16px;
}

.avatar-area {
  cursor: pointer;
  flex-shrink: 0;
}

.panel-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid hsl(var(--border));
  transition:
    border-color 0.2s,
    transform 0.2s;
}

.panel-avatar:hover {
  border-color: hsl(var(--primary));
  transform: scale(1.05);
}

.user-meta {
  min-width: 0;
  flex: 1;
}

.username-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.username {
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.15s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.username:hover {
  color: hsl(var(--primary));
}

.level-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 800;
  color: white;
  letter-spacing: 0.04em;
}

.coin-row {
  margin-top: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.panel-stats {
  display: flex;
  padding: 0 20px 16px;
  gap: 0;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 8px;
  transition: background 0.15s;
}

.stat-item:hover {
  background: hsl(var(--muted));
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  color: hsl(var(--foreground));
}

.stat-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}

.panel-menu {
  padding: 4px 8px;
  border-top: 1px solid hsl(var(--border) / 0.6);
}

.panel-bottom {
  padding: 4px 8px 8px;
  border-top: 1px solid hsl(var(--border) / 0.6);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  color: hsl(var(--foreground));
}

.menu-item:hover {
  background: hsl(var(--muted));
  color: hsl(var(--primary));
}

.logout-item:hover {
  color: hsl(var(--destructive));
}
</style>
