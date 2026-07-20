import type { UserHomeBannerDefaultsResult } from '@/api/user'
import { BannerDisplay } from '@/constants/banner'

export const normalizeBannerUrl = (value?: string | null) =>
  (value ?? '').trim().replace(/^https?:/, '')

/**
 * 预设横幅缩略图定位：默认居中（与页面 object-center 一致）；
 * 个别素材可按索引微调，避免关键区域被裁切。
 */
export const getBannerPresetMediaStyle = (presetIndex?: number | null) => {
  if (presetIndex === 1) {
    return { objectPosition: '50% 12%' }
  }

  return { objectPosition: BannerDisplay.objectPosition }
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
