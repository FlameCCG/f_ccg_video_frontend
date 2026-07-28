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
 * 主题切换过渡窗口。
 *
 * 切主题时只有 body 背景在过渡，卡片 / 文字 / 边框全部硬跳，整页像分两批变色。
 * 但常驻的 `*` 过渡会让之后每一次 hover / 滚动都拖尾，所以改成开一个短窗口：
 * 检测到 <html> 的 dark 类翻转时挂上 .theme-switching，动画跑完再摘掉。
 * 真正的过渡声明在 main.scss 末尾（含 prefers-reduced-motion 降级与播放器豁免）。
 *
 * 用 MutationObserver 而不是 watch(themeStore.theme)：theme === 'system' 时
 * 系统配色变化会直接改 html 的类，theme 这个 ref 并不变，watch 收不到。
 * MutationObserver 回调是微任务，在浏览器做样式重算之前执行 —— 变量新值与
 * .theme-switching 会落在同一次重算里，过渡才起得来。
 */
const THEME_TRANSITION_WINDOW = 360
let themeSwitchTimer: ReturnType<typeof setTimeout> | undefined
let themeObserver: MutationObserver | undefined

const observeThemeSwitch = () => {
  const root = document.documentElement
  let wasDark = root.classList.contains('dark')

  themeObserver = new MutationObserver(() => {
    const isDark = root.classList.contains('dark')
    if (isDark === wasDark) return
    wasDark = isDark

    root.classList.add('theme-switching')
    if (themeSwitchTimer) clearTimeout(themeSwitchTimer)
    themeSwitchTimer = setTimeout(() => {
      root.classList.remove('theme-switching')
      themeSwitchTimer = undefined
    }, THEME_TRANSITION_WINDOW)
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
  <!--
    顶层 layout 直接切换：Vue Router 会先解析 lazy component，再更新当前路由。
    因此加载 UserLayout 等分包时旧页面会继续保留；解析完成后一次性交接，
    不再经过 out-in 的全空白帧。各 layout 内部仍负责自己的内容区转场。
  -->
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
