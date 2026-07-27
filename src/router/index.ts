import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Layout components
const MainLayout = () => import('@/layouts/MainLayout.vue')
const VideoLayout = () => import('@/layouts/VideoLayout.vue')
const CreatorLayout = () => import('@/layouts/CreatorLayout.vue')
const UserLayout = () => import('@/layouts/UserLayout.vue')
const MessageLayout = () => import('@/layouts/MessageLayout.vue')

const routes: RouteRecordRaw[] = [
  // Routes with VideoLayout (compact header, no banner, no channel nav)
  {
    path: '/video/:id/:p?',
    component: VideoLayout,
    children: [
      {
        path: '',
        name: 'video-detail',
        component: () => import('@/views/video/VideoDetail.vue'),
      },
    ],
  },
  {
    path: '/search',
    component: VideoLayout,
    children: [
      {
        path: '',
        name: 'search',
        component: () => import('@/views/search/SearchResult.vue'),
      },
    ],
  },
  {
    path: '/user/:id',
    component: UserLayout,
    children: [
      {
        path: '',
        name: 'user-home',
        component: () => import('@/views/user/User.vue'),
      },
    ],
  },
  {
    path: '/settings',
    component: VideoLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'settings',
        component: () => import('@/views/settings/Settings.vue'),
      },
    ],
  },
  // Routes with MainLayout (homepage, hot, rank, etc.)
  {
    path: '/',
    component: MainLayout,
    children: [
      {
        path: '',
        name: 'home',
        component: () => import('@/views/home/Home.vue'),
      },
      {
        path: 'hot',
        name: 'hot',
        component: () => import('@/views/home/Hot.vue'),
      },
      {
        path: 'rank',
        name: 'rank',
        component: () => import('@/views/home/Rank.vue'),
      },
      {
        path: 'dynamic',
        name: 'dynamic',
        component: () => import('@/views/dynamic/Dynamic.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'partition/:id?',
        name: 'partition',
        component: () => import('@/views/partition/Partition.vue'),
      },
      {
        path: 'history',
        name: 'history',
        component: () => import('@/views/history/History.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'favorites',
        name: 'favorites',
        /**
         * 纯跳转位：收藏内容本身住在用户空间的收藏 Tab，这里只负责把入口解析过去。
         *
         * 原实现挂的是一个 Favorites.vue 中转组件，在 onMounted 里再 router.replace。
         * 代价是一次点击播两段转场：先播 MainLayout 内层的 .route-* 把「正在打开你的
         * 收藏夹…」的 spinner 淡进来，中转页转头又换掉整个 layout，再播 App.vue 的
         * 顶层布局转场。用户看到的是「首页淡出 → 一闪而过的转圈 → 整页再淡一次」，
         * 而点「消息」「创作中心」只淡一次 —— 首页点收藏手感不一样就是这么来的。
         * 从用户空间里点收藏夹更糟：UserLayout → MainLayout → UserLayout 来回换两次壳，
         * User.vue 整个重挂一遍，只为了切一个 Tab。
         *
         * 改成路由级 redirect（与本文件 /message → /message/chat、/creator → /creator/home
         * 同源）：目标在导航确认前就解析完，中转组件永不挂载，全程只播一次转场。
         *
         * 注意 redirect 记录由匹配器在 beforeEach 之前就消化掉了，全局 requiresAuth
         * 守卫看不到 /favorites，所以未登录兜底必须写在这里（行为与守卫一致：回首页）。
         */
        redirect: (to) => {
          const auth = useAuthStore()
          if (!auth.isLoggedIn || !auth.userId) return { name: 'home' }

          const query: Record<string, string> = { tab: 'favorites' }
          const folderId = Array.isArray(to.query.folderId)
            ? to.query.folderId[0]
            : to.query.folderId
          if (folderId) query.folderId = folderId

          return { path: `/user/${auth.userId}`, query }
        },
      },
    ],
  },
  // Message Center Layout
  {
    path: '/message',
    component: MessageLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/message/chat',
      },
      {
        path: 'chat',
        name: 'message-chat',
        component: () => import('@/views/message/Chat.vue'),
      },
      {
        path: 'chat/:peerId',
        name: 'message-chat-room',
        component: () => import('@/views/message/Chat.vue'),
      },
      {
        path: 'reply',
        name: 'message-reply',
        component: () => import('@/views/message/Reply.vue'),
      },
      {
        path: 'at',
        name: 'message-at',
        component: () => import('@/views/message/At.vue'),
      },
      {
        path: 'love',
        name: 'message-love',
        component: () => import('@/views/message/Love.vue'),
      },
      {
        path: 'system',
        name: 'message-system',
        component: () => import('@/views/message/System.vue'),
      },
    ],
  },
  // Creator Center Layout
  {
    path: '/creator',
    component: CreatorLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/creator/home',
      },
      {
        path: 'home',
        name: 'creator-home',
        component: () => import('@/views/creator/Home.vue'),
      },
      {
        path: 'upload',
        name: 'creator-upload',
        component: () => import('@/views/creator/Upload.vue'),
      },
      {
        path: 'content',
        name: 'creator-content',
        component: () => import('@/views/creator/Content.vue'),
      },
      {
        path: 'content/:id/edit',
        name: 'creator-content-edit',
        component: () => import('@/views/creator/EditVideo.vue'),
      },
      {
        path: 'interaction',
        name: 'creator-interaction',
        component: () => import('@/views/creator/Interaction.vue'),
      },
      {
        path: 'danmu',
        name: 'creator-danmu',
        component: () => import('@/views/creator/Danmu.vue'),
      },
    ],
  },
  // Redirect old upload route
  {
    path: '/upload',
    redirect: '/creator/upload',
  },
  // OAuth callback route
  {
    path: '/auth/qq/callback',
    name: 'qq-callback',
    component: () => import('@/views/auth/QQCallback.vue'),
    meta: { guest: true },
  },
  {
    path: '/oauth/google',
    name: 'google-callback',
    component: () => import('@/views/auth/GoogleCallback.vue'),
    meta: { guest: true },
  },
  {
    path: '/oauth/github',
    name: 'github-callback',
    component: () => import('@/views/auth/GithubCallback.vue'),
    meta: { guest: true },
  },
  {
    path: '/oauth/linuxdo',
    name: 'linuxdo-callback',
    component: () => import('@/views/auth/LinuxDoCallback.vue'),
    meta: { guest: true },
  },
  {
    path: '/oauth/x',
    name: 'x-callback',
    component: () => import('@/views/auth/XCallback.vue'),
    meta: { guest: true },
  },
  {
    path: '/auth/google/callback',
    redirect: '/oauth/google',
  },
  {
    path: '/auth/github/callback',
    redirect: '/oauth/github',
  },
  {
    path: '/auth/linuxdo/callback',
    redirect: '/oauth/linuxdo',
  },
  {
    path: '/auth/x/callback',
    redirect: '/oauth/x',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  /**
   * 置顶要等离场动画播完再做，否则用户看到的是「页面一边淡出、一边被拽回顶部」。
   * .route-leave-active 是 140ms（var(--duration-fast)），这里留 150ms 余量。
   * 返回上一页时 savedPosition 立即生效，不加延迟——恢复滚动位置越快越不突兀。
   */
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return { top: 0 }
    return new Promise((resolve) => {
      setTimeout(() => resolve({ top: 0 }), 150)
    })
  },
})

// Navigation guard for authentication
router.beforeEach((to, _from, next) => {
  const accessToken = localStorage.getItem('accessToken')
  const isAuthenticated = !!accessToken

  // Routes that require authentication - redirect to home (dialog will handle login)
  if (to.meta.requiresAuth && !isAuthenticated) {
    next({ name: 'home' })
    return
  }

  // Routes only for guests (OAuth callbacks, etc.)
  if (to.meta.guest && isAuthenticated) {
    next({ name: 'home' })
    return
  }

  next()
})

export default router
