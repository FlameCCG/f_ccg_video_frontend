import { useLocalStorage } from '@vueuse/core'

/**
 * 搜索历史组合式函数
 * 使用 localStorage 持久化数据
 */
export function useSearchHistory(maxItems: number = 10) {
  // 定义本地存储的 key
  const HISTORY_KEY = 'bilibili_search_history'

  // 使用 VueUse 的 useLocalStorage 自动同步 localStorage
  const history = useLocalStorage<string[]>(HISTORY_KEY, [])

  /**
   * 添加搜索记录
   * @param keyword 搜索关键词
   */
  const addHistory = (keyword: string) => {
    const kw = keyword.trim()
    if (!kw) return

    // 如果已存在，先移除旧的
    const index = history.value.indexOf(kw)
    if (index > -1) {
      history.value.splice(index, 1)
    }

    // 插入到最前面
    history.value.unshift(kw)

    // 限制最大数量
    if (history.value.length > maxItems) {
      history.value = history.value.slice(0, maxItems)
    }
  }

  /**
   * 移除一条记录
   * @param keyword 要移除的关键词
   */
  const removeHistoryItem = (keyword: string) => {
    const index = history.value.indexOf(keyword)
    if (index > -1) {
      history.value.splice(index, 1)
    }
  }

  /**
   * 清空所有历史记录
   */
  const clearHistory = () => {
    history.value = []
  }

  return {
    history,
    addHistory,
    removeHistoryItem,
    clearHistory,
  }
}
