import request, { getAccessToken } from './request'

export const fetchXaiChatStream = async (
  payload: Record<string, unknown>,
  onChunk: (text: string) => void,
  onReasoningChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: Error) => void
) => {
  try {
    const token = getAccessToken()
    const response = await fetch('/v1/common/xai/responses', {
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

export interface XaiImageGenParams {
  prompt: string
  model?: string
  n?: number
  aspect_ratio?: string
  resolution?: string
}

export const xaiGenerateImage = (data: XaiImageGenParams) => {
  return request.post('/common/xai/images/generations', data, { timeout: 120000 })
}

export interface XaiImageEditParams {
  prompt: string
  image?: { url: string; type?: 'image_url' }
  images?: Array<{ url: string; type?: 'image_url' }>
  model?: string
  n?: number
  aspect_ratio?: string
  resolution?: string
}

export const xaiEditImage = (data: XaiImageEditParams) => {
  return request.post('/common/xai/images/edits', data, { timeout: 120000 })
}

export interface XaiVideoGenParams {
  prompt: string
  model?: string
  duration?: number
  aspect_ratio?: string
  resolution?: string
  image?: { url: string; type?: 'image_url' }
  reference_images?: Array<{ url: string; type?: 'image_url' }>
}

export const xaiGenerateVideo = (data: XaiVideoGenParams) => {
  return request.post('/common/xai/videos/generations', data, { timeout: 120000 })
}

export const xaiGetVideoStatus = (requestId: string) => {
  return request.get(`/common/xai/videos/${requestId}`)
}

const XAI_REMOTE_ASSET_HOSTS = new Set(['imgen.x.ai', 'vidgen.x.ai'])
const XAI_PROXY_PATHS = new Set(['/v1/common/xai/assets', '/common/xai/assets'])

const getUrlParseBase = () => {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }
  return 'http://localhost'
}

const normalizeLocalXaiAssetPath = (url: string) => {
  if (url.startsWith('/v1/common/xai/assets')) {
    return url
  }

  if (url.startsWith('/common/xai/assets')) {
    return `/v1${url}`
  }

  const withoutDotPrefix = url.replace(/^(?:\.\/)+/, '')
  if (withoutDotPrefix.startsWith('v1/common/xai/assets')) {
    return `/${withoutDotPrefix}`
  }

  if (withoutDotPrefix.startsWith('common/xai/assets')) {
    return `/v1/${withoutDotPrefix}`
  }

  return ''
}

export const resolveXaiAssetUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('data:')) {
    return trimmed
  }

  const normalizedLocalPath = normalizeLocalXaiAssetPath(trimmed)
  if (normalizedLocalPath) {
    return normalizedLocalPath
  }

  const normalizedInput = trimmed.startsWith('//')
    ? `${typeof window !== 'undefined' ? window.location.protocol : 'https:'}${trimmed}`
    : trimmed

  try {
    const parsed = new URL(normalizedInput, getUrlParseBase())

    if (XAI_PROXY_PATHS.has(parsed.pathname)) {
      return `/v1/common/xai/assets${parsed.search}`
    }

    if (!XAI_REMOTE_ASSET_HOSTS.has(parsed.hostname)) {
      return trimmed
    }
  } catch {
    return trimmed
  }

  const params = new URLSearchParams({ url: normalizedInput })
  return `/v1/common/xai/assets?${params.toString()}`
}
