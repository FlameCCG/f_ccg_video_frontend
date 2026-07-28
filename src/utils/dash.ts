import type Artplayer from 'artplayer'
import type {
  ErrorEvent,
  MediaPlayerClass,
  MediaPlayerSettingClass,
  QualityChangeRenderedEvent,
  Representation,
} from 'dashjs'
import type { VideoResourceItem } from '@/api/video'

// dash.js 较重（MSE 自适应内核），只在真正播放 DASH 流时按需加载，避免在每个
// 视频页都急切拉进主包。模块级缓存确保整个会话只动态 import 一次。
type DashjsModule = typeof import('dashjs')
let dashjsModule: DashjsModule | null = null

/** 懒加载并缓存 dash.js 模块（至多加载一次）。仅供真正实例化播放器的辅助函数调用。 */
const loadDashjs = async (): Promise<DashjsModule> => {
  if (!dashjsModule) {
    dashjsModule = await import('dashjs')
  }
  return dashjsModule
}

// ============================================================================
// MPEG-DASH 接入辅助（dash.js + Artplayer）
//
// 后端「混合模式」：resources 中同时存在 DASH 清单与各清晰度直链 MP4。
// 这里只负责「识别 DASH / 能力探测 / 把 dash.js 挂到 Artplayer」三件事，
// 选流策略与降级仍由播放器组件决定，保持 MP4 既有能力不受影响。
// ============================================================================

/** 后端用 format === 'dash' 标记 DASH 清单条目（务必用 format 判断，不靠顺序）。 */
export const DASH_FORMAT = 'dash'

/**
 * 后端 DASH 封装使用的 MSE 编解码探测串（H.264 baseline + AAC-LC）。
 * 与契约一致：avc1.42E01E + mp4a.40.2。
 */
const DASH_CODEC_PROBE = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"'

/** 挂载了 dash.js 实例的 Artplayer，便于统一管理销毁。 */
export type ArtWithDash = Artplayer & { dash?: MediaPlayerClass | null }

/** 仅当后端把条目标记为 format === 'dash' 时才视为 DASH 流。 */
export const isDashResource = (resource?: Pick<VideoResourceItem, 'format'> | null): boolean =>
  (resource?.format ?? '').toLowerCase() === DASH_FORMAT

/** 当前浏览器是否支持通过 MSE 播放后端 DASH 流。 */
export const isDashSupported = (): boolean => {
  if (typeof window === 'undefined') return false
  const mse = window.MediaSource
  return !!mse && typeof mse.isTypeSupported === 'function' && mse.isTypeSupported(DASH_CODEC_PROBE)
}

/** 安全销毁并解除挂载在 Artplayer 上的 dash.js 实例（幂等）。 */
export const destroyDash = (art: ArtWithDash): void => {
  const dash = art.dash
  if (!dash) return
  art.dash = null
  try {
    dash.destroy()
  } catch (error) {
    console.error('[dash] destroy failed', error)
  }
}

/**
 * 从 dash.js v5 的多种 ErrorEvent 子类型中尽可能提取人类可读的诊断信息。
 * 生产环境由 console.error 第一个参数输出，后续 JSON 事件对象作为第二个参数。
 */
const formatDashError = (event: ErrorEvent): string => {
  const parts: string[] = [String(event.type)]

  // type-narrow across the ErrorEvent union without index-signature noise
  const e = event as { error?: unknown; event?: unknown }

  if (typeof e.error === 'string') {
    parts.push(`kind=${e.error}`)
    const evt = e.event as { url?: unknown; message?: unknown; id?: unknown } | undefined
    if (evt) {
      if (typeof evt.url === 'string') parts.push(`url=${evt.url}`)
      if (typeof evt.message === 'string') parts.push(`msg=${evt.message}`)
      if (typeof evt.id === 'string') parts.push(`id=${evt.id}`)
    }
  } else if (e.error && typeof e.error === 'object') {
    const err = e.error as { code?: unknown; message?: unknown }
    parts.push(`code=${typeof err.code === 'number' ? err.code : '?'}`)
    if (typeof err.message === 'string') parts.push(`msg=${err.message}`)
  }

  return parts.join(' | ')
}

