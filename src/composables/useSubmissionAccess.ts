import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteStore } from '@/stores/site'

export const SUBMISSION_DISABLED_MESSAGE = '网站已暂停用户投稿，仅管理员可上传、发布或修改视频'

export function useSubmissionAccess() {
  const siteStore = useSiteStore()
  const authStore = useAuthStore()
  const submissionBlocked = computed(
    () => siteStore.isUserSubmissionDisabled && authStore.user?.isAdmin !== true
  )
  return { siteStore, authStore, submissionBlocked }
}
