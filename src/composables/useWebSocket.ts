import { ref, onBeforeUnmount, watch } from 'vue'
import { ensureAccessToken, refreshAccessToken } from '@/utils/authSession'

export interface UseWebSocketOptions {
  auth?: 'required' | 'optional'
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
  let generation = 0

  const getUrl = (): string | null | undefined => {
    return typeof urlBuilder === 'function' ? urlBuilder() : urlBuilder
  }

  const startHeartbeat = (connection: WebSocket) => {
    stopHeartbeat()
    const interval = options.heartbeat?.interval ?? 30000
    if (interval <= 0) return

    heartbeatTimer = setInterval(() => {
      void (async () => {
        // 浏览器定时器恢复或长时间停留后，先续期；Token 改变会由 URL watch 重连。
        if (options.auth) await ensureAccessToken()
        if (ws !== connection || connection.readyState !== WebSocket.OPEN) return
        let payload: string | object = { type: 'ping' }
        if (options.heartbeat?.message) {
          payload =
            typeof options.heartbeat.message === 'function'
              ? options.heartbeat.message()
              : options.heartbeat.message
        }
        connection.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
      })().catch(() => {
        if (ws === connection) {
          disconnect(false)
          scheduleReconnect()
        }
      })
    }, interval)
  }

  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  const connect = async () => {
    disconnect(false)
    isIntentionallyClosed = false
    const attempt = generation

    try {
      const token = options.auth ? await ensureAccessToken() : null
      if (attempt !== generation || isIntentionallyClosed) return
      if (options.auth === 'required' && !token) return
      const url = getUrl()
      if (!url) return
      const connection = new WebSocket(url)
      ws = connection

      connection.onopen = (event) => {
        connected.value = true
        reconnectDelay = options.reconnect?.initialDelay ?? 1000
        startHeartbeat(connection)
        options.onOpen?.(connection, event)
      }

      connection.onmessage = (event) => {
        if (options.auth && token) {
          try {
            const message = JSON.parse(String(event.data)) as { type?: string; system?: string }
            if (
              message.type === 'system' &&
              message.system === 'session expired, please sign in again'
            ) {
              void recoverAuthentication(connection, token)
              // 仍通知业务层撤销本次失败的乐观消息；业务消息不会自动重发。
            }
          } catch {
            /* 非 JSON 消息继续交给业务处理 */
          }
        }
        options.onMessage?.(connection, event)
      }

      connection.onclose = (event) => {
        connected.value = false
        stopHeartbeat()
        options.onClose?.(connection, event)
        if (!isIntentionallyClosed) {
          if (event.code === 1008 && options.auth && token) {
            void recoverAuthentication(connection, token)
          } else {
            scheduleReconnect()
          }
        }
      }

      connection.onerror = (event) => {
        options.onError?.(connection, event)
        connection.close()
      }
    } catch {
      if (attempt === generation && !isIntentionallyClosed) {
        scheduleReconnect()
      }
    }
  }

  const disconnect = (intentional = true) => {
    generation++
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

  const recoverAuthentication = async (connection: WebSocket, token: string) => {
    if (ws !== connection) return
    disconnect(false)
    const attempt = generation
    try {
      await refreshAccessToken(token)
    } catch {
      /* RT 失效由会话模块清理；临时故障仍按退避策略重试。 */
    }
    if (attempt === generation && !isIntentionallyClosed) scheduleReconnect()
  }

  const scheduleReconnect = () => {
    if (reconnectTimer || isIntentionallyClosed) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
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
          void connect()
        } else {
          disconnect()
        }
      },
      { immediate: options.immediate !== false }
    )
  } else if (options.immediate !== false) {
    void connect()
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
