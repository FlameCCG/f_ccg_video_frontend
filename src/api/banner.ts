import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 轮播图类型常量
 * 1 - 首页轮播
 * 2 - 顶部横幅
 * 3 - 用户主页横幅预制列表
 */
export const BannerType = {
  HOME_CAROUSEL: 1,
  TOP_BANNER: 2,
  USER_HOME_BANNER: 3,
} as const

export type BannerType = (typeof BannerType)[keyof typeof BannerType]

// Banner Item
export interface BannerItem {
  id: number
  cover: string
  href: string
  show: boolean
  type: BannerType
}

// Banner List Params
export interface BannerListParams {
  type?: BannerType
}

// ============================================================================
// Banner API
// ============================================================================

/**
 * 获取轮播图列表
 * GET /common/banner/list
 * 无需登录
 * @param params.type - 轮播图类型（1首页轮播 2顶部横幅 3用户主页横幅预制列表）
 */
export const getBannerList = (params?: BannerListParams): Promise<BannerItem[]> => {
  return request.get('/common/banner/list', { params })
}

/**
 * 获取首页轮播图
 * GET /common/banner/list?type=1
 */
export const getHomeCarouselBanners = (): Promise<BannerItem[]> => {
  return getBannerList({ type: BannerType.HOME_CAROUSEL })
}

/**
 * 获取顶部横幅
 * GET /common/banner/list?type=2
 */
export const getTopBanners = (): Promise<BannerItem[]> => {
  return getBannerList({ type: BannerType.TOP_BANNER })
}

/**
 * 获取用户主页横幅预制列表
 * GET /common/banner/list?type=3
 */
export const getUserHomeBannerPresets = (): Promise<BannerItem[]> => {
  return getBannerList({ type: BannerType.USER_HOME_BANNER })
}
