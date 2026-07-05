<script setup lang="ts">
import { ref, reactive, nextTick, watch, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Send, X, Download, Loader2, Bot, Settings2, UploadCloud } from 'lucide-vue-next'
import {
  fetchAiChatStream,
  resolveAiAssetUrl,
  aiGenerateImage,
  aiEditImage,
  aiGenerateVideo,
  aiGetVideoStatus,
  type AiImageGenParams,
  type AiImageEditParams,
  type AiVideoGenParams,
} from '@/api/ai'
import { toast } from 'vue-sonner'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import ImageViewer from '@/components/common/ImageViewer.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useCreatorBridgeStore } from '@/stores/creatorBridge'
import { useAuthStore } from '@/stores/auth'
import { buildAiSuggestedTitle, fetchAiAssetAsFile } from '@/utils/ai-assets'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'default' | 'cover-picker'
    initialModel?: ModelType
    initialPrompt?: string
  }>(),
  {
    mode: 'default',
    initialModel: 'text',
    initialPrompt: '',
  }
)
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (
    e: 'cover-pick',
    payload: { file: File; sourceUrl: string; prompt: string; mimeType?: string }
  ): void
}>()

const router = useRouter()
const creatorBridgeStore = useCreatorBridgeStore()
const authStore = useAuthStore()

// Model Types
type ModelType = 'text' | 'image' | 'video'
const activeModel = ref<ModelType>('text')
const isCoverPickerMode = computed(() => props.mode === 'cover-picker')
const showVideoSubmitAction = computed(() => props.mode === 'default')

// Chat history
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'image_gen' | 'video_gen'
  content?: string
  sourcePrompt?: string
  reasoningContent?: string
  images?: string[] // pasted image urls
  // Placeholder/Result fields
  isLoading?: boolean
  progress?: number // for video percentage
  results?: { url: string; mime_type?: string; duration?: number; error?: string }[]
  error?: string
}

interface VideoResultItem {
  title: string
  href: string
  description: string
}

const messages = ref<ChatMessage[]>([
  {
    id: 'init-1',
    role: 'assistant',
    type: 'text',
    content: '',
    isLoading: true,
  },
])

const inputContent = ref('')
const isSending = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)
const previewImageUrl = ref('')
const showPreviewImage = ref(false)
const activeAssetActionKey = ref<string | null>(null)
const hasStreamedIntro = ref(false)
let introStreamTimer: number | null = null

const INITIAL_GREETING =
  '你好，我可以帮你找站内视频、整理灵感、生成图像与视频提示，也可以直接继续聊天。'

const markdownSanitizeOptions = {
  ADD_ATTR: ['referrerpolicy', 'data-copy-code', 'aria-label', 'type'],
  ADD_TAGS: ['button'],
}

// Pasted media
const pastedImages = ref<{ url: string; file: File }[]>([])

// Advanced form state
const imgModel = ref('doubao-seedream-5-0-lite-260128')
const imgResolution = ref('2k')
const imgRatio = ref('16:9')
const imgCount = ref(1)

const vidModel = ref('doubao-seedance-1-5-pro-251215')
const vidResolution = ref('720p')
const vidRatio = ref('16:9')
const vidDuration = ref(8)

const IMAGE_MODEL_OPTIONS = [
  { label: 'Seedream 5.0 Lite', value: 'doubao-seedream-5-0-lite-260128' },
  { label: 'Seedream 4.5', value: 'doubao-seedream-4-5-251128' },
] as const
const VIDEO_MODEL_OPTIONS = [
  { label: 'Seedance 1.5 Pro', value: 'doubao-seedance-1-5-pro-251215' },
  { label: 'Seedance 1.0 Fast', value: 'doubao-seedance-1-0-pro-fast-251015' },
] as const
const IMAGE_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const
const IMAGE_RESOLUTION_OPTIONS = ['1k', '2k', '3k', '4k'] as const
const VIDEO_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const

const showSettings = ref(false)
const isSingleImageEdit = () => activeModel.value === 'image' && pastedImages.value.length === 1
const isReferenceVideoMode = () => activeModel.value === 'video' && pastedImages.value.length > 1
const isFastVideoModel = () => vidModel.value === 'doubao-seedance-1-0-pro-fast-251015'
const videoDurationMax = () => (isReferenceVideoMode() ? 10 : isFastVideoModel() ? 12 : 15)

// Focus/Blur helpers
const handleClose = () => {
  emit('update:open', false)
}

const openImagePreview = (url: string) => {
  if (!url) return
  previewImageUrl.value = url
  showPreviewImage.value = true
}

const beginAssetAction = (key: string) => {
  activeAssetActionKey.value = key
}

const endAssetAction = (key: string) => {
  if (activeAssetActionKey.value === key) {
    activeAssetActionKey.value = null
  }
}

const isAssetActionBusy = (key: string) => activeAssetActionKey.value === key

// --- Throttled auto-scroll (RAF-based, ~60 fps) ---
let scrollRafId: number | null = null
const scheduleScroll = () => {
  if (scrollRafId !== null) return // already scheduled
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
    }
  })
}

// Legacy helper kept for explicit places
const scrollToBottom = async () => {
  await nextTick()
  scheduleScroll()
}

// --- Throttled markdown render cache (RAF-based) ---
// Maps message id → rendered HTML string. Updated at display-rate, not chunk-rate.
const renderedHtmlMap = reactive<Record<string, string>>({})
// Track which IDs have a pending RAF update
const pendingRenderIds = new Set<string>()

const scheduleRender = (msgId: string, rawContent: string) => {
  // Stash the latest raw content for this id
  pendingRenderRaw[msgId] = rawContent
  if (pendingRenderIds.has(msgId)) return
  pendingRenderIds.add(msgId)
  requestAnimationFrame(() => {
    pendingRenderIds.delete(msgId)
    const text = extractVideoResults(pendingRenderRaw[msgId] ?? '').content
    delete pendingRenderRaw[msgId]
    try {
      const rawHtml = marked.parse(text)
      renderedHtmlMap[msgId] = DOMPurify.sanitize(rawHtml as string, markdownSanitizeOptions)
    } catch {
      renderedHtmlMap[msgId] = text
    }
    scheduleScroll()
  })
}
const pendingRenderRaw: Record<string, string> = {}

const VIDEO_RESULTS_BLOCK_RE = /\[video_results\]([\s\S]*?)\[\/video_results\]/gi
const VIDEO_RESULT_LINE_RE = /-\s*\[([^\]]+)\]\((\/video\/[^)]+)\)\s*[：:]\s*(.+)$/i

const extractVideoResults = (content: string) => {
  const items: VideoResultItem[] = []
  const cleaned = content.replace(VIDEO_RESULTS_BLOCK_RE, (_, block: string) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      const matched = line.match(VIDEO_RESULT_LINE_RE)
      if (!matched) continue
      items.push({
        title: matched[1]!.trim(),
        href: matched[2]!.trim(),
        description: matched[3]!.trim(),
      })
    }

    return ''
  })

  const normalized = cleaned.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '')

  return {
    content: normalized,
    items,
  }
}

const getVideoResults = (msg: ChatMessage) => {
  return extractVideoResults(msg.content ?? '').items
}

const getPrimaryContent = (msg: ChatMessage) => {
  return extractVideoResults(msg.content ?? '').content
}

const goToVideoResult = async (href: string) => {
  if (!href) return
  emit('update:open', false)
  await router.push(href)
}

