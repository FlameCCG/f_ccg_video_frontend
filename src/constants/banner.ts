/**
 * Banner 展示规则与制图规格 — 客户端单一数据源
 *
 * - Display：页面真实容器（定高全宽 / 移动端固定比例等），运行时绑定这里
 * - ArtSpec：运营/用户出图推荐像素与安全区，仅用于提示与预览比例，不锁死响应式布局
 *
 * 后台管理提示应与 ArtSpec 保持一致。
 */

/** 与接口 type 对齐 */
export const BannerTypeId = {
  HOME_CAROUSEL: 1,
  TOP_BANNER: 2,
  PROFILE: 3,
} as const

export type BannerTypeId = (typeof BannerTypeId)[keyof typeof BannerTypeId]

/**
 * 运行时展示规则
 * 全宽横幅用「定高 + 100% 宽 + object-cover」，比例随视口变化；
 * 不在 CSS 中写死 9.6:1，避免窄屏高度塌缩 / 超宽屏过高。
 */
export const BannerDisplay = {
  /** 全站顶部横幅带高度（px）— Header / MainLayout */
  topHeight: 200,
  /** 用户主页头图高度（px）— User space */
  profileHeight: 220,
  /** 首页/分区轮播固定比例；骨架、真实图片与空态均使用同一画幅 */
  homeCarouselAspect: '16 / 9',
  objectFit: 'cover' as const,
  objectPosition: 'center' as const,
} as const

export type BannerArtKind = 'homeCarousel' | 'topBanner' | 'profileBanner'

export interface BannerArtSpecItem {
  /** 推荐导出宽 */
  width: number
  /** 推荐导出高 */
  height: number
  /** 展示用比例文案，如 4:3 */
  ratioLabel: string
  /** CSS aspect-ratio 值，用于预览框贴近制图比例 */
  ratioCss: string
  /** 尺寸文案，如 1600×1200 */
  sizeLabel: string
  /** 安全区说明（出图/上传提示） */
  safeZone: string
}

/**
 * 制图规格（主场景最佳实践）
 * - homeCarousel：与当前轮播素材和视频封面统一为 16:9
 * - top/profile：按常见 1920 宽桌面 × 定高，再 ×2 得到 3840×400（9.6:1）
 */
export const BannerArtSpec: Record<BannerArtKind, BannerArtSpecItem> = {
  homeCarousel: {
    width: 1920,
    height: 1080,
    ratioLabel: '16:9',
    ratioCss: '16 / 9',
    sizeLabel: '1920×1080',
    safeZone: '关键主体放在画面中心；超宽素材会等比裁切左右边缘',
  },
  topBanner: {
    width: 3840,
    height: 400,
    ratioLabel: '9.6:1',
    ratioCss: '9.6 / 1',
    sizeLabel: '3840×400',
    safeZone: '关键内容放在水平居中约 60% 区域（窄屏会裁左右）',
  },
  profileBanner: {
    width: 3840,
    height: 400,
    ratioLabel: '9.6:1',
    ratioCss: '9.6 / 1',
    sizeLabel: '3840×400',
    safeZone: '关键内容放在水平居中约 60%、垂直中部；底部有头像与昵称遮罩',
  },
}

/** 接口 type → 制图规格 */
export const bannerArtSpecByType: Record<BannerTypeId, BannerArtSpecItem> = {
  [BannerTypeId.HOME_CAROUSEL]: BannerArtSpec.homeCarousel,
  [BannerTypeId.TOP_BANNER]: BannerArtSpec.topBanner,
  [BannerTypeId.PROFILE]: BannerArtSpec.profileBanner,
}

/** 用户端上传/选择横幅提示（含尺寸、比例、安全区） */
export function formatProfileBannerUploadTip(): string {
  const spec = BannerArtSpec.profileBanner
  return `推荐尺寸 ${spec.sizeLabel}（比例 ${spec.ratioLabel}），支持 JPG/PNG。${spec.safeZone}`
}

/** 通用制图提示 */
export function formatBannerArtTip(kind: BannerArtKind, maxSizeMb = 20): string {
  const spec = BannerArtSpec[kind]
  return `推荐尺寸 ${spec.sizeLabel}（比例 ${spec.ratioLabel}），支持 JPG/PNG，最大 ${maxSizeMb}MB。${spec.safeZone}`
}
