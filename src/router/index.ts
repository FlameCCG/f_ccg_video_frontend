import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Layout components
const MainLayout = () => import('@/layouts/MainLayout.vue')
const VideoLayout = () => import('@/layouts/VideoLayout.vue')
const CreatorLayout = () => import('@/layouts/CreatorLayout.vue')

const routes: RouteRecordRaw[] = [
  // Video detail uses its own layout (no banner, no channel nav)
  {
    path: '/video/:id',
    component: VideoLayout,
    children: [
      {
        path: '',
        name: 'video-detail',
        component: () => import('@/views/video/VideoDetail.vue'),
      },
      {
        path: '/search',
        name: 'search',
        component: () => import('@/views/search/SearchResult.vue'),
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
        path: 'user/:id',
        name: 'user-home',
        component: () => import('@/views/user/User.vue'),
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/Settings.vue'),
        meta: { requiresAuth: true },
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
        component: () => import('@/views/favorites/Favorites.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/notifications/Notifications.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'chat',
        name: 'chat',
        component: () => import('@/views/chat/Chat.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'chat/:peerId',
        name: 'chat-room',
        component: () => import('@/views/chat/Chat.vue'),
        meta: { requiresAuth: true },
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
        path: 'interaction',
        name: 'creator-interaction',
        component: () => import('@/views/creator/Interaction.vue'),
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
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
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
