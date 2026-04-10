import type { UserHomeBannerDefaultsResult } from '@/api/user'

export const normalizeBannerUrl = (value?: string | null) =>
  (value ?? '').trim().replace(/^https?:/, '')

export const getBannerPresetMediaStyle = (presetIndex?: number | null) => {
  if (presetIndex === 1) {
    return { objectPosition: '50% 12%' }
  }

  return undefined
}

export const resolveBannerPresetIndex = (
  defaults?: Pick<
    UserHomeBannerDefaultsResult,
    'list' | 'currentBannerId' | 'currentBannerImageUrl'
  > | null
) => {
  if (!defaults) return null

  if (defaults.currentBannerId > 0) {
    const foundIndex = defaults.list.findIndex((item) => item.id === defaults.currentBannerId)
    return foundIndex >= 0 ? foundIndex : null
  }

  const foundIndex = defaults.list.findIndex(
    (item) => normalizeBannerUrl(item.cover) === normalizeBannerUrl(defaults.currentBannerImageUrl)
  )

  return foundIndex >= 0 ? foundIndex : null
}
