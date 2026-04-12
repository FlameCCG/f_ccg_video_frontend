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

/** SSE delta 字段可能是 string / number，拒绝 object 以免变成 [object Object] */
const asDeltaText = (delta: unknown): string | null => {
  if (typeof delta === 'string') return delta
  if (typeof delta === 'number' || typeof delta === 'boolean') return String(delta)
  return null
}

export interface AiResponsesTextPart {
  type: 'input_text' | 'output_text'
  text: string
}

export interface AiResponsesImagePart {
  type: 'input_image'
  image_url: string
  detail?: 'low' | 'high' | 'auto'
}

export type AiResponsesContentPart = AiResponsesTextPart | AiResponsesImagePart

export interface AiResponsesMessage {
  role: 'user' | 'assistant'
  content: string | AiResponsesContentPart[]
}

/** POST /common/ai/responses — 与后端 ai_service.ResponsesRequest 保持一致。 */
export interface AiResponsesRequest {
  model?: string
  input: string | AiResponsesMessage[]
  thinking?: boolean
  thinkingEffort?: string
}

export const fetchAiChatStream = async (
  payload: AiResponsesRequest,
  onChunk: (text: string) => void,
  onReasoningChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void,
  signal?: AbortSignal
) => {
  let completed = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined

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
      signal,
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

    reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let dataLines: string[] = []
    let eventType = ''

    const handleDataPayload = (dataStr: string) => {
      if (completed) return
      if (dataStr === '[DONE]') {
        safeComplete()
        return
      }

      let dataObj: Record<string, unknown> & AiBusinessResponse
      try {
        dataObj = JSON.parse(dataStr) as Record<string, unknown> & AiBusinessResponse
      } catch {
        throw new Error('AI 响应格式异常，请稍后重试')
      }
      if (!dataObj || typeof dataObj !== 'object') return
      const type = dataObj.type || eventType

      // 部分上游会在 SSE data 里塞业务错误 JSON
      const bizErr = parseBusinessJsonError(dataObj)
      if (bizErr) throw bizErr

      if (type === 'response.output_text.delta') {
        const text = asDeltaText(dataObj.delta)
        if (text !== null) {
          onChunk(text)
        }
        return
      }

      if (type === 'response.reasoning_summary_text.delta') {
        const text = asDeltaText(dataObj.delta)
        if (text !== null) {
          onReasoningChunk(text)
        }
        return
      }

      if (type === 'response.completed' || type === 'response.done') {
        safeComplete()
        return
      }

      if (type === 'error' || type === 'response.failed' || type === 'response.incomplete') {
        const responseData = dataObj.response as { error?: { message?: string } } | undefined
        const errorData = dataObj.error as { message?: string } | undefined
        const errMsg =
          (typeof dataObj.message === 'string' && dataObj.message) ||
          (typeof dataObj.msg === 'string' && dataObj.msg) ||
          responseData?.error?.message ||
          errorData?.message ||
          DEFAULT_AI_ERROR
        throw new Error(formatAiErrorMessage(errMsg))
      }
    }

    const handleLine = (rawLine: string) => {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (!line) {
        if (dataLines.length) handleDataPayload(dataLines.join('\n'))
        dataLines = []
        eventType = ''
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''))
      } else if (line.startsWith('event:')) {
        eventType = line.slice(6).trim()
      }
    }

    while (!completed) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let newline: number
      while (!completed && (newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        handleLine(line)
      }
    }

    if (!completed) {
      buffer += decoder.decode()
      if (buffer.trim().startsWith('{')) {
        const body = JSON.parse(buffer) as AiBusinessResponse
        const bizErr = parseBusinessJsonError(body)
        if (bizErr) throw bizErr
      } else {
        if (buffer) handleLine(buffer)
        handleLine('')
      }
    }

    // 缺少终止事件的 EOF 可能是代理断线，保留部分回答并提示中断。
    if (!completed) {
      throw new Error('AI 回答中断，请稍后重试')
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  } finally {
    if (reader) {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}

/** 模型/选项 label-value */
export interface AiModelOption {
  label: string
  value: string
}

/** GET /common/ai/options — 前台模型与思考配置（不含密钥） */
export interface AiPublicOptions {
  chatModel: string
  chatModels: AiModelOption[]
  thinkingEnabled: boolean
  thinkingEffort: string
  thinkingEfforts: AiModelOption[]
  imageModel: string
  imageModels: AiModelOption[]
  videoModel: string
  videoModels: AiModelOption[]
}

export const getAiOptions = (): Promise<AiPublicOptions> => {
  return request.get('/common/ai/options', { silent: true })
}

export interface AiImageGenParams {
  prompt: string
  model?: string
  n?: number
  aspect_ratio?: string
  resolution?: string
  size?: string
}

export const aiGenerateImage = (data: AiImageGenParams, signal?: AbortSignal) => {
  return request.post('/common/ai/images/generations', data, { timeout: 120000, signal })
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

export const aiEditImage = (data: AiImageEditParams, signal?: AbortSignal) => {
  return request.post('/common/ai/images/edits', data, { timeout: 120000, signal })
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

export const aiGenerateVideo = (data: AiVideoGenParams, signal?: AbortSignal) => {
  return request.post('/common/ai/videos/generations', data, { timeout: 120000, signal })
}

export const aiGetVideoStatus = (requestId: string, signal?: AbortSignal) => {
  return request.get('/common/ai/videos/status', { params: { requestID: requestId }, signal })
}

const AI_PROXY_PATHS = new Set(['/v1/common/ai/assets', '/common/ai/assets'])

const getUrlParseBase = () => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }
  return 'http://localhost'
}

/** 将本站 AI 资源代理路径规范为带 /v1 前缀 */
const normalizeLocalAIAssetPath = (url: string) => {
  if (url.startsWith('/v1/common/ai/assets')) {
    return url
  }

  if (url.startsWith('/common/ai/assets')) {
    return `/v1${url}`
  }

  const withoutDotPrefix = url.replace(/^(?:\.\/)+/, '')
  if (withoutDotPrefix.startsWith('v1/common/ai/assets')) {
    return `/${withoutDotPrefix}`
  }

  if (withoutDotPrefix.startsWith('common/ai/assets')) {
    return `/v1/${withoutDotPrefix}`
  }

  return ''
}

const isRemoteAiAssetHost = (host: string) => {
  const normalized = host.toLowerCase()
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