// Render helper used in template — returns cached HTML or triggers async render
const getRenderedHtml = (msg: ChatMessage) => {
  const text = getPrimaryContent(msg)
  if (!text) return '<span class="inline-block animate-pulse w-2 h-4 bg-zinc-400"></span>'
  // If we have a cached version, return it (may be slightly stale during streaming)
  if (renderedHtmlMap[msg.id] !== undefined) {
    return renderedHtmlMap[msg.id]
  }
  // First render — do it synchronously so there's no blank flash
  try {
    const rawHtml = marked.parse(text)
    const html = DOMPurify.sanitize(rawHtml as string, markdownSanitizeOptions)
    renderedHtmlMap[msg.id] = html
    return html
  } catch {
    return text
  }
}

const encodeCopyPayload = (content: string) => encodeURIComponent(content)

const decodeCopyPayload = (content: string) => decodeURIComponent(content)

const escapeHtml = (content: string) =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const clearIntroStream = () => {
  if (introStreamTimer !== null) {
    window.clearInterval(introStreamTimer)
    introStreamTimer = null
  }
}

const streamInitialGreeting = () => {
  if (hasStreamedIntro.value) return
  const introMessage = messages.value.find((msg) => msg.id === 'init-1')
  if (!introMessage) return

  const chars = Array.from(INITIAL_GREETING)
  let cursor = 0

  introMessage.content = ''
  introMessage.isLoading = true
  scheduleRender(introMessage.id, '')
  clearIntroStream()

  introStreamTimer = window.setInterval(() => {
    cursor = Math.min(chars.length, cursor + (cursor < 10 ? 2 : 3))
    introMessage.content = chars.slice(0, cursor).join('')
    scheduleRender(introMessage.id, introMessage.content)

    if (cursor >= chars.length) {
      introMessage.isLoading = false
      hasStreamedIntro.value = true
      clearIntroStream()
      scheduleRender(introMessage.id, introMessage.content)
    }
  }, 42)
}

const handleAssistantMarkupClick = async (event: MouseEvent) => {
  const target = event.target as HTMLElement | null
  const copyButton = target?.closest<HTMLButtonElement>('[data-copy-code]')
  if (!copyButton) return

  event.preventDefault()
  event.stopPropagation()

  const encoded = copyButton.dataset.copyCode
  if (!encoded) return

  try {
    await navigator.clipboard.writeText(decodeCopyPayload(encoded))
    copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[var(--status-success-ink)]"><path d="M20 6 9 17l-5-5"/></svg>`
    copyButton.dataset.copied = 'true'
    toast.success('代码已复制')
    window.setTimeout(() => {
      if (!document.contains(copyButton)) return
      copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover/copy:text-[var(--brand-blue)] transition-colors"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
      copyButton.dataset.copied = 'false'
    }, 1400)
  } catch {
    toast.error('复制失败')
  }
}

watch(
  messages,
  () => {
    scheduleScroll()
  },
  { deep: true }
)

onBeforeUnmount(() => {
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId)
  clearIntroStream()
})

watch(
  () => props.open,
  (val) => {
    if (val) {
      activeModel.value = props.initialModel
      if (props.initialPrompt) {
        inputContent.value = props.initialPrompt
      }
      if (isCoverPickerMode.value) {
        activeModel.value = 'image'
      }
      if (!hasStreamedIntro.value) {
        streamInitialGreeting()
      }
      void scrollToBottom()
    } else {
      showPreviewImage.value = false
      previewImageUrl.value = ''
    }
  },
  { immediate: true }
)

watch(
  imgCount,
  (count) => {
    if (count < 1) imgCount.value = 1
    if (count > 15) imgCount.value = 15
  },
  { immediate: true }
)

watch(
  [vidDuration, vidModel, () => pastedImages.value.length],
  () => {
    if (vidDuration.value < 1) vidDuration.value = 1
    const max = videoDurationMax()
    if (vidDuration.value > max) vidDuration.value = max
  },
  { immediate: true }
)

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

marked.use({
  renderer: {
    code(token: { text: string; lang?: string }) {
      const { text, lang } = token
      const safeLanguage = (lang || 'plaintext').replace(/[^\w-]/g, '') || 'plaintext'
      const languageLabel = safeLanguage === 'plaintext' ? 'TEXT' : safeLanguage.toUpperCase()
      const encodedPayload = encodeCopyPayload(text)
      let highlighted = escapeHtml(text)
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(text, { language: lang }).value
        } catch {
          // Fallback to plain code on highlight error
        }
      }
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
    image(token: { href: string; title: string | null; text: string }) {
      const { href, title, text } = token
      const resolved = resolveAiAssetUrl(href)
      let out = `<img src="${resolved}" alt="${text || ''}"`
      if (title) {
        out += ` title="${title}"`
      }
      out += ` referrerpolicy="no-referrer" />`
      return out
    },
  },
})

// Handle Paste Images
const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item && item.type.indexOf('image') !== -1) {
      const file = item.getAsFile()
      if (file) {
        if (pastedImages.value.length >= 7) {
          toast.warning('最多只能选取7张图片')
          continue
        }
        const url = URL.createObjectURL(file)
        pastedImages.value.push({ url, file })
      }
    }
  }
}

const removePastedImage = (index: number) => {
  const item = pastedImages.value[index]
  if (item) {
    URL.revokeObjectURL(item.url)
    pastedImages.value.splice(index, 1)
  }
}

const b64EncodeFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('转换图片失败'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const encodeImageForAI = async (file: File): Promise<string> => {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('读取图片失败'))
      img.src = objectUrl
    })

    const maxDimension = 1536
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('初始化图片画布失败')
    }

    ctx.drawImage(image, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', 0.92)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const downloadAsset = async (url: string, filename: string) => {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  } catch {
    openExternal(url)
    toast.error('下载失败，已尝试打开原始链接')
  }
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

