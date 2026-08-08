/**
 * 媒体资源地址解析（对外契约：后端一律返回根相对路径，host 由前端按环境拼接）。
 *
 * 规则：
 *  - 空值 / 'null' / 'undefined' 字符串 → 原样返回（由组件兜底态处理）；
 *  - http(s)://、data:、// 协议相对 等已携带访问信息的地址 → 原样返回
 *    （含历史存量数据中的绝对 URL，兼容不改库）；
 *  - 其余（如 /user_files/...、/uploads/...）→ 拼接 VITE_MEDIA_BASE（默认空 = 同源）。
 */
const ABSOLUTE_URL_RE = /^(?:https?:|data:|blob:|file:|\/\/)/i

export function resolveMediaUrl(url: string | null | undefined): string {
  const candidate = String(url ?? '').trim()
  if (!candidate || /^(null|undefined)$/i.test(candidate)) return ''

  if (ABSOLUTE_URL_RE.test(candidate)) return candidate

  const base = (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.trim() ?? ''
  if (!base) return candidate

  return `${base.replace(/\/+$/, '')}/${candidate.replace(/^\/+/, '')}`
}