/**
 * dash.js 的 settings 类型把若干「整段覆盖」的子对象标成必填（如
 * `abr.throughput.sampleSettings` / `ewma`），但运行时是逐字段深合并的。
 * 用 DeepPartial 收窄后再断言，既保住 key 名的拼写检查，也不必为了通过类型检查
 * 而写死一整套本该走默认值的采样参数。
 */
type DeepPartial<T> = {
  // NonNullable 不可省：settings 的子对象全是可选属性，`{...} | undefined` 不满足
  // `extends object`，不剥掉 undefined 就不会递归下去，等于没收窄。
  [K in keyof T]?: NonNullable<T[K]> extends object ? DeepPartial<NonNullable<T[K]>> : T[K]
}

/**
 * 4K/顶档优先「稳缓冲」：避免过小缓冲 + 一切档就 flush 造成「播一会卡一下」。
 * 局域网带宽通常够用，卡顿更常见于 ABR 抖动与软解尖峰。
 *
 * 注意键路径按 dash.js v5 命名：
 * - v4 的 `buffer.stableBufferTime` 在 v5 改名为 `buffer.bufferTimeDefault`（默认 18s）
 * - v4 的 `abr.bandwidthSafetyFactor` 在 v5 移到 `abr.throughput.bandwidthSafetyFactor`（默认 0.9）
 * 用旧名写不会报错，但会被静默忽略。
 */
const DASH_STABLE_BUFFER_SETTINGS: DeepPartial<MediaPlayerSettingClass> = {
  streaming: {
    buffer: {
      // 稳定缓冲目标（秒）：顶档与长视频再拉长，减少 underflow
      bufferTimeDefault: 25,
      bufferTimeAtTopQuality: 40,
      bufferTimeAtTopQualityLongForm: 60,
      longFormContentDurationThreshold: 300,
      // 切档时不要立刻冲掉已有缓冲，降低「切换一顿」
      fastSwitchEnabled: false,
      flushBufferAtTrackSwitch: false,
      bufferToKeep: 20,
      bufferPruningInterval: 12,
    },
    abr: {
      autoSwitchBitrate: { video: true },
      // 不按播放器窗口像素强行限码率（超宽 4K 会被误判）
      limitBitrateByPortal: false,
      usePixelRatioInLimitBitrateByPortal: false,
      throughput: {
        // 略保守，减少刚够带宽时来回跳档
        bandwidthSafetyFactor: 0.85,
      },
    },
  },
}

export interface MpdLoaderOptions {
  /** dash.js 发生致命错误（且尚未起播）时回调，宿主据此降级到 MP4 直链。 */
  onFatalError?: (art: ArtWithDash) => void
  /** dash.js 实例创建完成后回调，可在此注入手动码率菜单等。 */
  onDashCreated?: (art: ArtWithDash, dash: MediaPlayerClass) => void
}

/**
 * 构造 Artplayer 的 `customType.mpd` 处理函数。
 * - dash.js 负责 MSE 拉流与 ABR 自适应；Artplayer 负责 UI 与播放控制。
 * - initialize 第三参 autoplay=false，交给 Artplayer 决定何时起播。
 * - 不改写传入的 .mpd URL（含 MinIO 的 ?response-content-type=...），
 *   分片 mp4 是 manifest 的同目录兄弟文件，dash.js 按相对路径解析。
 * - dash 实例挂到 `art.dash`，并在播放器销毁时一并释放，杜绝内存泄漏。
 * - dash.js 在此处按需动态加载（仅当真正播放 DASH 流时才拉取该 chunk）。
 */
