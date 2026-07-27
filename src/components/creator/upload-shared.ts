/**
 * 投稿页共享契约：类型 + 状态元表 + 传输量格式化。
 *
 * 抽出来的原因有两个：
 * 1) Upload.vue 原来是 2340 行单组件，进度每 1% 写一次就要 patch 整棵树；
 *    拆子组件后需要一份共享的类型定义，否则 props 只能写 any。
 * 2) 九个上传状态原来靠模板里两坨 `:class` 三元硬拼，改一个状态要动两处、
 *    而且视觉上 hashing/merging、pending/paused/canceled 完全分不出来。
 *    统一收进 PART_STATUS_META：颜色走 tone、形态走 indeterminate、语义走 icon。
 */
import type { Component } from 'vue'
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  Fingerprint,
  Merge,
  Pause,
  Radar,
  UploadCloud,
} from 'lucide-vue-next'

export type VideoPartStatus =
  | 'pending'
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'merging'
  | 'success'
  | 'error'
  | 'canceled'
  | 'paused'

export interface VideoPart {
  id: string
  file: File
  /** 源文件名（含扩展名），与分P标题分离，发布时作为 fileName 提交 */
  sourceFileName: string
  /** 分P标题；仅多P时可编辑，单P时不展示/不提交 */
  title: string
  progress: number
  status: VideoPartStatus
  hash: string
  filePath: string
  instant: boolean
  /** 已确认落盘的字节数（含断点续传时服务端已有的分片），仅用于 UI 展示 */
  uploadedBytes: number
  /** EMA 平滑后的传输速度（B/s），0 表示尚未测到 */
  speedBps: number
  /** 预计剩余时间（ms），0 表示未知 */
  etaMs: number
  errorMessage?: string
  abortController?: AbortController
}

export interface VideoWorkForm {
  title: string
  description: string
  partitionId: number | undefined
  tags: string[]
  tagInput: string
  isOriginal: boolean
  isPrivate: boolean
  publishType: 'immediate' | 'scheduled'
  publishTime: string
}

export type WorkPublishState = 'idle' | 'publishing' | 'done' | 'failed'

export interface VideoWork {
  id: string
  parts: VideoPart[]
  form: VideoWorkForm
  coverFile: File | null
  coverPreview: string
  currentCoverUrl: string
  coverSource: 'none' | 'auto' | 'manual'
  publishState: WorkPublishState
}

/** 每个作品的待办项，供检查清单 / 字段 inline 错误 / tab 状态点共用 */
export interface WorkIssues {
  noParts: boolean
  uploading: boolean
  failed: boolean
  title: boolean
  partition: boolean
  cover: boolean
}

export const hasBlockingIssue = (issues: WorkIssues) =>
  issues.noParts ||
  issues.uploading ||
  issues.failed ||
  issues.title ||
  issues.partition ||
  issues.cover

/**
 * tone 决定颜色通道，indeterminate 决定形态通道（扫光 vs 定量填充）。
 * 两个通道加起来才能让九个状态互相区分 —— 只靠颜色的话，
 * 色觉障碍用户与「amber 和 amber」这类相邻状态一样是分不出来的。
 */
export type PartTone = 'idle' | 'active' | 'prepare' | 'probe' | 'hold' | 'danger' | 'done'

export interface PartStatusMeta {
  label: string
  tone: PartTone
  icon: Component
  /** true = 无法给出百分比，进度条走扫光而不是定量填充 */
  indeterminate: boolean
}

export const PART_STATUS_META: Record<VideoPartStatus, PartStatusMeta> = {
  pending: { label: '排队中', tone: 'idle', icon: Clock3, indeterminate: false },
  hashing: { label: '计算文件指纹', tone: 'prepare', icon: Fingerprint, indeterminate: false },
  checking: { label: '秒传检测', tone: 'probe', icon: Radar, indeterminate: true },
  uploading: { label: '上传中', tone: 'active', icon: UploadCloud, indeterminate: false },
  merging: { label: '合并分片', tone: 'prepare', icon: Merge, indeterminate: true },
  success: { label: '上传完成', tone: 'done', icon: CheckCircle2, indeterminate: false },
  error: { label: '上传失败', tone: 'danger', icon: AlertTriangle, indeterminate: false },
  canceled: { label: '已取消', tone: 'idle', icon: CircleSlash2, indeterminate: false },
  paused: { label: '已暂停', tone: 'hold', icon: Pause, indeterminate: false },
}

/** 正在占用上传队列的状态 */
export const BUSY_PART_STATUSES: VideoPartStatus[] = [
  'pending',
  'hashing',
  'checking',
  'uploading',
  'merging',
]

export const isBusyPartStatus = (status: VideoPartStatus) => BUSY_PART_STATUSES.includes(status)

/**
 * 状态用 data-* 属性表达（CSS 按 [data-x] 选择，与 reka-ui 的 data-state 同一套语言），
 * 但 vue-tsc 的 strictTemplates 下 HTMLAttributes 没有 data-* 索引签名，
 * 直接写 `:data-tone="x"` 会报 TS2353。统一走 `v-bind="dataAttrs({...})"`。
 */
export const dataAttrs = (
  attrs: Record<string, string | undefined>
): Record<string, string | undefined> => attrs

/** 发布前检查清单可跳转的字段锚点 */
export type ChecklistField = 'parts' | 'title' | 'partition' | 'cover'

/** SegmentedChoice 的选项契约 */
export interface SegmentedOption<V> {
  value: V
  label: string
  icon?: Component
  hint?: string
  disabled?: boolean
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'

  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = unitIndex === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex] ?? 'B'}`
}

export const formatSpeed = (bytesPerSecond: number): string => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return ''
  return `${formatBytes(bytesPerSecond)}/s`
}

export const formatEta = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return ''

  const totalSeconds = Math.round(milliseconds / 1000)
  if (totalSeconds < 10) return '即将完成'
  if (totalSeconds < 60) return `约 ${totalSeconds} 秒`

  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) {
    const seconds = totalSeconds % 60
    return seconds > 0 ? `约 ${minutes} 分 ${seconds} 秒` : `约 ${minutes} 分钟`
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `约 ${hours} 小时 ${restMinutes} 分` : `约 ${hours} 小时`
}
