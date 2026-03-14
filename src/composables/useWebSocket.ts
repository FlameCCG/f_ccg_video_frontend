import { ref, onBeforeUnmount, watch } from 'vue'

export interface UseWebSocketOptions {
  onMessage?: (ws: WebSocket, event: MessageEvent) => void
  onOpen?: (ws: WebSocket, event: Event) => void
  onClose?: (ws: WebSocket, event: CloseEvent) => void
  onError?: (ws: WebSocket, event: Event) => void
  heartbeat?: {
    message?: string | object | (() => string | object)
    interval?: number
  }
  reconnect?: {
    maxDelay?: number
    initialDelay?: number
  }
  immediate?: boolean
}

export function useWebSocket(
  urlBuilder: string | (() => string | null | undefined),
  options: UseWebSocketOptions = {}
) {
  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  const maxReconnectDelay = options.reconnect?.maxDelay ?? 30000
  let reconnectDelay = options.reconnect?.initialDelay ?? 1000
  let isIntentionallyClosed = false

  const getUrl = (): string | null | undefined => {
    return typeof urlBuilder === 'function' ? urlBuilder() : urlBuilder
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    const interval = options.heartbeat?.interval ?? 30000
    if (interval <= 0) return

    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        let payload: string | object = { type: 'ping' }
        if (options.heartbeat?.message) {
          payload =
            typeof options.heartbeat.message === 'function'
              ? options.heartbeat.message()
              : options.heartbeat.message
        }
        ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
      }
    }, interval)
  }

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const connect = () => {
    if (ws) disconnect(false)
    const url = getUrl()
    if (!url) return

    isIntentionallyClosed = false

    try {
      ws = new WebSocket(url)

      ws.onopen = (event) => {
        connected.value = true
        reconnectDelay = options.reconnect?.initialDelay ?? 1000
        startHeartbeat()
        options.onOpen?.(ws as WebSocket, event)
      }

      ws.onmessage = (event) => {
        options.onMessage?.(ws as WebSocket, event)
      }

      ws.onclose = (event) => {
        connected.value = false
        stopHeartbeat()
        options.onClose?.(ws as WebSocket, event)
        if (!isIntentionallyClosed) {
          scheduleReconnect()
        }
      }

      ws.onerror = (event) => {
        options.onError?.(ws as WebSocket, event)
        ws?.close()
      }
    } catch {
      if (!isIntentionallyClosed) {
        scheduleReconnect()
      }
    }
  }

  const disconnect = (intentional = true) => {
    if (intentional) {
      isIntentionallyClosed = true
    }
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
    if (reconnectTimer || isIntentionallyClosed) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay)
  }

  const send = (data: string | object) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    }
  }

  if (typeof urlBuilder === 'function') {
    watch(
      () => urlBuilder(),
      (newUrl) => {
        if (newUrl) {
          disconnect()
          connect()
        } else {
          disconnect()
        }
      },
      { immediate: options.immediate !== false }
    )
  } else if (options.immediate !== false) {
    connect()
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return {
    connected,
    ws: () => ws,
    disconnect: () => disconnect(true),
    connect,
    send,
  }
}
