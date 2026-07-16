/**
 * 流式输出缓冲：把高频 SSE chunk 合并成低频 UI 刷新，避免每 token 触发 Vue 响应式 + 重渲染。
 */

export type StreamFlushPayload = {
  msgId: string
  content: string
  reasoning: string
  contentChanged: boolean
  reasoningChanged: boolean
  final: boolean
}

export type StreamBufferOptions = {
  /** UI 刷新最小间隔（ms），默认 80 */
  flushIntervalMs?: number
  onFlush: (payload: StreamFlushPayload) => void
}

export const createStreamBuffer = (options: StreamBufferOptions) => {
  const flushIntervalMs = options.flushIntervalMs ?? 80

  let msgId: string | null = null
  let content = ''
  let reasoning = ''
  let contentDirty = false
  let reasoningDirty = false
  let timer: number | null = null
  let disposed = false

  const clearTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  const flush = (final = false) => {
    if (disposed || !msgId) return
    if (!contentDirty && !reasoningDirty && !final) return

    const payload: StreamFlushPayload = {
      msgId,
      content,
      reasoning,
      contentChanged: contentDirty || final,
      reasoningChanged: reasoningDirty || final,
      final,
    }

    contentDirty = false
    reasoningDirty = false
    clearTimer()
    options.onFlush(payload)
  }

  const schedule = () => {
    if (disposed || timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      flush(false)
    }, flushIntervalMs)
  }

  return {
    start(id: string) {
      msgId = id
      content = ''
      reasoning = ''
      contentDirty = false
      reasoningDirty = false
      clearTimer()
    },

    appendContent(chunk: string) {
      if (!msgId || !chunk) return
      content += chunk
      contentDirty = true
      schedule()
    },

    appendReasoning(chunk: string) {
      if (!msgId || !chunk) return
      reasoning += chunk
      reasoningDirty = true
      schedule()
    },

    /** 强制立刻刷到 UI（完成 / 错误时） */
    flushFinal() {
      flush(true)
    },

    getSnapshot() {
      return { msgId, content, reasoning }
    },

    dispose() {
      disposed = true
      clearTimer()
      msgId = null
      content = ''
      reasoning = ''
    },
  }
}

export type StreamBuffer = ReturnType<typeof createStreamBuffer>