const openExternal = (url: string) => {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

const makeAssetActionKey = (messageId: string, resultIndex: number, kind: string) => {
  return `${messageId}:${resultIndex}:${kind}`
}

const handleOneClickSubmit = async (
  messageId: string,
  resultIndex: number,
  resultUrl: string,
  prompt: string
) => {
  const actionKey = makeAssetActionKey(messageId, resultIndex, 'submit')
  beginAssetAction(actionKey)
  try {
    const title = buildAiSuggestedTitle(prompt || 'AI 视频作品', 'AI 视频作品')
    const file = await fetchAiAssetAsFile(resultUrl, title, 'mp4')
    creatorBridgeStore.setPendingVideoImport({
      id: `ai-video-${Date.now()}`,
      file,
      title,
      prompt,
      sourceUrl: resultUrl,
    })
    emit('update:open', false)
    await router.push({ name: 'creator-upload' })
    toast.success('已跳转投稿页并开始准备上传')
  } catch (error) {
    console.error('One-click creator submit failed', error)
    toast.error('一键投稿失败')
  } finally {
    endAssetAction(actionKey)
  }
}

const handleCoverPick = async (
  messageId: string,
  resultIndex: number,
  resultUrl: string,
  prompt: string,
  mimeType?: string
) => {
  const actionKey = makeAssetActionKey(messageId, resultIndex, 'cover')
  beginAssetAction(actionKey)
  try {
    const file = await fetchAiAssetAsFile(
      resultUrl,
      buildAiSuggestedTitle(prompt || 'AI 封面', 'AI 封面'),
      mimeType?.includes('png') ? 'png' : 'jpg'
    )
    emit('cover-pick', { file, sourceUrl: resultUrl, prompt, mimeType })
  } catch (error) {
    console.error('AI cover pick failed', error)
    toast.error('封面导入失败')
  } finally {
    endAssetAction(actionKey)
  }
}

const MEDIA_URL_KEYS = [
  'url',
  'image_url',
  'imageUrl',
  'video_url',
  'videoUrl',
  'download_url',
  'downloadUrl',
  'result_url',
  'resultUrl',
  'asset_url',
  'assetUrl',
  'source_url',
  'sourceUrl',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const isVolcAssetUrl = (url: string) =>
  url.includes('volces.com') ||
  url.includes('volcengine.com') ||
  url.includes('byteimg.com') ||
  url.includes('bytedance.com')

const looksLikeVideoUrl = (url: string, key = '') => {
  const lowerKey = key.toLowerCase()
  const lowerUrl = url.toLowerCase()
  return (
    lowerKey.includes('video') ||
    /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(lowerUrl) ||
    lowerUrl.includes('vidgen.x.ai') ||
    (isVolcAssetUrl(lowerUrl) && !lowerKey.includes('image'))
  )
}

const looksLikeImageUrl = (url: string, key = '') => {
  const lowerKey = key.toLowerCase()
  const lowerUrl = url.toLowerCase()
  return (
    lowerKey.includes('image') ||
    /^data:image\//i.test(lowerUrl) ||
    /\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|$)/i.test(lowerUrl) ||
    lowerUrl.includes('imgen.x.ai') ||
    (isVolcAssetUrl(lowerUrl) && !lowerKey.includes('video'))
  )
}

const pushMediaResult = (
  bucket: { url: string; mime_type?: string; duration?: number }[],
  seen: Set<string>,
  rawUrl: unknown,
  mode: 'image' | 'video',
  hintKey = '',
  mimeType?: unknown,
  duration?: unknown
) => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  if (!url || seen.has(url)) return
  if (mode === 'image' && !looksLikeImageUrl(url, hintKey)) return
  if (mode === 'video' && !looksLikeVideoUrl(url, hintKey)) return

  seen.add(url)
  bucket.push({
    url: resolveAiAssetUrl(url),
    mime_type: typeof mimeType === 'string' ? mimeType : undefined,
    duration: typeof duration === 'number' ? duration : undefined,
  })
}

const extractMediaResults = (payload: unknown, mode: 'image' | 'video') => {
  const results: { url: string; mime_type?: string; duration?: number }[] = []
  const seenUrls = new Set<string>()
  const visited = new WeakSet<object>()

  const walk = (node: unknown, parentKey = '', depth = 0) => {
    if (depth > 8 || node == null) return

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, parentKey, depth + 1))
      return
    }

    if (!isRecord(node)) return
    if (visited.has(node)) return
    visited.add(node)

    const maybeMimeType = node.mime_type
    const maybeDuration = node.duration

    for (const key of MEDIA_URL_KEYS) {
      if (key in node) {
        pushMediaResult(
          results,
          seenUrls,
          node[key],
          mode,
          `${parentKey}.${key}`,
          maybeMimeType,
          maybeDuration
        )
      }
    }

    if (mode === 'image' && typeof node.b64_json === 'string' && node.b64_json.trim()) {
      const dataUrl = `data:image/png;base64,${node.b64_json.trim()}`
      if (!seenUrls.has(dataUrl)) {
        seenUrls.add(dataUrl)
        results.push({
          url: dataUrl,
          mime_type: typeof node.mime_type === 'string' ? node.mime_type : 'image/png',
        })
      }
    }

    for (const [key, value] of Object.entries(node)) {
      walk(value, key, depth + 1)
    }
  }

  walk(payload)
  return results
}

const extractRequestId = (payload: unknown): string => {
  if (!isRecord(payload)) return ''
  const direct =
    payload.request_id ||
    payload.requestId ||
    payload.id ||
    payload.video_request_id ||
    payload.job_id
  if (typeof direct === 'string') return direct
  if (isRecord(payload.data)) return extractRequestId(payload.data)
  if (isRecord(payload.result)) return extractRequestId(payload.result)
  return ''
}

const extractVideoStatus = (payload: unknown): string => {
  if (!isRecord(payload)) return ''
  const direct = payload.status || payload.state || payload.phase
  if (typeof direct === 'string') return direct.toLowerCase()
  if (isRecord(payload.video)) {
    const nested = extractVideoStatus(payload.video)
    if (nested) return nested
  }
  if (isRecord(payload.data)) return extractVideoStatus(payload.data)
  if (isRecord(payload.result)) return extractVideoStatus(payload.result)
  return ''
}

const extractVideoProgress = (payload: unknown): number | undefined => {
  if (!isRecord(payload)) return undefined
  const direct = payload.progress ?? payload.percentage ?? payload.percent
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  if (isRecord(payload.video)) {
    const nested = extractVideoProgress(payload.video)
    if (nested !== undefined) return nested
  }
  if (isRecord(payload.data)) return extractVideoProgress(payload.data)
  if (isRecord(payload.result)) return extractVideoProgress(payload.result)
  return undefined
}

const markMediaResultError = (message: ChatMessage, index: number, fallbackText: string) => {
  const item = message.results?.[index]
  if (!item) return
  item.error = fallbackText
}

