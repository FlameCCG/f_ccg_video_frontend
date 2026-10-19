import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getHotSearchKeywords, type HotKeywordItem } from '@/api/video'

/** Shared loading contract for search discovery and the dynamic sidebar. */
export function useHotSearch() {
  const hot = ref<HotKeywordItem[]>([])
  const loading = ref(true)
  const failed = ref(false)
  let disposed = false
  let pending = false

  const refresh = async () => {
    if (pending) return
    pending = true
    loading.value = true
    failed.value = false
    try {
      const list = await getHotSearchKeywords({ silent: true })
      if (disposed) return
      const seen = new Set<string>()
      hot.value = list
        .filter((item) => {
          if (!item.keyword.trim() || seen.has(item.keyword)) return false
          seen.add(item.keyword)
          return true
        })
        .slice(0, 10)
    } catch {
      if (!disposed) failed.value = true
    } finally {
      pending = false
      if (!disposed) loading.value = false
    }
  }

  onMounted(() => void refresh())
  onBeforeUnmount(() => {
    disposed = true
  })
  return { hot, loading, failed, refresh }
}
