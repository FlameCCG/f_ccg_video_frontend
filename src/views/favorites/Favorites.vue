<script setup lang="ts">
/**
 * 收藏页：复用用户空间收藏 Tab。
 * 首页点击「收藏」或访问 /favorites 时，重定向到当前用户的收藏 Tab 页面。
 */
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

onMounted(() => {
  if (authStore.isLoggedIn && authStore.userId) {
    const query: Record<string, string> = { tab: 'favorites' }
    if (route.query.folderId && typeof route.query.folderId === 'string') {
      query.folderId = route.query.folderId
    }
    void router.replace({ path: `/user/${authStore.userId}`, query })
  } else {
    void router.replace({ name: 'home' })
  }
})
</script>

<template>
  <div class="fav-redirect">
    <p class="fav-redirect-text">正在跳转到收藏...</p>
  </div>
</template>

<style scoped>
.fav-redirect {
  min-height: 40vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-card);
}

.fav-redirect-text {
  font-size: 14px;
  color: var(--color-muted-foreground);
}
</style>