export const createMpdLoader = (options: MpdLoaderOptions = {}) => {
  return async function playMpd(
    video: HTMLVideoElement,
    url: string,
    art: ArtWithDash
  ): Promise<void> {
    if (!window.MediaSource) {
      art.notice.show = '当前浏览器不支持 DASH 自适应播放'
      options.onFatalError?.(art)
      return
    }

    // 真正需要 DASH 时才动态加载 dash.js（非 DASH 路径完全不触达该 chunk）。
    const dashjs = await loadDashjs()

    // 动态加载 dash.js 期间播放器可能已被销毁/重建（快速切换分P或视频）。
    // 此时原 <video> 已从 DOM 卸载，直接退出以避免在已废弃实例上创建残留 dash 实例。
    if (!video.isConnected) return

    // 防御：同一实例上不残留上一个 dash。
    destroyDash(art)

    // 剔除 URL 中的 response-content-type，避免 dash.js 将其透传给 m4s/mp4 分片导致 MSE 失败
    const cleanUrl = new URL(url)
    cleanUrl.searchParams.delete('response-content-type')

    const dash = dashjs.MediaPlayer().create()
    try {
      dash.updateSettings(DASH_STABLE_BUFFER_SETTINGS as MediaPlayerSettingClass)
    } catch (error) {
      console.warn('[dash] updateSettings failed', error)
    }
    dash.initialize(video, cleanUrl.toString(), false)

    let started = false
    dash.on(dashjs.MediaPlayer.events.PLAYBACK_STARTED, () => {
      started = true
    })

    dash.on(dashjs.MediaPlayer.events.ERROR, (event) => {
      // 结构化日志：从不同 error 子类型中提取关键信息，便于定位根因。
      const detail = formatDashError(event)
      console.error('[dash] error', detail, event)
      // 仅在「尚未起播」时硬降级（清单/编解码/MSE 等开播前致命错误）。
      // 播放中途的瞬时错误由 dash.js 自行恢复，此时拆掉播放器只会无谓打断。
      if (started) return
      destroyDash(art)
      options.onFatalError?.(art)
    })

    art.dash = dash
    art.on('destroy', () => destroyDash(art))
    options.onDashCreated?.(art, dash)
  }
}

export interface DashQualityMenuOptions {
  /** 自动（ABR）项的文案。 */
  autoLabel?: string
  /**
   * 后端 MP4 资源的分辨率标签+码率，用于给 DASH 菜单项匹配可读的中文标签。
   * 如 [{ resolution: '1080p 高码率', bitrate: 1737 }, { resolution: '720p 准高清', bitrate: 389 }]
   */
  labels?: { resolution: string; bitrate: number; fileUrl?: string }[]
}

/**
 * （可选）向 Artplayer 设置面板注入 DASH 手动码率菜单。
 * 默认走自动 ABR；选择固定档则关闭 ABR 并锁定到对应 representation。
 * 清单解析后（STREAM_INITIALIZED）才知道码率列表，故内部等待该事件。
 * 任何异常都被吞掉（不影响 ABR 正常播放），返回清理函数。
 *
 * 仅在 createMpdLoader 已实例化 dash.js 后（onDashCreated 回调内）调用，
 * 故 dash.js 模块此刻必已加载完成，这里同步读取缓存即可，无需再次 await。
 */