const sendRequest = async () => {
  if (!inputContent.value.trim() && pastedImages.value.length === 0) return
  if (isSending.value) return

  const userText = inputContent.value.trim()
  const currentImages = [...pastedImages.value]

  // Clear input
  inputContent.value = ''
  pastedImages.value = []
  isSending.value = true

  // push user message
  const userMsgId = Date.now().toString()
  messages.value.push({
    id: userMsgId,
    role: 'user',
    type: 'text',
    content: userText,
    images: currentImages.map((img) => img.url),
  })

  try {
    if (activeModel.value === 'text') {
      const assistantMsgId = `asst-${Date.now()}`
      const asstMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        type: 'text',
        content: '',
        reasoningContent: '',
        isLoading: true,
      }
      messages.value.push(asstMsg)
      // Retrieve the reactive proxy from the array to ensure Vue tracks mutations
      const reactiveAsstMsg = messages.value[messages.value.length - 1]!

      const payloadInput: Record<string, unknown>[] = []
      for (const msg of messages.value) {
        if (msg.isLoading) continue
        if (msg.role === 'assistant' && msg.id !== assistantMsgId) {
          payloadInput.push({ role: 'assistant', content: msg.content })
        } else if (msg.role === 'user') {
          const contentParts: Record<string, unknown>[] = []
          if (msg.content) contentParts.push({ type: 'input_text', text: msg.content })
          if (contentParts.length) {
            payloadInput.push({ role: 'user', content: contentParts })
          }
        }
      }

      // Since it's heavy to encode history images, let's just encode the CURRENT one to b64
      const latestInput: Record<string, unknown>[] = []
      if (userText) latestInput.push({ type: 'input_text', text: userText })
      for (const f of currentImages) {
        const b64 = await b64EncodeFile(f.file)
        latestInput.push({ type: 'input_image', image_url: b64, detail: 'high' })
      }

      // simplify history just for this prompt to avoid large payloads while testing
      const finalInput = [{ role: 'user', content: latestInput }]

      await fetchAiChatStream(
        { model: 'deepseek-v4-flash', input: finalInput },
        (chunk) => {
          reactiveAsstMsg.isLoading = false
          reactiveAsstMsg.content += chunk
          // Schedule throttled render instead of forcing sync re-parse
          scheduleRender(assistantMsgId, reactiveAsstMsg.content!)
        },
        (reasoningChunk) => {
          reactiveAsstMsg.isLoading = false
          if (reactiveAsstMsg.reasoningContent === undefined) {
            reactiveAsstMsg.reasoningContent = ''
          }
          reactiveAsstMsg.reasoningContent += reasoningChunk
        },
        () => {
          reactiveAsstMsg.isLoading = false
          // Final render — ensure the completed content is fully parsed
          const finalContent = extractVideoResults(reactiveAsstMsg.content ?? '').content
          try {
            const rawHtml = marked.parse(finalContent)
            renderedHtmlMap[assistantMsgId] = DOMPurify.sanitize(
              rawHtml as string,
              markdownSanitizeOptions
            )
          } catch {
            renderedHtmlMap[assistantMsgId] = finalContent
          }
        },
        (err) => {
          reactiveAsstMsg.isLoading = false
          reactiveAsstMsg.error = err.message
        }
      )
    } else if (activeModel.value === 'image') {
      // Image generation / edit
      const assistantMsgId = `img-${Date.now()}`
      const asstMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        type: 'image_gen',
        sourcePrompt: userText,
        isLoading: true,
        results: [], // placeholder array
      }
      // fill with placeholders
      for (let i = 0; i < imgCount.value; i++) {
        asstMsg.results?.push({ url: '' }) // empty url signifies loading state in UI
      }
      messages.value.push(asstMsg)
      // Retrieve the reactive proxy from the array to ensure Vue tracks mutations
      const reactiveImgMsg = messages.value[messages.value.length - 1]!

      try {
        let res
        if (currentImages.length > 0) {
          const imageRefs = await Promise.all(
            currentImages.map(async (f) => ({
              url: await encodeImageForAI(f.file),
              type: 'image_url' as const,
            }))
          )
          const reqData: AiImageEditParams =
            imageRefs.length === 1
              ? {
                  model: imgModel.value,
                  prompt: userText || '编辑图片',
                  image: imageRefs[0],
                  n: imgCount.value,
                  resolution: imgResolution.value,
                }
              : {
                  model: imgModel.value,
                  prompt: userText || '编辑图片',
                  images: imageRefs,
                  n: imgCount.value,
                  aspect_ratio: imgRatio.value,
                  resolution: imgResolution.value,
                }
          res = await aiEditImage(reqData)
        } else {
          const reqData: AiImageGenParams = {
            model: imgModel.value,
            prompt: userText,
            n: imgCount.value,
            aspect_ratio: imgRatio.value,
            resolution: imgResolution.value,
          }
          res = await aiGenerateImage(reqData)
        }
        // Flexible data mapping to handle different or unexpected AI response structures
        const resObj = res as unknown
        const finalResults = extractMediaResults(resObj, 'image')

        if (finalResults.length > 0) {
          reactiveImgMsg.results!.splice(0, reactiveImgMsg.results!.length, ...finalResults)
        } else {
          console.error('Raw AI Image Response (invalid format):', resObj)
          reactiveImgMsg.error = '返回数据没有有效数组: ' + JSON.stringify(resObj).substring(0, 150)
          reactiveImgMsg.results!.splice(0, reactiveImgMsg.results!.length)
        }
      } catch (err: unknown) {
        reactiveImgMsg.error = err instanceof Error ? err.message : String(err)
      } finally {
        reactiveImgMsg.isLoading = false
      }
    } else if (activeModel.value === 'video') {
      // Video generation
      const assistantMsgId = `vid-${Date.now()}`
      const asstMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        type: 'video_gen',
        sourcePrompt: userText,
        isLoading: true,
        progress: 0,
        results: [],
      }
      messages.value.push(asstMsg)
      // Retrieve the reactive proxy from the array to ensure Vue tracks mutations
      const reactiveVidMsg = messages.value[messages.value.length - 1]!

      try {
        const reqData: AiVideoGenParams = {
          model: vidModel.value,
          prompt: userText || '生成视频',
          duration: vidDuration.value,
          resolution: vidResolution.value,
        }
        if (currentImages.length === 1 && currentImages[0]) {
          reqData.image = {
            url: await encodeImageForAI(currentImages[0].file),
            type: 'image_url',
          }
        } else if (currentImages.length > 1) {
          reqData.aspect_ratio = vidRatio.value
          reqData.reference_images = await Promise.all(
            currentImages.slice(0, 7).map(async (f) => ({
              url: await encodeImageForAI(f.file),
              type: 'image_url' as const,
            }))
          )
        } else {
          reqData.aspect_ratio = vidRatio.value
        }

        const res = await aiGenerateVideo(reqData)
        // Interceptor already unwraps { code, data, msg } → data
        const requestId = extractRequestId(res)
        if (!requestId) throw new Error('未获取到任务ID')

        // Polling loop
        let polling = true
        while (polling) {
          await sleep(3000)
          const statusRes = await aiGetVideoStatus(requestId)
          const statusData = statusRes as unknown
          if (statusData) {
            const nextProgress = extractVideoProgress(statusData)
            if (nextProgress !== undefined) reactiveVidMsg.progress = nextProgress

            const currentStatus = extractVideoStatus(statusData)

            if (
              currentStatus === 'done' ||
              currentStatus === 'completed' ||
              currentStatus === 'success'
            ) {
              const videoResults = extractMediaResults(statusData, 'video')
              if (videoResults.length > 0) {
                reactiveVidMsg.results!.splice(0, reactiveVidMsg.results!.length, ...videoResults)
              } else {
                console.error('Raw AI Video Response (no url):', statusData)
                throw new Error(
                  '未在响应中找到视频链接: ' + JSON.stringify(statusData).substring(0, 150)
                )
              }
              polling = false
            } else if (
              isRecord(statusData) &&
              ['failed', 'expired', 'error'].includes(currentStatus)
            ) {
              const errMsg =
                (typeof statusData.error === 'string' && statusData.error) ||
                (typeof statusData.error_message === 'string' && statusData.error_message) ||
                '视频生成失败'
              throw new Error(errMsg)
            }
          }
        }
      } catch (err: unknown) {
        reactiveVidMsg.error = err instanceof Error ? err.message : String(err)
      } finally {
        reactiveVidMsg.isLoading = false
      }
    }
  } finally {
    isSending.value = false
    void scrollToBottom()
  }
}

const handleSend = () => {
  void sendRequest()
}
</script>

