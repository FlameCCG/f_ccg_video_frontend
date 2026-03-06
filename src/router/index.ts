import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// Layout component
const MainLayout = () => import('@/layouts/MainLayout.vue')

const routes: RouteRecordRaw[] = [
  // Routes with MainLayout
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
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'search',
        name: 'search',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
      },
      {
        path: 'partition',
        name: 'partition',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
      },
      {
        path: 'video/:id',
        name: 'video-detail',
        component: () => import('@/views/video/VideoDetail.vue'),
      },
      {
        path: 'upload',
        name: 'upload',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'user/:id',
        name: 'user-home',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'history',
        name: 'history',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'favorites',
        name: 'favorites',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'chat',
        name: 'chat',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'chat/:peerId',
        name: 'chat-room',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
      {
        path: 'creator',
        name: 'creator',
        component: () => import('@/views/Home.vue'), // Placeholder - will be replaced
        meta: { requiresAuth: true },
      },
    ],
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
