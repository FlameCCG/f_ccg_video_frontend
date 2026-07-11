import request, { getAccessToken } from './request'

/** 后端统一响应：HTTP 常为 200，业务成败看 code（0 成功 / 1 失败） */
interface AiBusinessResponse {
  code?: number
  msg?: string
  data?: unknown
}

const DEFAULT_AI_ERROR = 'AI 服务暂时不可用，请稍后重试'

/** 将后端技术错误转成对用户更友好的提示 */
export const formatAiErrorMessage = (msg: unknown, fallback = DEFAULT_AI_ERROR): string => {
  const text = typeof msg === 'string' ? msg.trim() : ''
  if (!text) return fallback

  if (/api\s*key|未配置|未初始化/i.test(text)) {
    return 'AI 服务暂未配置（缺少 API Key），请联系管理员完成配置后重试'
  }

  return text
}

const normalizeErrorMessage = (msg: unknown, fallback = DEFAULT_AI_ERROR): string => {
  return formatAiErrorMessage(msg, fallback)
}

/** 从失败响应中尽量解析可读错误文案（JSON 业务错误 / 纯文本） */
const readResponseErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `请求失败（HTTP ${response.status}）`
  try {
    const text = await response.text()
    if (!text.trim()) return fallback

    try {
      const body = JSON.parse(text) as AiBusinessResponse
      return normalizeErrorMessage(body.msg, fallback)
    } catch {
      // 非 JSON：截断过长文本，避免把整页 HTML 塞进 UI
      return text.trim().slice(0, 200) || fallback
    }
  } catch {
    return fallback
  }
}

/**
 * 判断响应是否为业务 JSON（而非 SSE 流）。
 * 后端失败时走 res.FailWithMsg → application/json + code !== 0。
 */
const isJsonContentType = (contentType: string | null): boolean => {
  if (!contentType) return false
  return contentType.toLowerCase().includes('application/json')
}

const parseBusinessJsonError = (body: AiBusinessResponse): Error | null => {
  if (body && typeof body === 'object' && typeof body.code === 'number' && body.code !== 0) {
    return new Error(normalizeErrorMessage(body.msg))
  }
  return null
}

export const fetchAiChatStream = async (
  payload: Record<string, unknown>,
  onChunk: (text: string) => void,
  onReasoningChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void
) => {
  let completed = false
  let receivedDelta = false

  const safeComplete = () => {
    if (completed) return
    completed = true
    onComplete()
  }

  try {
    const token = getAccessToken()
    const response = await fetch('/v1/common/ai/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(payload),
    })

    // HTTP 层失败（非本项目常见路径，但需兜底）
    if (!response.ok) {
      throw new Error(await readResponseErrorMessage(response))
    }

    // 业务失败：HTTP 200 + application/json + code !== 0（如 API Key 未配置）
    // 若不处理，流式读取会静默结束，前端 isLoading 一直为 true
    if (isJsonContentType(response.headers.get('content-type'))) {
      let body: AiBusinessResponse
      try {
        body = (await response.json()) as AiBusinessResponse
      } catch {
        throw new Error(DEFAULT_AI_ERROR)
      }

      const bizErr = parseBusinessJsonError(body)
      if (bizErr) throw bizErr

      // 意外的 JSON 成功体：不是 SSE，无法展示流式内容
      throw new Error(normalizeErrorMessage(body.msg, 'AI 响应格式异常，请稍后重试'))
    }

    if (!response.body) {
      throw new Error('AI 响应为空，请稍后重试')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    const handleDataPayload = (dataStr: string) => {
      if (dataStr === '[DONE]') {
        safeComplete()
        return
      }

      let dataObj: Record<string, unknown> & AiBusinessResponse
      try {
        dataObj = JSON.parse(dataStr) as Record<string, unknown> & AiBusinessResponse
      } catch {
        // 半包 / 非 JSON：忽略，等后续完整行
        return
      }

      // 部分上游会在 SSE data 里塞业务错误 JSON
      const bizErr = parseBusinessJsonError(dataObj)
      if (bizErr) throw bizErr

      if (dataObj.type === 'response.output_text.delta' && dataObj.delta) {
        receivedDelta = true
        onChunk(String(dataObj.delta))
        return
      }

      if (dataObj.type === 'response.reasoning_summary_text.delta' && dataObj.delta) {
        receivedDelta = true
        onReasoningChunk(String(dataObj.delta))
        return
      }

      if (dataObj.type === 'response.completed' || dataObj.type === 'response.done') {
        safeComplete()
        return
      }

      if (dataObj.type === 'error' || dataObj.type === 'response.failed') {
        const errMsg =
          (typeof dataObj.message === 'string' && dataObj.message) ||
          (typeof dataObj.msg === 'string' && dataObj.msg) ||
          DEFAULT_AI_ERROR
        throw new Error(errMsg)
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim() === '') continue
        if (line.startsWith('data: ')) {
          handleDataPayload(line.slice(6))
        }
      }
    }

    // final buffer check
    if (buffer.trim()) {
      const line = buffer.trim()
      if (line.startsWith('data: ')) {
        handleDataPayload(line.slice(6))
      } else if (line.startsWith('{')) {
        // 偶发：整段 JSON 错误体被当成 stream 读完（content-type 未标明 json）
        try {
          const body = JSON.parse(line) as AiBusinessResponse
          const bizErr = parseBusinessJsonError(body)
          if (bizErr) throw bizErr
        } catch (err) {
          if (err instanceof Error && !(err instanceof SyntaxError)) throw err
        }
      }
    }

    // 流正常结束但没有任何内容：按失败处理，避免前端一直转圈
    if (!completed && !receivedDelta) {
      throw new Error(DEFAULT_AI_ERROR)
    }

    // 有内容但未收到 completed 事件：仍收尾，避免 isLoading 卡住
    safeComplete()
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export interface AiImageGenParams {
  prompt: string
  model?: string
  n?: number
  aspect_ratio?: string
  resolution?: string
  size?: string
}

export const aiGenerateImage = (data: AiImageGenParams) => {
  return request.post('/common/ai/images/generations', data, { timeout: 120000 })
}

export interface AiImageEditParams {
  prompt: string
  image?: { url: string; type?: 'image_url' }
  images?: Array<{ url: string; type?: 'image_url' }>
  model?: string
  n?: number
  aspect_ratio?: string
  resolution?: string
  size?: string
}

export const aiEditImage = (data: AiImageEditParams) => {
  return request.post('/common/ai/images/edits', data, { timeout: 120000 })
}

export interface AiVideoGenParams {
  prompt: string
  model?: string
  duration?: number
  aspect_ratio?: string
  resolution?: string
  image?: { url: string; type?: 'image_url' }
  reference_images?: Array<{ url: string; type?: 'image_url' }>
  generate_audio?: boolean
  watermark?: boolean
}

export const aiGenerateVideo = (data: AiVideoGenParams) => {
  return request.post('/common/ai/videos/generations', data, { timeout: 120000 })
}

export const aiGetVideoStatus = (requestId: string) => {
  return request.get(`/common/ai/videos/${requestId}`)
}

const AI_PROXY_PATHS = new Set([
  '/v1/common/ai/assets',
  '/common/ai/assets',
  '/v1/common/xai/assets',
  '/common/xai/assets',
])

const getUrlParseBase = () => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }
  return 'http://localhost'
}