<template>
  <Teleport to="body">
    <transition name="zen-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
        @click.self="handleClose"
      >
        <!-- Cinematic Dark/Light Blur Backdrop using theme variables -->
        <div
          class="absolute inset-0 bg-[var(--page-wash-3)] backdrop-blur-[var(--glass-blur)] pointer-events-none transition-all duration-700"
        ></div>

        <!-- The Monolithic Canvas -->
        <div
          class="relative flex flex-col w-full max-w-[1024px] h-[92vh] bg-[var(--bg-surface-0)] rounded-[2.5rem] shadow-cinematic ring-1 ring-[var(--glass-border)] overflow-hidden"
        >
          <!-- Absolute minimal top header / Draggable zone -->
          <div
            class="shrink-0 flex items-center justify-between px-8 py-6 z-10 border-b border-[var(--border-color)] border-opacity-30"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-full bg-[var(--bg-surface-2)] border border-[var(--border-color)] flex items-center justify-center text-[var(--text-1)] shadow-sm"
              >
                <Bot class="w-5 h-5" />
              </div>
              <h2
                class="text-xs font-bold tracking-[0.2em] text-[var(--text-1)] uppercase font-mono"
              >
                全能视频助手
              </h2>
            </div>
            <button
              class="group w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-surface-1)] hover:bg-[var(--bg-surface-2)] border border-transparent hover:border-[var(--border-color)] text-[var(--text-2)] hover:text-[var(--text-1)] transition-all duration-300"
              @click="handleClose"
            >
              <X
                class="w-4 h-4 group-hover:rotate-90 transition-transform duration-500 ease-out-expo"
              />
            </button>
          </div>

          <!-- Immersive Chat Area -->
          <div
            ref="chatScrollRef"
            class="flex-1 overflow-y-auto px-8 sm:px-16 py-8 flex flex-col gap-12 custom-scrollbar scroll-smooth"
          >
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex w-full group animate-slide-up"
              :class="msg.role === 'user' ? 'justify-end' : 'justify-start gap-6'"
            >
              <!-- AI Avatar Side -->
              <div v-if="msg.role === 'assistant'" class="shrink-0 pt-1">
                <div
                  class="w-8 h-8 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface-1)] p-1 flex items-center justify-center shadow-surface"
                >
                  <img
                    src="/表情包/bili_emoji_20.png"
                    alt="bot"
                    class="w-full h-full object-contain"
                  />
                </div>
              </div>

              <!-- Content Area -->
              <div
                class="flex flex-col gap-4 max-w-[85%]"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- User Attached Images -->
                <div
                  v-if="msg.role === 'user' && msg.images?.length"
                  class="flex flex-wrap gap-2 justify-end mb-2"
                >
                  <img
                    v-for="(img, idx) in msg.images"
                    :key="idx"
                    :src="img"
                    class="w-24 h-24 object-cover rounded-2xl shadow-raised border border-[var(--border-color)]"
                  />
                </div>

                <!-- Terminal-Style Reasoning (Assistant) -->
                <details
                  v-if="msg.reasoningContent"
                  class="group/reasoning w-full overflow-hidden text-[13px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-1)]"
                  open
                >
                  <summary
                    class="cursor-pointer select-none px-4 py-3 flex items-center gap-3 font-mono text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors outline-none"
                  >
                    <Loader2
                      v-if="msg.isLoading && !msg.content"
                      class="w-3.5 h-3.5 animate-spin text-[var(--text-1)]"
                    />
                    <span
                      v-else
                      class="w-2 h-2 rounded-full bg-[var(--text-2)] group-open/reasoning:bg-[var(--status-success)] transition-colors shadow-[0_0_8px_var(--status-success)]"
                    ></span>
                    <span class="tracking-widest uppercase text-[10px] font-bold"
                      >Thought Process</span
                    >
                  </summary>
                  <div
                    class="px-5 py-4 font-mono text-[var(--text-2)] leading-relaxed whitespace-pre-wrap border-t border-[var(--border-color)] bg-[var(--bg-surface-2)] opacity-80"
                  >
                    {{ msg.reasoningContent }}
                  </div>
                </details>

                <!-- Markdown Content -->
                <div
                  v-if="msg.role === 'user' ? msg.content !== undefined : getPrimaryContent(msg)"
                  class="leading-[1.7] break-words text-[15px]"
                  :class="[
                    msg.role === 'user'
                      ? 'px-6 py-4 bg-[var(--bg-surface-2)] text-[var(--text-1)] rounded-[24px] rounded-br-sm border border-[var(--border-color)] shadow-raised font-medium'
                      : 'markdown-body ai-assistant-bubble text-[var(--text-1)] w-full',
                  ]"
                  @click="msg.role === 'assistant' ? handleAssistantMarkupClick($event) : undefined"
                  v-html="msg.role === 'assistant' ? getRenderedHtml(msg) : msg.content"
                ></div>

                <div
                  v-if="msg.role === 'assistant' && getVideoResults(msg).length"
                  class="mt-4 w-full"
                >
                  <div class="mb-3 flex items-center gap-2">
                    <span class="h-2 w-2 rounded-full bg-[var(--brand-blue)]"></span>
                    <span
                      class="text-[11px] font-mono font-bold tracking-[0.24em] uppercase text-[var(--text-2)]"
                    >
                      Video Results
                    </span>
                  </div>
                  <div class="grid gap-3 max-w-[42rem]">
                    <button
                      v-for="(item, resultIndex) in getVideoResults(msg)"
                      :key="`${msg.id}-video-result-${resultIndex}`"
                      class="group relative overflow-hidden rounded-[1.35rem] border border-[var(--border-color)] bg-[var(--bg-surface-1)] px-5 py-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-[var(--brand-blue)]/40 hover:shadow-raised"
                      @click="void goToVideoResult(item.href)"
                    >
                      <div
                        class="absolute inset-y-0 left-0 w-1 bg-[var(--brand-blue)]/70 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      ></div>
                      <div class="flex items-start justify-between gap-4">
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-[16px] font-semibold text-[var(--text-1)]">
                            {{ item.title }}
                          </div>
                          <div class="mt-2 line-clamp-2 text-[13px] leading-6 text-[var(--text-2)]">
                            {{ item.description }}
                          </div>
                        </div>
                        <div
                          class="shrink-0 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface-2)] px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-[var(--text-2)] transition-colors duration-300 group-hover:text-[var(--brand-blue)]"
                        >
                          Open
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Loading Indicator (Text) -->
                <div
                  v-if="
                    msg.role === 'assistant' &&
                    msg.isLoading &&
                    msg.content === '' &&
                    !msg.reasoningContent &&
                    msg.type === 'text'
                  "
                  class="flex items-center gap-1.5 py-2 px-1"
                >
                  <div
                    class="w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)] animate-[pulse_1s_infinite]"
                  ></div>
                  <div
                    class="w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)] animate-[pulse_1s_infinite_0.2s]"
                  ></div>
                  <div
                    class="w-1.5 h-1.5 rounded-full bg-[var(--brand-blue)] animate-[pulse_1s_infinite_0.4s]"
                  ></div>
                </div>

                <!-- Error Toast -->
                <div
                  v-if="msg.error"
                  class="px-4 py-2 bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] text-sm rounded-xl border border-[var(--status-danger-border)] flex items-center gap-2"
                >
                  <span class="w-2 h-2 rounded-full bg-[var(--status-danger)]"></span>
                  {{ msg.error }}
                </div>

                <!-- Extravagant Image Grid -->
                <div
                  v-if="msg.type === 'image_gen' && msg.results"
                  class="mt-4 grid gap-3 self-start"
                  :class="
                    msg.results.length > 1
                      ? 'w-[min(44rem,calc(100vw-12rem))] max-w-full grid-cols-2'
                      : 'w-[20rem] max-w-full grid-cols-1'
                  "
                >
                  <div
                    v-for="(res, idx) in msg.results"
                    :key="idx"
                    class="relative group aspect-square min-w-0 rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-1)] shadow-raised ring-1 ring-[var(--border-color)]"
                    :class="res.url && !res.error ? 'cursor-zoom-in' : ''"
                    @click="res.url && !res.error ? openImagePreview(res.url) : undefined"
                  >
                    <div
                      v-if="!res.url"
                      class="absolute inset-0 isolate overflow-hidden rounded-[1.5rem] border border-[var(--border-color)] bg-[var(--bg-surface-1)] shadow-surface"
                    >
                      <div
                        class="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/10 animate-shimmer"
                        style="background-size: 200% 100%"
                      ></div>
                      <div
                        class="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_52%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_48%)]"
                      ></div>

                      <div class="relative z-10 flex h-full flex-col justify-between p-5">
                        <div class="flex items-start justify-between gap-4">
                          <div>
                            <div
                              class="text-[10px] font-mono font-bold tracking-[0.28em] text-[var(--text-2)]"
                            >
                              IMAGE
                            </div>
                            <div
                              class="mt-2 h-2 w-20 rounded-full bg-black/10 dark:bg-white/10"
                            ></div>
                          </div>
                          <div
                            class="rounded-full border border-[var(--border-color)] bg-[var(--bg-surface-1)] px-3 py-1 text-[10px] font-mono font-bold tracking-[0.2em] text-[var(--text-2)]"
                          >
                            {{ String(idx + 1).padStart(2, '0') }}
                          </div>
                        </div>

                        <div class="flex flex-col gap-3">
                          <div
                            class="relative flex aspect-square items-center justify-center overflow-hidden rounded-[1.1rem] border border-[var(--border-color)] bg-[var(--bg-surface-0)]/80"
                          >
                            <div
                              class="absolute inset-0 bg-gradient-to-br from-black/[0.04] via-transparent to-black/[0.08] dark:from-white/[0.04] dark:to-white/[0.02]"
                            ></div>
                            <div
                              class="relative z-10 h-24 w-24 rounded-full border border-black/10 bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.04]"
                            ></div>
                          </div>
                          <div class="space-y-2">
                            <div class="h-2.5 rounded-full bg-black/10 dark:bg-white/10"></div>
                            <div
                              class="h-2.5 w-[72%] rounded-full bg-black/[0.08] dark:bg-white/[0.08]"
                            ></div>
                          </div>
                          <div
                            class="flex items-center justify-between text-[10px] font-mono font-bold tracking-[0.22em] text-[var(--text-2)]"
                          >
                            <span>RENDERING</span>
                            <span>IN PROGRESS</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div
                      v-else-if="res.error"
                      class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
                    >
                      <span class="text-xs text-[var(--status-danger)] font-mono">{{
                        res.error
                      }}</span>
                    </div>
                    <template v-else>
                      <div
                        class="absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      >
                        <button
                          class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] transition-colors shadow-overlay backdrop-blur-md"
                          title="下载图片"
                          @click.stop.prevent="void downloadAsset(res.url, `ai-${Date.now()}.png`)"
                        >
                          <Download class="w-4 h-4" />
                        </button>
                        <button
                          v-if="isCoverPickerMode"
                          class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] transition-colors shadow-overlay backdrop-blur-md"
                          :disabled="isAssetActionBusy(makeAssetActionKey(msg.id, idx, 'cover'))"
                          title="上传到当前投稿封面"
                          @click.stop.prevent="
                            void handleCoverPick(
                              msg.id,
                              idx,
                              res.url,
                              msg.sourcePrompt || '',
                              res.mime_type
                            )
                          "
                        >
                          <Loader2
                            v-if="isAssetActionBusy(makeAssetActionKey(msg.id, idx, 'cover'))"
                            class="w-4 h-4 animate-spin"
                          />
                          <UploadCloud v-else class="w-4 h-4" />
                        </button>
                      </div>
                      <img
                        :src="res.url"
                        referrerpolicy="no-referrer"
                        class="w-full h-full object-cover transition-transform duration-[2s] ease-out-expo group-hover:scale-105"
                        @click.stop="openImagePreview(res.url)"
                        @error="markMediaResultError(msg, idx, 'Failed to load')"
                      />
                    </template>
                  </div>
                </div>

                <!-- Epic Video Container -->
                <div v-if="msg.type === 'video_gen'" class="mt-4">
                  <div
                    v-if="msg.isLoading"
                    class="relative w-[28rem] sm:w-[38rem] aspect-video rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-1)] border border-[var(--border-color)] flex flex-col items-center justify-center gap-6 shadow-surface"
                  >
                    <div
                      class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--brand-blue)]/10 to-transparent animate-shimmer"
                      style="background-size: 200% 100%"
                    ></div>
                    <div class="relative z-10 w-20 h-20 flex items-center justify-center">
                      <svg class="w-full h-full transform -rotate-90">
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          stroke="currentColor"
                          stroke-width="2"
                          fill="none"
                          class="opacity-10 text-[var(--text-2)]"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          stroke="currentColor"
                          stroke-width="2"
                          fill="none"
                          :stroke-dasharray="226"
                          :stroke-dashoffset="226 - (226 * (msg.progress || 0)) / 100"
                          class="text-[var(--brand-blue)] transition-all duration-700 ease-out-expo"
                        />
                      </svg>
                      <span class="absolute text-sm font-mono font-bold text-[var(--text-1)]">{{
                        msg.progress || 0
                      }}</span>
                    </div>
                    <span
                      class="relative z-10 text-[10px] font-mono tracking-[0.3em] font-bold text-[var(--brand-blue)]"
                      >SYNTHESIS_IN_PROGRESS</span
                    >
                  </div>
                  <div
                    v-else-if="msg.results?.length"
                    class="relative group w-[28rem] sm:w-[38rem] aspect-video rounded-[1.5rem] overflow-hidden bg-black shadow-cinematic ring-1 ring-[var(--border-color)]"
                  >
                    <video
                      :src="msg.results?.[0]?.url"
                      controls
                      class="w-full h-full object-contain"
                      autoplay
                      loop
                      muted
                      @error="markMediaResultError(msg, 0, 'Failed')"
                    />
                    <div
                      class="absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <button
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] transition-colors shadow-overlay backdrop-blur-md"
                        title="下载视频"
                        @click.prevent="
                          void downloadAsset(
                            msg.results?.[0]?.url || '',
                            `ai-vid-${Date.now()}.mp4`
                          )
                        "
                      >
                        <Download class="w-4 h-4" />
                      </button>
                      <button
                        v-if="showVideoSubmitAction"
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] transition-colors shadow-overlay backdrop-blur-md"
                        :disabled="isAssetActionBusy(makeAssetActionKey(msg.id, 0, 'submit'))"
                        title="一键投稿：跳转到投稿页并自动上传"
                        @click.prevent="
                          void handleOneClickSubmit(
                            msg.id,
                            0,
                            msg.results?.[0]?.url || '',
                            msg.sourcePrompt || ''
                          )
                        "
                      >
                        <Loader2
                          v-if="isAssetActionBusy(makeAssetActionKey(msg.id, 0, 'submit'))"
                          class="w-4 h-4 animate-spin"
                        />
                        <UploadCloud v-else class="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- User Avatar Side -->
              <div v-if="msg.role === 'user'" class="shrink-0 pt-1 hidden sm:block">
                <AppAvatar
                  :src="authStore.user?.avatar"
                  :name="authStore.user?.username"
                  alt="user"
                  container-class="w-10 h-10 border border-[var(--border-color)] bg-[var(--bg-surface-1)] p-0.5 shadow-surface"
                  image-class="w-full h-full object-cover rounded-full"
                  text-class="text-sm font-bold"
                />
              </div>
            </div>
            <!-- Bottom spacer -->
            <div class="h-10 shrink-0"></div>
          </div>

          <!-- THE COMMAND CENTER (Integrated at bottom) -->
          <div class="shrink-0 relative z-20">
            <!-- Fade block -->
            <div
              class="absolute top-0 left-0 right-0 h-12 -translate-y-full bg-gradient-to-t from-[var(--bg-surface-0)] to-transparent pointer-events-none"
            ></div>

            <div class="max-w-4xl mx-auto px-6 pb-6 w-full">
              <!-- Toolbar Floating Island -->
              <div
                class="flex flex-col rounded-[24px] bg-[var(--bg-surface-1)] shadow-overlay border border-[var(--border-color)] p-2 transition-all duration-500 focus-within:ring-1 focus-within:ring-[var(--brand-blue)]"
              >
                <!-- Tiny Segmented Control & Settings Toggle -->
                <div class="flex items-center justify-between px-3 py-2 mb-1">
                  <div
                    class="flex items-center gap-2 p-1 bg-[var(--bg-surface-2)] rounded-xl border border-[var(--border-color)]"
                  >
                    <button
                      class="px-4 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest transition-all duration-300"
                      :class="
                        activeModel === 'text'
                          ? 'bg-[var(--text-1)] text-[var(--bg-surface-0)] shadow-surface'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      "
                      @click="activeModel = 'text'"
                    >
                      TEXT
                    </button>
                    <button
                      class="px-4 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest transition-all duration-300"
                      :class="
                        activeModel === 'image'
                          ? 'bg-[var(--text-1)] text-[var(--bg-surface-0)] shadow-surface'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      "
                      @click="activeModel = 'image'"
                    >
                      IMAGE
                    </button>
                    <button
                      class="px-4 py-1.5 rounded-lg text-xs font-mono font-bold tracking-widest transition-all duration-300"
                      :class="
                        activeModel === 'video'
                          ? 'bg-[var(--text-1)] text-[var(--bg-surface-0)] shadow-surface'
                          : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
                      "
                      @click="activeModel = 'video'"
                    >
                      VIDEO
                    </button>
                  </div>
                  <button
                    v-if="activeModel !== 'text'"
                    class="w-8 h-8 flex items-center justify-center rounded-xl transition-all duration-300"
                    :class="
                      showSettings
                        ? 'border border-[var(--brand-blue)] text-[var(--brand-blue)] shadow-[0_0_8px_var(--brand-blue)] bg-black/5 dark:bg-white/10'
                        : 'text-[var(--text-2)] bg-[var(--bg-surface-2)] hover:text-[var(--text-1)] border border-[var(--border-color)]'
                    "
                    @click="showSettings = !showSettings"
                  >
                    <Settings2 class="w-4 h-4" />
                  </button>
                </div>

                <!-- Expansive Inline Options -->
                <transition name="expand">
                  <div v-show="showSettings && activeModel !== 'text'" class="overflow-hidden">
                    <div
                      class="px-4 py-3 mx-2 mb-2 bg-[var(--bg-surface-2)] rounded-[16px] border border-[var(--border-color)] flex gap-8 items-center text-xs font-mono uppercase tracking-widest text-[var(--text-2)] overflow-x-auto custom-scrollbar"
                    >
                      <template v-if="activeModel === 'image'">
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Model</span>
                          <select
                            v-model="imgModel"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="model in IMAGE_MODEL_OPTIONS"
                              :key="model.value"
                              :value="model.value"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ model.label }}
                            </option>
                          </select>
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Count</span>
                          <input
                            v-model="imgCount"
                            type="number"
                            min="1"
                            max="15"
                            class="w-12 bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none text-center"
                          />
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Ratio</span>
                          <select
                            v-model="imgRatio"
                            :disabled="isSingleImageEdit()"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="ratio in IMAGE_RATIO_OPTIONS"
                              :key="ratio"
                              :value="ratio"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ ratio }}
                            </option>
                          </select>
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Res</span>
                          <select
                            v-model="imgResolution"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="resolution in IMAGE_RESOLUTION_OPTIONS"
                              :key="resolution"
                              :value="resolution"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ resolution }}
                            </option>
                          </select>
                        </label>
                        <span
                          v-if="isSingleImageEdit()"
                          class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                          >Inherits Source</span
                        >
                      </template>
                      <template v-if="activeModel === 'video'">
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Model</span>
                          <select
                            v-model="vidModel"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="model in VIDEO_MODEL_OPTIONS"
                              :key="model.value"
                              :value="model.value"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ model.label }}
                            </option>
                          </select>
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Seconds</span>
                          <input
                            v-model="vidDuration"
                            type="number"
                            min="1"
                            :max="videoDurationMax()"
                            class="w-12 bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none text-center"
                          />
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Ratio</span>
                          <select
                            v-model="vidRatio"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="ratio in VIDEO_RATIO_OPTIONS"
                              :key="ratio"
                              :value="ratio"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ ratio }}
                            </option>
                          </select>
                        </label>
                        <label class="flex items-center gap-3 shrink-0">
                          <span class="font-bold">Res</span>
                          <select
                            v-model="vidResolution"
                            class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                          >
                            <option
                              v-for="resolution in VIDEO_RESOLUTION_OPTIONS"
                              :key="resolution"
                              :value="resolution"
                              class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                            >
                              {{ resolution }}
                            </option>
                          </select>
                        </label>
                        <span
                          v-if="isReferenceVideoMode()"
                          class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                          >Max 10s Mode</span
                        >
                      </template>
                    </div>
                  </div>
                </transition>

                <!-- Pasted Media & Text Area -->
                <div class="flex flex-col px-3 pb-3">
                  <div
                    v-if="pastedImages.length > 0"
                    class="flex gap-2.5 overflow-x-auto py-2 custom-scrollbar px-1"
                  >
                    <div
                      v-for="(img, idx) in pastedImages"
                      :key="idx"
                      class="relative group shrink-0"
                    >
                      <img
                        :src="img.url"
                        class="h-16 w-16 object-cover rounded-[12px] shadow-sm border border-[var(--border-color)]"
                      />
                      <button
                        class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--status-danger)] text-[var(--status-danger-ink)] rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                        @click="removePastedImage(idx)"
                      >
                        <X class="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div class="flex items-end gap-3 mt-1 px-1">
                    <textarea
                      v-model="inputContent"
                      class="flex-1 max-h-[160px] min-h-[44px] bg-transparent resize-none outline-none py-2 px-2 text-[16px] leading-[1.6] text-[var(--text-1)] placeholder:text-[var(--text-2)] custom-scrollbar font-normal"
                      :placeholder="
                        activeModel === 'text'
                          ? 'Type a message...'
                          : 'Describe what you want to create...'
                      "
                      rows="1"
                      @paste="handlePaste"
                      @keydown.enter.exact.prevent="handleSend"
                    ></textarea>

                    <button
                      class="shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl transition-all duration-300 ease-out-expo shadow-raised"
                      :class="
                        (!inputContent.trim() && pastedImages.length === 0) || isSending
                          ? 'bg-[var(--bg-surface-2)] text-[var(--text-2)] cursor-not-allowed shadow-none border border-[var(--border-color)]'
                          : 'bg-[var(--brand-blue)] text-[var(--signal-foreground)] hover:scale-105 active:scale-95'
                      "
                      :disabled="(!inputContent.trim() && pastedImages.length === 0) || isSending"
                      @click="handleSend"
                    >
                      <Loader2 v-if="isSending" class="w-5 h-5 animate-spin" />
                      <Send v-else class="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Very minimal disclaimer -->
              <div class="mt-4 text-center">
                <span
                  class="text-[10px] font-mono tracking-widest text-[var(--text-2)] uppercase opacity-70"
                  >Generated content may require verification</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
  <ImageViewer v-model="showPreviewImage" :src="previewImageUrl" />
