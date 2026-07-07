import request, { getAccessToken } from './request'

export const fetchAiChatStream = async (
  payload: Record<string, unknown>,
  onChunk: (text: string) => void,
  onReasoningChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void
) => {
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    if (!response.body) {
      throw new Error('No response body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim() === '') continue
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const dataObj = JSON.parse(dataStr)
            if (dataObj.type === 'response.output_text.delta' && dataObj.delta) {
              onChunk(dataObj.delta)
            } else if (dataObj.type === 'response.reasoning_summary_text.delta' && dataObj.delta) {
              onReasoningChunk(dataObj.delta)
            } else if (dataObj.type === 'response.completed') {
              onComplete()
            }
          } catch {
            // ignore parse error on partial line
          }
        }
      }
    }

    // final buffer check
    if (buffer) {
      if (buffer.startsWith('data: ')) {
        const dataStr = buffer.slice(6)
        try {
          const dataObj = JSON.parse(dataStr)
          if (dataObj.type === 'response.output_text.delta' && dataObj.delta) {
            onChunk(dataObj.delta)
          } else if (dataObj.type === 'response.reasoning_summary_text.delta' && dataObj.delta) {
            onReasoningChunk(dataObj.delta)
          }
        } catch {
          // Ignore parse errors on final buffer check
        }
      }
    }
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
