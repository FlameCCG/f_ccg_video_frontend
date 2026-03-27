import type { Router } from 'vue-router'
import type { NotificationItem } from '@/api/notification'

type NotificationTargetSource = Pick<
  NotificationItem,
  'link' | 'videoID' | 'dynamicID' | 'commentID'
>

export interface NotificationTarget {
  href: string
  isInternal: boolean
}

const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/

const getPositiveNumber = (value: unknown): number | undefined => {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

const getBaseOrigin = () => {
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost'
}

const formatRelativeHref = (url: URL) => `${url.pathname}${url.search}${url.hash}`

const isInternalHref = (href: string): boolean => {
  if (href.startsWith('/')) return true
  if (!ABSOLUTE_URL_RE.test(href) || typeof window === 'undefined') return false

  try {
    return new URL(href).origin === window.location.origin
  } catch {
    return false
  }
}

const appendCommentId = (href: string, commentId?: number): string => {
  if (!commentId) return href

  try {
    const url = new URL(href, getBaseOrigin())
    if (!url.searchParams.has('commentId')) {
      url.searchParams.set('commentId', String(commentId))
    }
    return ABSOLUTE_URL_RE.test(href) ? url.toString() : formatRelativeHref(url)
  } catch {
    const separator = href.includes('?') ? '&' : '?'
    return `${href}${separator}commentId=${commentId}`
  }
}

const buildFallbackHref = (source: NotificationTargetSource): string | null => {
  const videoId = getPositiveNumber(source.videoID)
  const dynamicId = getPositiveNumber(source.dynamicID)

  if (videoId) {
    return `/video/${videoId}`
  }

  if (dynamicId) {
    return `/dynamic?dynamicId=${dynamicId}`
  }

  return null
}

export const resolveNotificationTarget = (
  source: NotificationTargetSource
): NotificationTarget | null => {
  const rawHref = source.link?.trim() || buildFallbackHref(source)
  if (!rawHref) return null

  const hrefWithComment = appendCommentId(rawHref, getPositiveNumber(source.commentID))

  if (isInternalHref(hrefWithComment)) {
    try {
      const url = new URL(hrefWithComment, getBaseOrigin())
      return {
        href: formatRelativeHref(url),
        isInternal: true,
      }
    } catch {
      return {
        href: hrefWithComment,
        isInternal: true,
      }
    }
  }

  return {
    href: hrefWithComment,
    isInternal: false,
  }
}

export const navigateToNotificationTarget = async (
  router: Router,
  source: NotificationTargetSource
): Promise<boolean> => {
  const target = resolveNotificationTarget(source)
  if (!target) return false

  if (target.isInternal) {
    await router.push(target.href)
    return true
  }

  if (typeof window !== 'undefined') {
    window.open(target.href, '_blank', 'noopener,noreferrer')
    return true
  }

  return false
}