</template>

<style scoped>
/* Ultra Premium Typography Reset adapted for theme variables */
:deep(.markdown-body) {
  font-family: inherit;
  color: inherit;
}

:deep(.ai-assistant-bubble) {
  border-radius: 1.5rem;
  border: 1px solid var(--border-color);
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--bg-surface-0) 94%, transparent),
    var(--bg-surface-1)
  );
  box-shadow: 0 20px 48px -32px rgb(15, 15, 15, 0.45);
  padding: 1.15rem 1.25rem;
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  font-family:
    Inter,
    system-ui,
    -apple-system,
    sans-serif;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-top: 1.5em;
  margin-bottom: 0.75em;
  color: var(--text-1);
}

:deep(.markdown-body h1) {
  font-size: 1.75em;
}

:deep(.markdown-body h2) {
  font-size: 1.4em;
}

:deep(.markdown-body h3) {
  font-size: 1.15em;
}

:deep(.markdown-body a) {
  color: var(--brand-blue);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
  transition: all 0.3s ease;
}

:deep(.markdown-body a:hover) {
  text-decoration-color: currentcolor;
}

:deep(.markdown-body .ai-code-block) {
  overflow: hidden;
  border-radius: 1.15rem;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-0);
  margin: 1.5em 0;
  box-shadow: 0 24px 44px -36px rgb(15, 15, 15, 0.5);
}

