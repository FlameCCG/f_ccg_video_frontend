import { resolveAiAssetUrl } from '@/api/ai'

const sanitizeBaseName = (value: string, fallback: string) => {
  const trimmed = value.trim()
  const safe = trimmed
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (safe || fallback).slice(0, 80)
}

const inferExtensionFromMime = (mimeType: string) => {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('jpeg')) return 'jpg'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('webp')) return 'webp'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('mp4')) return 'mp4'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('quicktime')) return 'mov'
  return ''
}

const inferExtensionFromUrl = (url: string) => {
  const matched = url.match(/\.([a-z0-9]+)(?:\?|$)/i)
  return matched?.[1]?.toLowerCase() ?? ''
}

export const buildAiSuggestedTitle = (prompt: string, fallback: string) => {
  return sanitizeBaseName(prompt, fallback)
}

export const fetchAiAssetAsFile = async (
  assetUrl: string,
  baseName: string,
  fallbackExtension: string
) => {
  const resolvedUrl = resolveAiAssetUrl(assetUrl)
  const response = await fetch(resolvedUrl)
  if (!response.ok) {
    throw new Error(`资源拉取失败: ${response.status}`)
  }

  const blob = await response.blob()
  const mimeType = blob.type || ''
  const extension =
    inferExtensionFromMime(mimeType) || inferExtensionFromUrl(assetUrl) || fallbackExtension
  const fileName = `${sanitizeBaseName(baseName, 'ai-asset')}.${extension}`
  return new File([blob], fileName, { type: mimeType || undefined })
}

export const hashFileSha256 = async (file: File) => {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
