import { marked, type MarkedOptions, type Tokens } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { resolveAiAssetUrl } from '@/api/ai'

export const markdownSanitizeOptions = {
  // class 必须保留，否则 hljs 的 span.hljs-* 会被洗掉，看起来像“没高亮”
  ADD_ATTR: ['referrerpolicy', 'data-copy-code', 'aria-label', 'type', 'class'],
  ADD_TAGS: ['button'],
}

const encodeCopyPayload = (content: string) => encodeURIComponent(content)

const escapeHtml = (content: string) =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** 常见 fence 别名 → highlight.js language id */
const LANG_ALIASES: Record<string, string> = {
  rs: 'rust',
  rustlang: 'rust',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  python3: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  csharp: 'csharp',
  'c#': 'csharp',
  cs: 'csharp',
  'c++': 'cpp',
  hpp: 'cpp',
  h: 'c',
  golang: 'go',
  kt: 'kotlin',
  rb: 'ruby',
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  vue: 'xml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  plaintext: 'plaintext',
  text: 'plaintext',
  txt: 'plaintext',
}

const normalizeLangId = (lang?: string | null): string => {
  if (!lang) return ''
  const cleaned =
    lang
      .trim()
      .toLowerCase()
      .split(/[\s,:|/]/)[0] || ''
  const key = cleaned.replace(/[^\w#+.-]/g, '')
  if (!key) return ''
  return LANG_ALIASES[key] || key
}

const highlightCode = (text: string, lang?: string | null) => {
  const resolved = normalizeLangId(lang)

  if (resolved && resolved !== 'plaintext' && hljs.getLanguage(resolved)) {
    try {
      return {
        html: hljs.highlight(text, { language: resolved, ignoreIllegals: true }).value,
        language: resolved,
      }
    } catch {
      // fall through
    }
  }

  // 无语言 / 未知语言：自动识别（限制长度，避免超大块卡顿）
  if (text.length > 0 && text.length <= 12000) {
    try {
      const result = hljs.highlightAuto(text)
      if (result.language && result.value) {
        return { html: result.value, language: result.language }
      }
    } catch {
      // fall through
    }
  }

  return { html: escapeHtml(text), language: resolved || 'plaintext' }
}

let markedConfigured = false

const configureMarked = () => {
  if (markedConfigured) return
  markedConfigured = true

  marked.setOptions({
    breaks: true,
    gfm: true,
  } satisfies MarkedOptions)

  marked.use({
    renderer: {
      code(token: Tokens.Code) {
        const { text, lang } = token
        const { html: highlighted, language } = highlightCode(text, lang)
        const safeLanguage = (language || 'plaintext').replace(/[^\w-]/g, '') || 'plaintext'
        const languageLabel = safeLanguage === 'plaintext' ? 'TEXT' : safeLanguage.toUpperCase()
        const encodedPayload = encodeCopyPayload(text)

        return `
        <div class="ai-code-block">
          <div class="ai-code-toolbar">
            <span class="ai-code-language">${escapeHtml(languageLabel)}</span>
            <button
              type="button"
              class="ai-code-copy flex items-center justify-center rounded-md p-1.5 hover:bg-[var(--glass-border)] transition-colors group/copy"
              data-copy-code="${encodedPayload}"
              title="复制代码"
              aria-label="复制代码"
            ><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover/copy:text-[var(--brand-blue)] transition-colors"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
          </div>
          <pre><code class="hljs language-${safeLanguage}">${highlighted}</code></pre>
        </div>
      `
      },
      image(token: Tokens.Image) {
        const { href, title, text } = token
        const resolved = resolveAiAssetUrl(href || '')
        let out = `<img src="${resolved}" alt="${text || ''}"`
        if (title) {
          out += ` title="${title}"`
        }
        out += ` referrerpolicy="no-referrer" loading="lazy" decoding="async" />`
        return out
      },
    },
  })
}

export const renderMarkdownHtml = (text: string, _options?: { streaming?: boolean }): string => {
  if (!text) return ''
  configureMarked()

  try {
    const rawHtml = marked.parse(text)
    return DOMPurify.sanitize(rawHtml as string, markdownSanitizeOptions)
  } catch {
    return escapeHtml(text).replace(/\n/g, '<br>')
  }
}

/** 极轻量流式展示：不跑 marked/hljs，仅转义 + 换行 */
export const renderStreamingPlainHtml = (text: string): string => {
  if (!text) return ''
  return escapeHtml(text).replace(/\n/g, '<br>')
}