:deep(.markdown-body .ai-code-toolbar) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.95rem;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in oklab, var(--bg-surface-1) 82%, var(--bg-surface-0));
}

:deep(.markdown-body .ai-code-language) {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--text-2);
}

:deep(.markdown-body .ai-code-copy) {
  min-width: 4.5rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-surface-0);
  color: var(--text-1);
  padding: 0.38rem 0.8rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}

:deep(.markdown-body .ai-code-copy:hover) {
  transform: translateY(-1px);
  border-color: var(--text-2);
  background: var(--bg-surface-1);
}

:deep(.markdown-body .ai-code-copy[data-copied='true']) {
  background: var(--text-1);
  border-color: var(--text-1);
  color: var(--bg-surface-0);
}

:deep(.markdown-body pre) {
  background: transparent;
  color: var(--text-1);
  padding: 1rem 1.1rem 1.15rem;
  border-radius: 0;
  border: 0;
  overflow-x: auto;
  margin: 0;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace;
  font-size: 0.85em;
  line-height: 1.7;
}

:deep(.markdown-body code:not(pre code)) {
  background-color: var(--bg-surface-2);
  color: var(--text-1);
  padding: 0.2em 0.4em;
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
}

:deep(.markdown-body pre code) {
  color: var(--text-1);
  background: transparent;
}