const normalizeLocalAIAssetPath = (url: string) => {
  if (url.startsWith('/v1/common/ai/assets')) {
    return url
  }

  if (url.startsWith('/v1/common/xai/assets')) {
    return url.replace('/v1/common/xai/assets', '/v1/common/ai/assets')
  }

  if (url.startsWith('/common/ai/assets')) {
    return `/v1${url}`
  }

  if (url.startsWith('/common/xai/assets')) {
    return `/v1${url.replace('/common/xai/assets', '/common/ai/assets')}`
  }

  const withoutDotPrefix = url.replace(/^(?:\.\/)+/, '')
  if (withoutDotPrefix.startsWith('v1/common/ai/assets')) {
    return `/${withoutDotPrefix}`
  }

  if (withoutDotPrefix.startsWith('v1/common/xai/assets')) {
    return `/${withoutDotPrefix.replace('v1/common/xai/assets', 'v1/common/ai/assets')}`
  }

  if (withoutDotPrefix.startsWith('common/ai/assets')) {
    return `/v1/${withoutDotPrefix}`
  }

  if (withoutDotPrefix.startsWith('common/xai/assets')) {
    return `/v1/${withoutDotPrefix.replace('common/xai/assets', 'common/ai/assets')}`
  }

  return ''
}

const isRemoteAiAssetHost = (host: string) => {
  const normalized = host.toLowerCase()
  if (normalized === 'imgen.x.ai' || normalized === 'vidgen.x.ai') {
    return true
  }
  return ['.volces.com', '.volcengine.com', '.byteimg.com', '.bytedance.com'].some(
    (suffix) => normalized.endsWith(suffix) || normalized === suffix.slice(1)
  )
}

export const resolveAiAssetUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:')) {
    return trimmed
  }

  const normalizedLocalPath = normalizeLocalAIAssetPath(trimmed)
  if (normalizedLocalPath) {
    return normalizedLocalPath
  }

  const normalizedInput = trimmed.startsWith('//')
    ? `${typeof window !== 'undefined' ? window.location.protocol : 'https:'}${trimmed}`
    : trimmed

  try {
    const parsed = new URL(normalizedInput, getUrlParseBase())

    if (AI_PROXY_PATHS.has(parsed.pathname)) {
      return `/v1/common/ai/assets${parsed.search}`
    }

    if (!isRemoteAiAssetHost(parsed.hostname)) {
      return trimmed
    }
  } catch {
    return trimmed
  }

  const params = new URLSearchParams({ url: normalizedInput })
  return `/v1/common/ai/assets?${params.toString()}`
}
