import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { DanmuItem } from '@/api/danmu'
import { useWebSocket } from './useWebSocket'

const WS_BASE = import.meta.env.DEV
  ? `ws://${window.location.hostname}:8080/v1`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1`

export function useDanmuWebSocket(videoId: () => number, partId?: () => number | undefined) {
  const authStore = useAuthStore()
  const newDanmu = ref<DanmuItem | null>(null)

  const buildUrl = (): string | null => {
    const vid = videoId()
    if (!vid) return null
    let url = `${WS_BASE}/common/video/danmu/ws?videoId=${vid}`
    const pid = partId?.()
    if (pid !== undefined) url += `&partId=${pid}`
    if (authStore.accessToken) url += `&token=${authStore.accessToken}`
    return url
  }

  const { connected, disconnect, connect } = useWebSocket(buildUrl, {
    heartbeat: {
      message: { type: 'ping' },
      interval: 30000,
    },
    onMessage: (_, event) => {
      try {
        const data = JSON.parse(event.data as string)
        if (data.type === 'danmu' && data.data) {
          newDanmu.value = data.data as DanmuItem
        }
      } catch {
        // Ignore malformed messages
      }
    },
  })

  return {
    connected,
    newDanmu,
    disconnect,
    reconnect: connect,
  }
}
