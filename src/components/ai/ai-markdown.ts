import { Marked, type Tokens } from 'marked'
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

  if (resolved === 'plaintext' || text.length > 12000) {
    return { html: escapeHtml(text), language: resolved || 'plaintext' }
  }

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

const createMarkdownParser = (streaming: boolean) => {
  const parser = new Marked({
    breaks: true,
    gfm: true,
  })

  parser.use({
    renderer: {
      code(token: Tokens.Code) {
        const { text, lang } = token
        const { html: highlighted, language } = streaming
          ? { html: escapeHtml(text), language: normalizeLangId(lang) }
          : highlightCode(text, lang)
        const safeLanguage = (language || 'plaintext').replace(/[^\w-]/g, '') || 'plaintext'
        const languageLabel = safeLanguage === 'plaintext' ? 'TEXT' : safeLanguage.toUpperCase()
        const encodedPayload = encodeCopyPayload(text)

        return `
        <div class="ai-code-block">
          <div class="ai-code-toolbar">
            <span class="ai-code-language">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6m6-14-4 16"/></svg>
              <span>${escapeHtml(languageLabel)}</span>
            </span>
            <button
              type="button"
              class="ai-code-copy"
              data-copy-code="${encodedPayload}"
              title="复制代码"
              aria-label="复制代码"
            >
              <span class="ai-code-copy-icons" aria-hidden="true">
                <svg class="ai-code-copy-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/></svg>
                <svg class="ai-code-check-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>
              </span>
              <span class="ai-code-copy-label" aria-live="polite">复制</span>
            </button>
          </div>
          <pre><code class="hljs language-${safeLanguage}">${highlighted}</code></pre>
        </div>
      `
      },
      image(token: Tokens.Image) {
        const { href, title, text } = token
        const resolved = resolveAiAssetUrl(href || '')
        let out = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(text || '')}"`
        if (title) {
          out += ` title="${escapeHtml(title)}"`
        }
        out += ` referrerpolicy="no-referrer" loading="lazy" decoding="async" />`
        return out
      },
    },
  })
  return parser
}

const streamingParser = createMarkdownParser(true)
const completeParser = createMarkdownParser(false)

export const renderMarkdownHtml = (text: string, options?: { streaming?: boolean }): string => {
  if (!text) return ''

  try {
    const rawHtml = (options?.streaming ? streamingParser : completeParser).parse(text)
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
