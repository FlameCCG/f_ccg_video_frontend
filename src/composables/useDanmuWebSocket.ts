import { ref, onBeforeUnmount, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { DanmuItem } from '@/api/danmu'

const WS_BASE = import.meta.env.DEV
  ? `ws://${window.location.hostname}:8080/v1`
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1`

export function useDanmuWebSocket(videoId: () => number, partId?: () => number | undefined) {
  const authStore = useAuthStore()
  const connected = ref(false)
  const newDanmu = ref<DanmuItem | null>(null)

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  const MAX_RECONNECT_DELAY = 30000
  let reconnectDelay = 1000

  const buildUrl = (): string => {
    let url = `${WS_BASE}/common/video/danmu/ws?videoId=${videoId()}`
    const pid = partId?.()
    if (pid !== undefined) url += `&partId=${pid}`
    if (authStore.accessToken) url += `&token=${authStore.accessToken}`
    return url
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)
  }

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const connect = () => {
    if (ws) disconnect()
    if (!videoId()) return

    try {
      ws = new WebSocket(buildUrl())

      ws.onopen = () => {
        connected.value = true
        reconnectDelay = 1000
        startHeartbeat()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'danmu' && data.data) {
            newDanmu.value = data.data as DanmuItem
          }
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        connected.value = false
        stopHeartbeat()
        scheduleReconnect()
      }

      ws.onerror = () => {
        ws?.close()
      }
    } catch {
      scheduleReconnect()
    }
  }

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    stopHeartbeat()
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.close()
      ws = null
    }
    connected.value = false
  }

  const scheduleReconnect = () => {
    if (reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  watch(
    () => videoId(),
    (id) => {
      if (id) {
        disconnect()
        connect()
      } else {
        disconnect()
      }
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    connected,
    newDanmu,
    disconnect,
    reconnect: connect,
  }
}
