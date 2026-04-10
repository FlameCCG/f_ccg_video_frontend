/** 与后端 Resolution2160P 一致，菜单里和「1080p 高清」同一套文案。 */
export const FOUR_K_QUALITY_LABEL = '4k 超高清'

export interface DashQualityRep {
  index: number
  width?: number
  height?: number
  bandwidth?: number
}

export interface DashQualitySourceLabel {
  resolution: string
  bitrate: number
}

const STANDARD_HEIGHTS = new Set([360, 720, 1080])

const parseLabeledHeight = (resolution: string): number => {
  const matched = resolution.trim().match(/^(\d+)[pP]/)
  return matched ? Number(matched[1]) : 0
}

const isFourKLabel = (resolution: string): boolean => {
  const text = resolution.trim()
  return /^4k\b/i.test(text) || /^2160[pP]\b/.test(text)
}

/** 宽 >= 3840 或高 >= 2160 才是 4K。3840×1632 这种宽银幕不能按 1632 去标。 */
const isFourKFrame = (width: number, height: number): boolean => width >= 3840 || height >= 2160

const labelBucket = (resolution: string): string => {
  if (isFourKLabel(resolution)) return '4k'
  const height = parseLabeledHeight(resolution)
  return height > 0 ? `h:${height}` : ''
}

const repBucket = (rep: DashQualityRep): string => {
  const width = rep.width || 0
  const height = rep.height || 0
  if (isFourKFrame(width, height)) return '4k'
  return height > 0 ? `h:${height}` : ''
}

export const fallbackDashQualityLabel = (rep: DashQualityRep): string => {
  const width = rep.width || 0
  const height = rep.height || 0
  if (isFourKFrame(width, height)) return FOUR_K_QUALITY_LABEL
  if (height) return `${height}P`
  if (rep.bandwidth) return `${Math.round(rep.bandwidth / 1000)} kbps`
  return `清晰度 ${rep.index + 1}`
}

/**
 * 把 DASH 档和后端 MP4 清晰度文案对齐。
 * 同档按码率从高到低一一对应，例如两档 1080 分别对上「高码率」和「高清」。
 * 「4k 超高清」没有数字高度，宽银幕 4K 的像素高也不是 2160，所以单独归到 4K 档。
 */
export const matchDashQualityLabels = (
  reps: DashQualityRep[],
  labels: DashQualitySourceLabel[]
): Map<number, string> => {
  const result = new Map<number, string>()
  const labelsByBucket = new Map<string, DashQualitySourceLabel[]>()
  for (const label of labels) {
    const bucket = labelBucket(label.resolution)
    if (!bucket) continue
    const list = labelsByBucket.get(bucket) ?? []
    list.push(label)
    labelsByBucket.set(bucket, list)
  }
  for (const list of labelsByBucket.values()) {
    list.sort((left, right) => right.bitrate - left.bitrate)
  }

  const repsByBucket = new Map<string, DashQualityRep[]>()
  for (const rep of reps) {
    const bucket = repBucket(rep)
    const list = repsByBucket.get(bucket) ?? []
    list.push(rep)
    repsByBucket.set(bucket, list)
  }
  for (const list of repsByBucket.values()) {
    list.sort((left, right) => (right.bandwidth || 0) - (left.bandwidth || 0))
  }

  const used = new Set<DashQualitySourceLabel>()
  for (const [bucket, dashReps] of repsByBucket) {
    const bucketLabels = labelsByBucket.get(bucket) ?? []
    for (let i = 0; i < dashReps.length; i++) {
      const rep = dashReps[i]!
      const matched = bucketLabels[i]
      if (matched) {
        used.add(matched)
        result.set(rep.index, matched.resolution)
      } else {
        result.set(rep.index, fallbackDashQualityLabel(rep))
      }
    }
  }

  // dash.js 还没带上 width 时，1632 这类非标准高度对不上「4k 超高清」。
  // 只把还没用掉的 4K 文案交给最高的非标准高度档。
  const unusedFourK = (labelsByBucket.get('4k') ?? []).filter((label) => !used.has(label))
  if (unusedFourK.length === 0) return result

  const candidates = reps
    .filter((rep) => {
      const height = rep.height || 0
      const current = result.get(rep.index)
      const stillFallback = current === undefined || current === fallbackDashQualityLabel(rep)
      return (
        stillFallback &&
        height >= 1600 &&
        !STANDARD_HEIGHTS.has(height) &&
        !isFourKFrame(rep.width || 0, height)
      )
    })
    .sort(
      (left, right) =>
        (right.height || 0) - (left.height || 0) || (right.bandwidth || 0) - (left.bandwidth || 0)
    )

  for (let i = 0; i < unusedFourK.length && i < candidates.length; i++) {
    result.set(candidates[i]!.index, unusedFourK[i]!.resolution)
  }

  return result
}
