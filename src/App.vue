<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Toaster } from '@/components/ui/sonner'
import { Toaster as ToastToaster } from '@/components/ui/toast'
import InitialRouteView from '@/components/common/InitialRouteView.vue'
import { getAccessToken } from '@/api/request'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import { initLive2d } from '@/utils/live2d'

const AuthDialog = defineAsyncComponent(() => import('@/components/auth/AuthDialog.vue'))
const AiChatDialog = defineAsyncComponent(() => import('@/components/ai/AiChatDialog.vue'))

const authStore = useAuthStore()
const notificationStore = useNotificationStore()
const siteStore = useSiteStore()
useThemeStore()
const showAuthDialog = ref(false)
const showChatDialog = ref(false)
/** 首次打开后再保持挂载，避免每次重载 marked/hljs 大包 */
const chatDialogMounted = ref(false)

/** 清登录态相关 UI（头像、未读角标等） */
const syncLoggedOutUi = () => {
  authStore.clearAuth()
  notificationStore.clearAllCounts()
}

/**
 * token 过期：同步清掉 Pinia 登录态（头像、用户名等），再打开登录框。
 * 仅 clearTokens 不够——Navbar 看的是 authStore.isLoggedIn / user。
 */
const handleSessionExpired = (event?: Event) => {
  const wasLoggedIn = authStore.isLoggedIn || !!authStore.user
  if (wasLoggedIn) {
    // clearAuth 无「已退出登录」toast，避免与过期提示重复
    syncLoggedOutUi()
    const detail = (event as CustomEvent<{ message?: string }> | undefined)?.detail
    toast.error(detail?.message || '登录已过期，请重新登录')
  }
  showAuthDialog.value = true
}

/** 业务要求登录（如 OAuth 回跳）：只弹登录框，不误报「登录已过期」 */
const handleLoginRequired = () => {
  // 若 localStorage token 已空但 Pinia 仍有登录态，补齐清理（头像等）
  if (!getAccessToken() && (authStore.isLoggedIn || authStore.user)) {
    syncLoggedOutUi()
  }
  showAuthDialog.value = true
}

const handleOpenChat = () => {
  chatDialogMounted.value = true
  showChatDialog.value = true
}

const handleChatOpenChange = (open: boolean) => {
  showChatDialog.value = open
  if (open) chatDialogMounted.value = true
}

/**
 * 主题切换使用短时过渡窗口。
 * 检测 html.dark 类变化时挂载 theme-switching，动画结束后移除，避免常驻通配过渡影响 hover 与滚动。
 * 手机端优先使用 theme-revealing 快照扩散，桌面及不支持快照的浏览器使用颜色渐变。
 * 过渡规则位于 main.scss，并处理 reduced-motion 与播放器豁免。
 * MutationObserver 可同时捕获手动和系统配色变化；回调在样式重算前执行，使变量更新与窗口标记同时生效。
 */
const THEME_TRANSITION_WINDOW = 360
const MOBILE_THEME_TRANSITION_WINDOW = 680
let themeSwitchTimer: ReturnType<typeof setTimeout> | undefined
let themeObserver: MutationObserver | undefined

const observeThemeSwitch = () => {
  const root = document.documentElement
  let wasDark = root.classList.contains('dark')

  themeObserver = new MutationObserver(() => {
    const isDark = root.classList.contains('dark')
    if (isDark === wasDark) return
    wasDark = isDark

    // 手机端由整页快照扩散接管；颜色补间会使新快照捕获到半亮半暗的状态。
    if (root.classList.contains('theme-revealing')) {
      if (themeSwitchTimer) clearTimeout(themeSwitchTimer)
      themeSwitchTimer = undefined
      root.classList.remove('theme-switching')
      return
    }

    root.classList.add('theme-switching')
    if (themeSwitchTimer) clearTimeout(themeSwitchTimer)
    const transitionWindow = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
      ? MOBILE_THEME_TRANSITION_WINDOW
      : THEME_TRANSITION_WINDOW
    themeSwitchTimer = setTimeout(() => {
      root.classList.remove('theme-switching')
      themeSwitchTimer = undefined
    }, transitionWindow)
  })

  themeObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
}

onMounted(() => {
  void authStore.initAuth()
  // 预拉站点配置，登录 Dialog 首次打开即可展示完整 OAuth 开关
  void siteStore.fetchConfig()
  window.addEventListener('auth:session-expired', handleSessionExpired as EventListener)
  window.addEventListener('auth:login-required', handleLoginRequired as EventListener)
  window.addEventListener('oml2d:open-chat', handleOpenChat)
  observeThemeSwitch()
  initLive2d()
})

onUnmounted(() => {
  window.removeEventListener('auth:session-expired', handleSessionExpired as EventListener)
  window.removeEventListener('auth:login-required', handleLoginRequired as EventListener)
  window.removeEventListener('oml2d:open-chat', handleOpenChat)
  themeObserver?.disconnect()
  themeObserver = undefined
  if (themeSwitchTimer) clearTimeout(themeSwitchTimer)
  document.documentElement.classList.remove('theme-switching')
})
</script>

<template>
  <!-- 顶层 layout 直接交接。Vue Router 先解析异步组件再更新当前路由，分包加载期间保留当前页面，解析完成后一次切换。各 layout 管理自己的内容区转场。 -->
  <InitialRouteView />

  <AuthDialog v-if="showAuthDialog" :open="showAuthDialog" @update:open="showAuthDialog = $event" />

  <AiChatDialog
    v-if="chatDialogMounted"
    :open="showChatDialog"
    @update:open="handleChatOpenChange"
  />

  <Toaster position="top-center" :duration="3000" rich-colors style="--normal-z: 999999" />
  <ToastToaster />
</template>