export const setupDashQualityMenu = (
  art: ArtWithDash,
  dash: MediaPlayerClass,
  options: DashQualityMenuOptions = {}
): (() => void) => {
  // dash.js 在 createMpdLoader 中已按需加载并缓存；此处仅同步取用其事件常量。
  const dashjs = dashjsModule
  if (!dashjs) return () => {}

  const autoLabel = options.autoLabel ?? '自动'
  const autoPendingLabel = `${autoLabel}评估中`
  const AUTO_EVALUATION_SETTLE_MS = 1200
  const AUTO_EVALUATION_FALLBACK_MS = 8000
  const SETTING_NAME = 'dash-quality'
  let disposed = false
  let built = false
  let isManualSwitch = false
  // 跳过初始 ABR 自动选档通知（视频首次加载时 ABR 会即刻选定初始清晰度）
  let firstQualityChange = true
  let isAuto = true // 记录当前是否是自动（ABR）模式
  let reps: Representation[] = [] // 存放在外部作用域，供事件监听器查询
  let cleanupAutoFallbackListeners: (() => void) | null = null
  let isAutoEvaluationPending = false
  let suppressNextAutoRenderedNotice = false
  let pendingAutoEvaluationLabel: string | null = null
  let autoEvaluationTimer: ReturnType<typeof setTimeout> | null = null
  let lastManualDashIndex: number | null = null
  let autoEvaluationToken = 0

  type DashSelectorItem = {
    dashIndex?: number
    html?: string
    $html?: HTMLDivElement
  }

  type DashSettingItem = {
    tooltip?: string | HTMLElement
    $tooltip?: HTMLDivElement
    selector?: DashSelectorItem[]
    $option?: DashSelectorItem[]
  }

  const findQualitySetting = (): DashSettingItem | null => {
    try {
      return (art.setting.find(SETTING_NAME) as DashSettingItem | null) ?? null
    } catch {
      return null
    }
  }

  /**
   * 将 DASH representation 按「高度 + 同高度内码率排名」匹配到后端 MP4 的中文标签。
   * 例如 1080P 高码率 DASH 档 → "1080p 高码率"， 1080P 标准档 → "1080p 高清"。
   * 匹配不上的兜底用 "720P" / "360P" 等高度标签。
   */
  const buildLabelMap = (
    reps: Representation[],
    mp4Labels: { resolution: string; bitrate: number; fileUrl?: string }[]
  ): Map<number, string> => {
    const result = new Map<number, string>()

    const parseHeight = (s: string): number => {
      const m = s.match(/^(\d+)[pP]/)
      return m ? Number(m[1]) : 0
    }

    // 按高度分组 MP4，组内按码率降序
    const mp4ByHeight = new Map<number, { resolution: string; bitrate: number }[]>()
    for (const l of mp4Labels) {
      const h = parseHeight(l.resolution)
      if (!mp4ByHeight.has(h)) mp4ByHeight.set(h, [])
      mp4ByHeight.get(h)!.push(l)
    }
    for (const [, items] of mp4ByHeight) items.sort((a, b) => b.bitrate - a.bitrate)

    // 按高度分组 DASH，组内按带宽降序
    const dashByHeight = new Map<number, Representation[]>()
    for (const r of reps) {
      const h = r.height || 0
      if (!dashByHeight.has(h)) dashByHeight.set(h, [])
      dashByHeight.get(h)!.push(r)
    }
    for (const [, items] of dashByHeight)
      items.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))

    // 同高度内按码率降序排名一一匹配。后端 DASH MPD 与 MP4 资源的档位数量/顺序一致，
    // 按排名匹配即可：最高带宽 DASH 档 → 最高码率 MP4 标签（如 "1080p 高码率"）。
    for (const [h, dashReps] of dashByHeight) {
      const labels = mp4ByHeight.get(h) ?? []
      for (let i = 0; i < dashReps.length; i++) {
        const rep = dashReps[i]!
        const matched = labels[i]
        const label = matched
          ? matched.resolution
          : rep.height
            ? `${rep.height}P`
            : `${Math.round((rep.bandwidth || 0) / 1000)} kbps`
        result.set(rep.index, label)
      }
    }

    return result
  }

  /** 已匹配的 index → MP4 中文标签（如 "1080p 高码率"） */
  let labelMap = new Map<number, string>()

  const formatLabel = (rep: Representation): string => {
    if (rep.height) return `${rep.height}P`
    if (rep.bandwidth) return `${Math.round(rep.bandwidth / 1000)} kbps`
    return `清晰度 ${rep.index + 1}`
  }

  /** 优先用匹配到的 MP4 中文标签，否则兜底 formatLabel */
  const resolveLabel = (rep: Representation): string => {
    return labelMap.get(rep.index) ?? formatLabel(rep)
  }

  /** 更新设置面板 tooltip，反映当前 ABR 所选档位或手动所选档位。 */
  const updateTooltip = (text: string): void => {
    const setting = findQualitySetting()
    if (!setting) return

    // 不使用 art.setting.update()：ArtPlayer 会重建父设置项并解绑已缓存子菜单的返回按钮。
    // 直接改当前对象和 DOM，避免破坏 setting panel 的层级事件。
    setting.tooltip = text
    if (setting.$tooltip) setting.$tooltip.textContent = text
  }

  /**
   * 展开菜单中「自动」项的文案跟随当前 ABR 档位动态变化。
   * 同时改写数据(opt.html)与 DOM($html.textContent)，面板展开时 Artplayer 从数据重建，不会丢失。
   */
  const updateAutoItemLabel = (label?: string, textOverride?: string): void => {
    const text = textOverride ?? (label ? `${autoLabel}(${label})` : autoLabel)
    if (isAuto) {
      updateTooltip(text)
    }
    try {
      const setting = findQualitySetting()
      if (!setting) return

      // 1. 同步更新原始 selector 配置里的文本，保证面板未展开时后续展开能渲染最新文本
      if (setting.selector) {
        for (const opt of setting.selector) {
          if (opt.dashIndex === -1) {
            opt.html = text
            break
          }
        }
      }

      // 2. 同步更新已格式化的选项和实时 DOM（若面板已展开）
      if (setting.$option) {
        for (const opt of setting.$option) {
          if (opt.dashIndex === -1) {
            opt.html = text
            if (opt.$html) opt.$html.textContent = text
            break
          }
        }
      }
    } catch {
      // 忽略
    }
  }

  const clearAutoFallbackListeners = (): void => {
    cleanupAutoFallbackListeners?.()
    cleanupAutoFallbackListeners = null
  }

  const clearAutoEvaluationTimer = (): void => {
    if (!autoEvaluationTimer) return
    clearTimeout(autoEvaluationTimer)
    autoEvaluationTimer = null
  }

  const finishAutoEvaluation = (label: string | null, noticeText: string): void => {
    if (!isAuto) return
    clearAutoEvaluationTimer()
    clearAutoFallbackListeners()
    isAutoEvaluationPending = false
    pendingAutoEvaluationLabel = null
    if (label) {
      updateAutoItemLabel(label)
    } else {
      updateAutoItemLabel(undefined, autoLabel)
    }
    art.notice.show = noticeText
  }

  const scheduleAutoEvaluationFinish = (
    label: string,
    buildNotice: (label: string) => string
  ): void => {
    pendingAutoEvaluationLabel = label
    clearAutoEvaluationTimer()
    autoEvaluationTimer = setTimeout(() => {
      const finalLabel = pendingAutoEvaluationLabel
      if (!finalLabel) return
      finishAutoEvaluation(finalLabel, buildNotice(finalLabel))
    }, AUTO_EVALUATION_SETTLE_MS)
  }

  const handleAutoEvaluationCandidate = (
    index: number,
    label: string,
    buildNotice: (label: string) => string
  ): boolean => {
    if (!isAutoEvaluationPending) return false

    // dash.js 切回 ABR 后经常先回报上一档手动清晰度仍在请求/渲染。
    // 这只是切换残留，不是网络测速结果；评估窗口内不能写进父项或「自动」子项。
    if (lastManualDashIndex !== null && index === lastManualDashIndex) {
      return true
    }

    scheduleAutoEvaluationFinish(label, buildNotice)
    return true
  }

  const pickRepresentationForBandwidth = (bitsPerSecond: number): Representation | null => {
    if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return null
    const safeBudget = bitsPerSecond * 0.82
    const sorted = [...reps].sort((left, right) => (left.bandwidth || 0) - (right.bandwidth || 0))

    return (
      [...sorted].reverse().find((rep) => (rep.bandwidth || 0) <= safeBudget) ??
      sorted.find((rep) => (rep.bandwidth || 0) > 0) ??
      null
    )
  }

  const probeAutoRepresentation = async (): Promise<Representation | null> => {
    const probeResource = [...(options.labels ?? [])]
      .filter((item) => item.fileUrl && item.bitrate > 0)
      .sort((left, right) => right.bitrate - left.bitrate)[0]
    if (!probeResource?.fileUrl) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4500)
    const startedAt = performance.now()
    try {
      const response = await fetch(probeResource.fileUrl, {
        headers: { Range: 'bytes=0-1048575' },
        cache: 'no-store',
        signal: controller.signal,
      })

      if (response.status !== 206) {
        await response.body?.cancel()
        return null
      }

      const body = await response.arrayBuffer()
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001)
      const bitsPerSecond = (body.byteLength * 8) / elapsedSeconds
      return pickRepresentationForBandwidth(bitsPerSecond)
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  const startAutoEvaluationProbe = (token: number): void => {
    void probeAutoRepresentation().then((rep) => {
      if (
        !rep ||
        disposed ||
        token !== autoEvaluationToken ||
        !isAuto ||
        !isAutoEvaluationPending
      ) {
        return
      }
      const label = resolveLabel(rep)
      scheduleAutoEvaluationFinish(label, (finalLabel) => `网络评估完成，智能选择：${finalLabel}`)
    })
  }

  const build = (): void => {
    if (disposed || built) return

    try {
      reps = dash.getRepresentationsByType('video')
      // 匹配 MP4 中文标签（如 "1080p 高码率"），匹配不上的兜底用高度标签
      labelMap = buildLabelMap(reps, options.labels ?? [])
    } catch (error) {
      console.error('[dash] getRepresentationsByType failed', error)
      return
    }
    // 零档说明清单尚未提供视频 representation；单档仍展示清晰度，避免用户误以为资源缺失。
    if (reps.length === 0) return

    // 高画质在前，菜单自上而下更自然。
    const sorted = [...reps].sort(
      (left, right) =>
        (right.height || 0) - (left.height || 0) || (right.bandwidth || 0) - (left.bandwidth || 0)
    )

    // 获取当前活动/渲染的分辨率标签以初始化“自动(xxx)”文案
    let initialAutoLabel = autoLabel
    try {
      const activeRep = dash.getCurrentRepresentationForType('video')
      if (activeRep) {
        const matchedLabel = resolveLabel(activeRep)
        initialAutoLabel = `${autoLabel}(${matchedLabel})`
      }
    } catch {
      // 忽略
    }

    const selector = [
      { html: initialAutoLabel, default: true, dashIndex: -1 },
      ...sorted.map((rep) => ({ html: resolveLabel(rep), default: false, dashIndex: rep.index })),
    ]

    const setAuto = (): string => {
      clearAutoFallbackListeners()
      clearAutoEvaluationTimer()
      isAuto = true
      isManualSwitch = false
      firstQualityChange = false
      isAutoEvaluationPending = true
      suppressNextAutoRenderedNotice = false
      pendingAutoEvaluationLabel = null
      autoEvaluationToken += 1
      const currentEvaluationToken = autoEvaluationToken
      updateAutoItemLabel(undefined, autoPendingLabel)
      dash.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: true } },
          // 切回自动时同样不 flush，避免「点一下自动就卡一下」
          buffer: { fastSwitchEnabled: false, flushBufferAtTrackSwitch: false },
        },
      })

      startAutoEvaluationProbe(currentEvaluationToken)

      // 兜底只用于收敛「已经拿到的非旧档候选」。
      // 不用当前渲染档/吞吐量估算兜底：这些样本会被刚才的手动清晰度污染。
      const fallbackUpdate = () => {
        clearAutoFallbackListeners()
        if (!isAuto || !isAutoEvaluationPending) return
        const finalLabel = pendingAutoEvaluationLabel
        if (finalLabel) {
          finishAutoEvaluation(finalLabel, `网络评估完成，智能选择：${finalLabel}`)
          return
        }

        updateAutoItemLabel(undefined, autoPendingLabel)
      }
      const fallbackTimer = setTimeout(fallbackUpdate, AUTO_EVALUATION_FALLBACK_MS)
      cleanupAutoFallbackListeners = () => {
        clearTimeout(fallbackTimer)
      }

      return autoPendingLabel
    }
    const setFixed = (index: number): void => {
      clearAutoFallbackListeners()
      clearAutoEvaluationTimer()
      isAuto = false
      isAutoEvaluationPending = false
      suppressNextAutoRenderedNotice = false
      pendingAutoEvaluationLabel = null
      autoEvaluationToken += 1
      lastManualDashIndex = index
      dash.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: false } },
          // 手动锁档：不启用 fastSwitch flush，减少切 4K 时的卡顿尖峰
          buffer: { fastSwitchEnabled: false, flushBufferAtTrackSwitch: false },
        },
      })
      // forceReplace=true 确保降档（高→低清晰度）时立即切走，而非仅设置上限等待 ABR 自然下探
      const dashAny = dash as unknown as Record<string, unknown>
      if (typeof dashAny.setQualityFor === 'function') {
        ;(dashAny.setQualityFor as (type: string, index: number, replace: boolean) => void)(
          'video',
          index,
          true
        )
      } else {
        dash.setRepresentationForTypeByIndex('video', index, true)
      }
      // 切到手动清晰度时，自动重置「自动」选项后方的分辨率括号，只显示“自动”
      updateAutoItemLabel()
    }

    try {
      art.setting.add({
        name: SETTING_NAME,
        width: 180,
        html: '清晰度',
        tooltip: initialAutoLabel,
        selector,
        onSelect(item) {
          const dashIndex = (item as { dashIndex?: number }).dashIndex ?? -1
          // 标记手动切档，避免 ABR 事件监听器再弹一次通知
          isManualSwitch = dashIndex >= 0
          const html = (item as { html?: string }).html ?? autoLabel
          if (dashIndex < 0) {
            const pendingLabel = setAuto()
            art.notice.show = `正在评估网络情况...`
            return pendingLabel
          } else {
            setFixed(dashIndex)
            art.notice.show = `清晰度：${html}`
          }
          return html
        },
      })
      built = true
    } catch (error) {
      console.error('[dash] add quality menu failed', error)
    }
  }

  // 清单可能已解析完（如复用缓存），否则等 STREAM_INITIALIZED。
  dash.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, build)
  if (dash.isReady()) build()

  // ABR 决定请求新视频分片时，立刻同步更新“自动(xxx)”文案，让用户感知到最新的网络评估结果
  const onQualityRequested = (e: { mediaType: string; newQuality: number }): void => {
    if (e.mediaType !== 'video') return
    const index = e.newQuality
    const rep = reps.find((r) => r.index === index)
    if (!rep) return
    if (!isAuto || isManualSwitch) return

    suppressNextAutoRenderedNotice = true
    firstQualityChange = false
    const label = resolveLabel(rep)

    if (
      handleAutoEvaluationCandidate(
        index,
        label,
        (finalLabel) => `网络评估完成，智能选择：${finalLabel}`
      )
    ) {
      return
    }

    updateAutoItemLabel(label)
    art.notice.show = `网络评估完成，智能选择：${label}`
  }

  // ABR 自动切换清晰度已渲染时，同步更新 tooltip 并弹提示
  const onQualityChanged = (e: QualityChangeRenderedEvent): void => {
    if (e.mediaType !== 'video') return
    const rep = e.newRepresentation
    if (!rep) return
    const label = resolveLabel(rep)

    // 切回自动后的评估窗口内，dash.js 可能先报告上一个手动档仍在渲染。
    // 这不是新的网络评估结果，不能写回清晰度 tooltip。
    if (
      handleAutoEvaluationCandidate(
        rep.index,
        label,
        (finalLabel) => `网络评估完成，智能选择：${finalLabel}`
      )
    ) {
      return
    }

    // 首个 quality 事件（初始 ABR 选档）：不弹通知，但把 tooltip 从"自动"更新为"自动(720P)"
    // 这样用户拉开设置面板就能看到当前 ABR 所选档位。
    if (firstQualityChange) {
      firstQualityChange = false
      if (isAuto) updateAutoItemLabel(label) // 同步更新 tooltip 与展开菜单中「自动」项文案
      return
    }

    // 手动切档由 onSelect 直接弹通知并更新 tooltip，此处不再重复。
    if (isManualSwitch) {
      isManualSwitch = false
      return
    }
    if (!isAuto) return
    if (suppressNextAutoRenderedNotice) {
      suppressNextAutoRenderedNotice = false
      updateAutoItemLabel(label)
      return
    }

    // ABR 自动升降档：弹通知 + 同步更新 tooltip 与展开菜单中「自动」项文案。
    art.notice.show = `自动切换至 ${label}`
    updateAutoItemLabel(label)
  }

  dash.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_REQUESTED, onQualityRequested)
  dash.on(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityChanged)

  return () => {
    disposed = true
    clearAutoFallbackListeners()
    clearAutoEvaluationTimer()
    try {
      dash.off(dashjs.MediaPlayer.events.STREAM_INITIALIZED, build)
      dash.off(dashjs.MediaPlayer.events.QUALITY_CHANGE_REQUESTED, onQualityRequested)
      dash.off(dashjs.MediaPlayer.events.QUALITY_CHANGE_RENDERED, onQualityChanged)
    } catch {
      // 忽略解绑失败
    }
    try {
      art.setting.remove(SETTING_NAME)
    } catch {
      // 播放器销毁时设置项可能已随之移除，忽略。
    }
  }
}