:deep(.markdown-body .hljs) {
  color: var(--text-1);
  background: transparent;
}

:deep(.markdown-body .hljs-keyword),
:deep(.markdown-body .hljs-selector-tag),
:deep(.markdown-body .hljs-built_in),
:deep(.markdown-body .hljs-literal) {
  color: color-mix(in oklab, var(--text-1) 88%, var(--text-2));
}

:deep(.markdown-body .hljs-string),
:deep(.markdown-body .hljs-title),
:deep(.markdown-body .hljs-section),
:deep(.markdown-body .hljs-attribute),
:deep(.markdown-body .hljs-meta-string) {
  color: var(--text-2);
}

:deep(.markdown-body .hljs-number),
:deep(.markdown-body .hljs-symbol),
:deep(.markdown-body .hljs-bullet) {
  color: color-mix(in oklab, var(--text-1) 75%, var(--bg-surface-0));
}

:deep(.markdown-body .hljs-comment),
:deep(.markdown-body .hljs-quote) {
  color: color-mix(in oklab, var(--text-2) 84%, transparent);
  font-style: italic;
}

:deep(.markdown-body p) {
  margin-bottom: 1.2em;
  line-height: 1.75;
}

:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 1.2em;
  margin: 1.2em 0;
  line-height: 1.75;
}

:deep(.markdown-body li) {
  margin-bottom: 0.5em;
}

/* Scrollbar Minimalist */
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: var(--text-2);
}

/* Animations */
.ease-out-expo {
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.zen-modal-enter-active {
  animation: zen-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.zen-modal-leave-active {
  animation: zen-out 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes zen-in {
  0% {
    opacity: 0;
    transform: scale(0.98) translateY(20px);
  }

  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes zen-out {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }

  100% {
    opacity: 0;
    transform: scale(0.98) translateY(10px);
  }
}

.animate-slide-up {
  animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
}

@keyframes slide-up {
  0% {
    opacity: 0;
    transform: translateY(15px);
  }

  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  max-height: 200px;
  opacity: 1;
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-5px);
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }

  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  animation: shimmer 2.5s infinite linear;
}

.image-skeleton-shimmer {
  position: absolute;
  inset: -20%;
  background: linear-gradient(
    115deg,
    transparent 22%,
    color-mix(in oklab, var(--text-1) 10%, transparent) 48%,
    transparent 72%
  );
  background-size: 220% 100%;
  animation: shimmer 2.8s infinite linear;
}

.image-skeleton-grid {
  opacity: 0.42;
  background-image:
    linear-gradient(color-mix(in oklab, var(--border-color) 72%, transparent) 1px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in oklab, var(--border-color) 72%, transparent) 1px,
      transparent 1px
    );
  background-size: 28px 28px;
}

.image-skeleton-topfade {
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--bg-surface-0) 96%, transparent),
    transparent
  );
}

.image-skeleton-bottomfade {
  background: linear-gradient(
    0deg,
    color-mix(in oklab, var(--bg-surface-0) 98%, transparent),
    transparent
  );
}

.image-skeleton-frame {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  border-radius: 1.1rem;
  border: 1px solid color-mix(in oklab, var(--border-color) 88%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--bg-surface-1) 88%, transparent),
    color-mix(in oklab, var(--bg-surface-2) 84%, transparent)
  );
  overflow: hidden;
}

.image-skeleton-frame__inner {
  width: 44%;
  height: 44%;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--text-2) 35%, transparent);
  background: color-mix(in oklab, var(--bg-surface-0) 88%, transparent);
  box-shadow: inset 0 0 0 10px color-mix(in oklab, var(--bg-surface-1) 90%, transparent);
}

.image-skeleton-line {
  height: 0.7rem;
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in oklab, var(--bg-surface-2) 94%, transparent),
    color-mix(in oklab, var(--text-1) 12%, transparent),
    color-mix(in oklab, var(--bg-surface-2) 94%, transparent)
  );
  background-size: 200% 100%;
  animation: shimmer 2.4s infinite linear;
}

.image-skeleton-line--short {
  width: 5rem;
}

.image-skeleton-line--medium {
  width: 72%;
}
</style>
