<script setup lang="ts">
import { ref, reactive, nextTick, watch, onBeforeUnmount, computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { X, Download, Loader2, Bot, UploadCloud } from 'lucide-vue-next'
import {
  fetchAiChatStream,
  formatAiErrorMessage,
  resolveAiAssetUrl,
  aiGenerateImage,
  aiEditImage,
  aiGenerateVideo,
  aiGetVideoStatus,
  getAiOptions,
  type AiImageGenParams,
  type AiImageEditParams,
  type AiVideoGenParams,
  type AiModelOption,
} from '@/api/ai'
import { toast } from 'vue-sonner'
import ImageViewer from '@/components/common/ImageViewer.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AiChatComposer from '@/components/ai/AiChatComposer.vue'
import { useCreatorBridgeStore } from '@/stores/creatorBridge'
import { useAuthStore } from '@/stores/auth'
import { buildAiSuggestedTitle, fetchAiAssetAsFile } from '@/utils/ai-assets'
import { renderMarkdownHtml, renderStreamingPlainHtml } from '@/components/ai/ai-markdown'
import { createStreamBuffer, type StreamFlushPayload } from '@/components/ai/ai-stream-buffer'
import type { AiComposerSendPayload, AiModelType } from '@/components/ai/ai-types'
import { setLive2dPaused } from '@/utils/live2d'

const props = withDefaults(
  defineProps<{
    open: boolean
    mode?: 'default' | 'cover-picker'
    initialModel?: AiModelType
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
  status?: string // for video task status
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

const isSending = ref(false)
/** 流式输出中：关闭 scroll-smooth，减少强制布局抖动 */
const isStreamingUi = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)
const previewImageUrl = ref('')
const showPreviewImage = ref(false)
const activeAssetActionKey = ref<string | null>(null)
const hasStreamedIntro = ref(false)
let introStreamTimer: number | null = null
let live2dPausedByDialog = false

const INITIAL_GREETING =
  '你好，我可以帮你找站内视频、整理灵感、生成图像与视频提示，也可以直接继续聊天。'

/** 解析后的主内容 / 视频卡片缓存，避免模板里反复 regex */
const primaryContentMap = shallowRef<Record<string, string>>({})
const videoResultsMap = shallowRef<Record<string, VideoResultItem[]>>({})

// Model options from backend — 只传给 Composer，不参与消息区渲染依赖
const chatModelOptions = ref<AiModelOption[]>([])
const imageModelOptions = ref<AiModelOption[]>([])
const videoModelOptions = ref<AiModelOption[]>([])
const thinkingEffortOptions = ref<AiModelOption[]>([])
const thinkingFeatureEnabled = ref(false)
const defaultChatModel = ref('')
const defaultImageModel = ref('')
const defaultVideoModel = ref('')
const defaultThinkingEffort = ref('high')
const optionsLoading = ref(false)

const withDefaultOption = (defaultValue: string, options: AiModelOption[]): AiModelOption[] => {
  const list = options.filter((o) => o.value)
  if (!defaultValue) return list
  if (list.some((o) => o.value === defaultValue)) return list
  return [{ label: defaultValue, value: defaultValue }, ...list]
}

const loadAiOptions = async () => {
  if (optionsLoading.value) return
  optionsLoading.value = true
  try {
    const opts = await getAiOptions()
    chatModelOptions.value = withDefaultOption(opts.chatModel, opts.chatModels ?? [])
    imageModelOptions.value = withDefaultOption(opts.imageModel, opts.imageModels ?? [])
    videoModelOptions.value = withDefaultOption(opts.videoModel, opts.videoModels ?? [])
    thinkingFeatureEnabled.value = !!opts.thinkingEnabled
    thinkingEffortOptions.value = withDefaultOption(
      opts.thinkingEffort || 'high',
      opts.thinkingEfforts ?? []
    )
    if (!thinkingEffortOptions.value.length) {
      thinkingEffortOptions.value = [
        { label: 'High', value: 'high' },
        { label: 'Max', value: 'max' },
      ]
    }
    defaultChatModel.value = opts.chatModel || chatModelOptions.value[0]?.value || ''
    defaultImageModel.value = opts.imageModel || imageModelOptions.value[0]?.value || ''
    defaultVideoModel.value = opts.videoModel || videoModelOptions.value[0]?.value || ''
    defaultThinkingEffort.value = opts.thinkingEffort || 'high'
  } catch (err) {
    console.warn('load AI options failed', err)
  } finally {
    optionsLoading.value = false
  }
}

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

// --- Throttled auto-scroll (RAF-based) ---
let scrollRafId: number | null = null
let userPinnedToBottom = true
const SCROLL_PIN_THRESHOLD = 96

const scheduleScroll = (force = false) => {
  if (!force && !userPinnedToBottom) return
  if (scrollRafId !== null) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    const el = chatScrollRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

const scrollToBottom = async (force = true) => {
  await nextTick()
  userPinnedToBottom = true
  scheduleScroll(force)
}

const handleChatScroll = () => {
  const el = chatScrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  userPinnedToBottom = distance <= SCROLL_PIN_THRESHOLD
}

// --- Markdown / content cache ---
// Maps message id → rendered HTML. Updated at display-rate, not chunk-rate.
const renderedHtmlMap = reactive<Record<string, string>>({})
const LOADING_CURSOR_HTML =
  '<span class="inline-block animate-pulse w-2 h-4 bg-zinc-400 rounded-sm"></span>'

const pendingRenderRaw: Record<string, string> = {}
const pendingRenderStreaming: Record<string, boolean> = {}
const pendingRenderTimers = new Map<string, number>()

const VIDEO_RESULTS_BLOCK_RE = /\[video_results\]([\s\S]*?)\[\/video_results\]/gi
const VIDEO_RESULT_LINE_RE = /-\s*\[([^\]]+)\]\((\/video\/[^)]+)\)\s*[：:]\s*(.+)$/i

const extractVideoResults = (content: string) => {
  const items: VideoResultItem[] = []
  // 流式半包时避免全局 lastIndex 串扰
  VIDEO_RESULTS_BLOCK_RE.lastIndex = 0
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

const patchRecord = <T,>(source: Record<string, T>, id: string, value: T): Record<string, T> => {
  if (source[id] === value) return source
  return { ...source, [id]: value }
}

const updateContentCaches = (msgId: string, rawContent: string) => {
  const parsed = extractVideoResults(rawContent)
  primaryContentMap.value = patchRecord(primaryContentMap.value, msgId, parsed.content)
  videoResultsMap.value = patchRecord(videoResultsMap.value, msgId, parsed.items)
  return parsed
}

const applyRenderedHtml = (msgId: string, html: string) => {
  if (renderedHtmlMap[msgId] === html) return
  renderedHtmlMap[msgId] = html
}

/** 流式 markdown 最小间隔：约 8~10fps，既有格式又避免每个 chunk 全量 parse */
const STREAM_MD_INTERVAL_MS = 110
const lastStreamMarkdownAt: Record<string, number> = {}

const flushMarkdownRender = (msgId: string, rawContent: string, streaming: boolean) => {
  const { content: text } = updateContentCaches(msgId, rawContent)

  if (!text) {
    applyRenderedHtml(msgId, streaming ? LOADING_CURSOR_HTML : '')
    return
  }

  if (streaming) {
    // 流式：marked + DOMPurify，但关闭 hljs；末尾保留光标
    applyRenderedHtml(msgId, renderMarkdownHtml(text, { streaming: true }) + LOADING_CURSOR_HTML)
    lastStreamMarkdownAt[msgId] = performance.now()
    return
  }

  delete lastStreamMarkdownAt[msgId]
  // 结束：全量 markdown + 代码高亮
  applyRenderedHtml(msgId, renderMarkdownHtml(text, { streaming: false }))
}

const scheduleRender = (msgId: string, rawContent: string, streaming = false) => {
  pendingRenderRaw[msgId] = rawContent
  pendingRenderStreaming[msgId] = streaming

  // 最终渲染：立刻执行全量 markdown
  if (!streaming) {
    const existing = pendingRenderTimers.get(msgId)
    if (existing != null) {
      window.clearTimeout(existing)
      pendingRenderTimers.delete(msgId)
    }
    flushMarkdownRender(msgId, rawContent, false)
    scheduleScroll()
    return
  }

  // 流式：合并到固定节流窗口；窗口内只保留最新正文
  if (pendingRenderTimers.has(msgId)) return

  const lastAt = lastStreamMarkdownAt[msgId] ?? 0
  const elapsed = performance.now() - lastAt
  const delay = Math.max(0, STREAM_MD_INTERVAL_MS - elapsed)

  const timer = window.setTimeout(() => {
    pendingRenderTimers.delete(msgId)
    const text = pendingRenderRaw[msgId] ?? ''
    const isStreaming = pendingRenderStreaming[msgId] ?? false
    delete pendingRenderRaw[msgId]
    delete pendingRenderStreaming[msgId]
    // 若期间已被 final 渲染抢占，streaming 标志会是 false
    flushMarkdownRender(msgId, text, isStreaming)
    scheduleScroll()
  }, delay)
  pendingRenderTimers.set(msgId, timer)
}

const getVideoResults = (msg: ChatMessage): VideoResultItem[] => {
  return videoResultsMap.value[msg.id] ?? []
}

const getPrimaryContent = (msg: ChatMessage) => {
  if (primaryContentMap.value[msg.id] !== undefined) {
    return primaryContentMap.value[msg.id]!
  }
  return extractVideoResults(msg.content ?? '').content
}

const goToVideoResult = async (href: string) => {
  if (!href) return
  emit('update:open', false)
  await router.push(href)
}

// 模板只用缓存 HTML，禁止同步 marked 解析（同步解析是卡顿主因）
const getRenderedHtml = (msg: ChatMessage) => {
  const cached = renderedHtmlMap[msg.id]
  if (cached !== undefined) return cached
  const text = getPrimaryContent(msg)
  if (!text) return LOADING_CURSOR_HTML
  // 冷启动一次性解析（欢迎语 / 历史消息）
  const html = renderMarkdownHtml(text, { streaming: false })
  applyRenderedHtml(msg.id, html)
  return html
}

const decodeCopyPayload = (content: string) => decodeURIComponent(content)

const clearIntroStream = () => {
  if (introStreamTimer !== null) {
    window.clearInterval(introStreamTimer)
    introStreamTimer = null
  }
}

/** 开场白流式输出：仅轻量纯文本，不跑 marked/hljs */
const streamInitialGreeting = () => {
  if (hasStreamedIntro.value) return
  const introMessage = messages.value.find((msg) => msg.id === 'init-1')
  if (!introMessage) return

  const chars = Array.from(INITIAL_GREETING)
  let cursor = 0

  introMessage.content = ''
  introMessage.isLoading = true
  applyRenderedHtml(introMessage.id, LOADING_CURSOR_HTML)
  primaryContentMap.value = { ...primaryContentMap.value, [introMessage.id]: '' }
  clearIntroStream()

  introStreamTimer = window.setInterval(() => {
    // 每 tick 多吐几个字，降低 interval 频率带来的主线程压力
    cursor = Math.min(chars.length, cursor + (cursor < 12 ? 2 : 4))
    const text = chars.slice(0, cursor).join('')
    introMessage.content = text
    primaryContentMap.value = { ...primaryContentMap.value, [introMessage.id]: text }
    applyRenderedHtml(introMessage.id, renderStreamingPlainHtml(text) + LOADING_CURSOR_HTML)
    scheduleScroll()

    if (cursor >= chars.length) {
      introMessage.isLoading = false
      hasStreamedIntro.value = true
      clearIntroStream()
      // 结束：正式 markdown（欢迎语几乎无开销）
      scheduleRender(introMessage.id, text, false)
    }
  }, 36)
}

/** 将缓冲后的 SSE 状态刷入对应消息（低频） */
const applyStreamFlush = (payload: StreamFlushPayload) => {
  const msg = messages.value.find((m) => m.id === payload.msgId)
  if (!msg) return

  if (msg.isLoading) msg.isLoading = false

  if (payload.contentChanged) {
    msg.content = payload.content
    scheduleRender(payload.msgId, payload.content, !payload.final)
  }
  if (payload.reasoningChanged) {
    msg.reasoningContent = payload.reasoning
  }
  if (payload.final) {
    isStreamingUi.value = false
  }
}

const textStreamBuffer = createStreamBuffer({
  // 内容刷新略快于 markdown 节流，保证气泡先跟上字，再补格式
  flushIntervalMs: 64,
  onFlush: applyStreamFlush,
})

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

onBeforeUnmount(() => {
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId)
  clearIntroStream()
  textStreamBuffer.dispose()
  for (const timer of pendingRenderTimers.values()) {
    window.clearTimeout(timer)
  }
  pendingRenderTimers.clear()
  if (live2dPausedByDialog) {
    setLive2dPaused(false)
    live2dPausedByDialog = false
  }
})

watch(
  () => props.open,
  (val) => {
    if (val) {
      // 立刻让出 Live2D 的 GPU/主线程预算
      if (!live2dPausedByDialog) {
        setLive2dPaused(true)
        live2dPausedByDialog = true
      }
      void loadAiOptions()
      if (!hasStreamedIntro.value) {
        // 下一帧再开打字机，避免与弹层首帧合成抢主线程
        requestAnimationFrame(() => {
          if (props.open) streamInitialGreeting()
        })
      }
      void scrollToBottom(true)
    } else {
      showPreviewImage.value = false
      previewImageUrl.value = ''
      isStreamingUi.value = false
      textStreamBuffer.flushFinal()
      clearIntroStream()
      if (live2dPausedByDialog) {
        setLive2dPaused(false)
        live2dPausedByDialog = false
      }
    }
  },
  { immediate: true }
)

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
  if (typeof direct === 'string') return direct.trim().toLowerCase()
  if (isRecord(payload.video)) {
    const nested = extractVideoStatus(payload.video)
    if (nested) return nested
  }
  if (isRecord(payload.data)) return extractVideoStatus(payload.data)
  if (isRecord(payload.result)) return extractVideoStatus(payload.result)
  return ''
}

const isVideoSuccessStatus = (status: string) =>
  ['done', 'completed', 'success', 'succeeded'].includes(status)

const isVideoFailureStatus = (status: string) =>
  ['failed', 'expired', 'error', 'canceled', 'cancelled'].includes(status)

const formatVideoStatus = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'queued':
      return '排队中'
    case 'pending':
      return '等待中'
    case 'running':
      return '生成中'
    case 'succeeded':
    case 'success':
    case 'completed':
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    case 'expired':
      return '已过期'
    case 'canceled':
    case 'cancelled':
      return '已取消'
    default:
      return status || '等待中'
  }
}

const extractVideoErrorMessage = (payload: unknown): string => {
  if (!isRecord(payload)) return ''
  for (const key of ['error', 'error_message', 'message', 'reason']) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  for (const key of ['video', 'data', 'result']) {
    const nested = extractVideoErrorMessage(payload[key])
    if (nested) return nested
  }
  return ''
}

const markMediaResultError = (message: ChatMessage, index: number, fallbackText: string) => {
  const item = message.results?.[index]
  if (!item) return
  item.error = fallbackText
}

const sendRequest = async (payload: AiComposerSendPayload) => {
  if (isSending.value) return
  if (!payload.text.trim() && payload.images.length === 0) return

  const userText = payload.text.trim()
  const currentImages = payload.images
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
    if (payload.mode === 'text') {
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

      // Since it's heavy to encode history images, let's just encode the CURRENT one to b64
      const latestInput: Record<string, unknown>[] = []
      if (userText) latestInput.push({ type: 'input_text', text: userText })
      for (const f of currentImages) {
        const b64 = await b64EncodeFile(f.file)
        latestInput.push({ type: 'input_image', image_url: b64, detail: 'high' })
      }

      // simplify history just for this prompt to avoid large payloads while testing
      const finalInput = [{ role: 'user', content: latestInput }]

      const streamPayload: Record<string, unknown> = {
        model: payload.chat.model || undefined,
        input: finalInput,
      }
      if (payload.chat.thinkingFeatureEnabled) {
        streamPayload.thinking = payload.chat.thinking
        if (payload.chat.thinking) {
          streamPayload.thinkingEffort = payload.chat.thinkingEffort || undefined
        }
      } else {
        streamPayload.thinking = false
      }

      isStreamingUi.value = true
      userPinnedToBottom = true
      textStreamBuffer.start(assistantMsgId)
      applyRenderedHtml(assistantMsgId, LOADING_CURSOR_HTML)

      await fetchAiChatStream(
        streamPayload,
        (chunk) => {
          // 仅写入非响应式缓冲，由 stream buffer 按 80ms 合并刷 UI
          textStreamBuffer.appendContent(chunk)
        },
        (reasoningChunk) => {
          textStreamBuffer.appendReasoning(reasoningChunk)
        },
        () => {
          // flushFinal 会带 final=true，内部完成全量 markdown + hljs
          textStreamBuffer.flushFinal()
          reactiveAsstMsg.isLoading = false
          isStreamingUi.value = false
          void scrollToBottom(true)
        },
        (err) => {
          textStreamBuffer.flushFinal()
          // 必须收尾 loading，否则 API Key 未配置等业务错误会让界面一直转圈
          reactiveAsstMsg.isLoading = false
          isStreamingUi.value = false
          const message = formatAiErrorMessage(err.message)
          reactiveAsstMsg.error = message
          toast.error(message)
        }
      )
    } else if (payload.mode === 'image') {
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
      for (let i = 0; i < payload.image.count; i++) {
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
                  model: payload.image.model,
                  prompt: userText || '编辑图片',
                  image: imageRefs[0],
                  n: payload.image.count,
                  resolution: payload.image.resolution,
                }
              : {
                  model: payload.image.model,
                  prompt: userText || '编辑图片',
                  images: imageRefs,
                  n: payload.image.count,
                  aspect_ratio: payload.image.ratio,
                  resolution: payload.image.resolution,
                }
          res = await aiEditImage(reqData)
        } else {
          const reqData: AiImageGenParams = {
            model: payload.image.model,
            prompt: userText,
            n: payload.image.count,
            aspect_ratio: payload.image.ratio,
            resolution: payload.image.resolution,
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
        // axios 拦截器已 toast，此处只更新气泡内错误态，避免重复提示
        reactiveImgMsg.error = formatAiErrorMessage(
          err instanceof Error ? err.message : String(err),
          '图像生成失败'
        )
      } finally {
        reactiveImgMsg.isLoading = false
      }
    } else if (payload.mode === 'video') {
      // Video generation
      const assistantMsgId = `vid-${Date.now()}`
      const asstMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        type: 'video_gen',
        sourcePrompt: userText,
        isLoading: true,
        status: 'queued',
        results: [],
      }
      messages.value.push(asstMsg)
      // Retrieve the reactive proxy from the array to ensure Vue tracks mutations
      const reactiveVidMsg = messages.value[messages.value.length - 1]!

      try {
        const reqData: AiVideoGenParams = {
          model: payload.video.model,
          prompt: userText || '生成视频',
          duration: payload.video.duration,
          resolution: payload.video.resolution,
        }
        if (currentImages.length === 1 && currentImages[0]) {
          reqData.image = {
            url: await encodeImageForAI(currentImages[0].file),
            type: 'image_url',
          }
        } else if (currentImages.length > 1) {
          reqData.aspect_ratio = payload.video.ratio
          reqData.reference_images = await Promise.all(
            currentImages.slice(0, 7).map(async (f) => ({
              url: await encodeImageForAI(f.file),
              type: 'image_url' as const,
            }))
          )
        } else {
          reqData.aspect_ratio = payload.video.ratio
        }

        const res = await aiGenerateVideo(reqData)
        // Interceptor already unwraps { code, data, msg } → data
        const requestId = extractRequestId(res)
        if (!requestId) throw new Error('未获取到任务ID')
        reactiveVidMsg.status = extractVideoStatus(res) || 'queued'

        // Polling loop
        let polling = true
        while (polling) {
          await sleep(3000)
          const statusRes = await aiGetVideoStatus(requestId)
          const statusData = statusRes as unknown
          if (statusData) {
            const currentStatus = extractVideoStatus(statusData)
            if (currentStatus) reactiveVidMsg.status = currentStatus

            if (isVideoSuccessStatus(currentStatus)) {
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
            } else if (isVideoFailureStatus(currentStatus)) {
              throw new Error(extractVideoErrorMessage(statusData) || '视频生成失败')
            }
          }
        }
      } catch (err: unknown) {
        // axios 拦截器已 toast，此处只更新气泡内错误态，避免重复提示
        reactiveVidMsg.error = formatAiErrorMessage(
          err instanceof Error ? err.message : String(err),
          '视频生成失败'
        )
      } finally {
        reactiveVidMsg.isLoading = false
      }
    }
  } finally {
    isSending.value = false
    void scrollToBottom()
  }
}

const handleComposerSend = (payload: AiComposerSendPayload) => {
  void sendRequest(payload)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6"
      @click.self="handleClose"
    >
      <!-- 无 backdrop-filter：全屏 blur 与 Live2D 画布叠加时极卡 -->
      <div class="absolute inset-0 bg-[var(--page-wash-3)]/88 pointer-events-none"></div>

      <!-- The Monolithic Canvas -->
      <div
        class="relative flex flex-col w-full max-w-[1024px] h-[92vh] bg-[var(--bg-surface-0)] rounded-[2.5rem] shadow-cinematic ring-1 ring-[var(--glass-border)] overflow-hidden ai-dialog-shell"
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
            <h2 class="text-xs font-bold tracking-[0.2em] text-[var(--text-1)] uppercase font-mono">
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
          class="flex-1 overflow-y-auto overflow-x-hidden px-8 sm:px-16 py-8 flex flex-col gap-12 custom-scrollbar ai-chat-scroll"
          :class="isStreamingUi ? 'ai-chat-scroll--streaming' : ''"
          @scroll.passive="handleChatScroll"
        >
          <div
            v-for="msg in messages"
            :key="msg.id"
            v-memo="[
              msg.id,
              msg.content,
              msg.reasoningContent,
              msg.isLoading,
              msg.error,
              msg.status,
              msg.results,
              renderedHtmlMap[msg.id],
              videoResultsMap[msg.id],
              activeAssetActionKey,
              isCoverPickerMode,
            ]"
            class="flex w-full group ai-msg-row"
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
                class="group/reasoning w-full overflow-hidden text-[13px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-1)] contain-content"
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
                    class="w-2 h-2 rounded-full bg-[var(--text-2)] group-open/reasoning:bg-[var(--status-success)] transition-colors"
                  ></span>
                  <span class="tracking-widest uppercase text-[10px] font-bold"
                    >Thought Process</span
                  >
                </summary>
                <div
                  class="px-5 py-4 font-mono text-[var(--text-2)] leading-relaxed whitespace-pre-wrap border-t border-[var(--border-color)] bg-[var(--bg-surface-2)] opacity-80 max-h-64 overflow-y-auto custom-scrollbar"
                >
                  {{ msg.reasoningContent }}
                </div>
              </details>

              <!-- Markdown Content -->
              <div
                v-if="
                  msg.role === 'user'
                    ? msg.content !== undefined
                    : primaryContentMap[msg.id] || msg.content
                "
                class="leading-[1.7] break-words text-[15px] contain-content"
                :class="[
                  msg.role === 'user'
                    ? 'px-6 py-4 bg-[var(--bg-surface-2)] text-[var(--text-1)] rounded-[24px] rounded-br-sm border border-[var(--border-color)] shadow-raised font-medium'
                    : 'markdown-body ai-assistant-bubble text-[var(--text-1)] w-full',
                ]"
                @click="msg.role === 'assistant' ? handleAssistantMarkupClick($event) : undefined"
                v-html="msg.role === 'assistant' ? getRenderedHtml(msg) : msg.content"
              ></div>

              <div
                v-if="msg.role === 'assistant' && (videoResultsMap[msg.id]?.length ?? 0) > 0"
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
                    class="group relative overflow-hidden rounded-[1.35rem] border border-[var(--border-color)] bg-[var(--bg-surface-1)] px-5 py-4 text-left transition-transform duration-300 hover:-translate-y-0.5 hover:border-[var(--brand-blue)]/40 hover:shadow-raised"
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
                      loading="lazy"
                      decoding="async"
                      class="w-full h-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
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
                  class="relative w-[28rem] sm:w-[38rem] aspect-video rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-1)] border border-[var(--border-color)] flex flex-col items-center justify-center gap-5 shadow-surface"
                >
                  <div
                    class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--brand-blue)]/10 to-transparent animate-shimmer"
                    style="background-size: 200% 100%"
                  ></div>
                  <div
                    class="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-0)]/80 shadow-surface"
                  >
                    <Loader2 class="h-7 w-7 animate-spin text-[var(--brand-blue)]" />
                  </div>
                  <div class="relative z-10 flex flex-col items-center gap-2 text-center">
                    <span
                      class="text-[10px] font-mono tracking-[0.3em] font-bold text-[var(--brand-blue)]"
                    >
                      {{ (msg.status || 'queued').toUpperCase() }}
                    </span>
                    <span class="text-sm font-medium text-[var(--text-1)]">
                      {{ formatVideoStatus(msg.status) }}
                    </span>
                  </div>
                </div>
                <div
                  v-else-if="msg.results?.length"
                  class="relative group w-[28rem] sm:w-[38rem] aspect-video rounded-[1.5rem] overflow-hidden bg-black shadow-cinematic ring-1 ring-[var(--border-color)]"
                >
                  <video
                    :src="msg.results?.[0]?.url"
                    controls
                    class="w-full h-full object-contain"
                    preload="metadata"
                    playsinline
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
                        void downloadAsset(msg.results?.[0]?.url || '', `ai-vid-${Date.now()}.mp4`)
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

        <!-- v-memo：消息流式更新时不重绘底部命令栏；切模型状态在子组件内部 -->
        <AiChatComposer
          v-memo="[
            isSending,
            isCoverPickerMode,
            initialModel,
            initialPrompt,
            chatModelOptions,
            imageModelOptions,
            videoModelOptions,
            thinkingEffortOptions,
            thinkingFeatureEnabled,
            defaultChatModel,
            defaultImageModel,
            defaultVideoModel,
            defaultThinkingEffort,
          ]"
          :is-sending="isSending"
          :cover-picker-mode="isCoverPickerMode"
          :initial-model="initialModel"
          :initial-prompt="initialPrompt"
          :chat-model-options="chatModelOptions"
          :image-model-options="imageModelOptions"
          :video-model-options="videoModelOptions"
          :thinking-effort-options="thinkingEffortOptions"
          :thinking-feature-enabled="thinkingFeatureEnabled"
          :default-chat-model="defaultChatModel"
          :default-image-model="defaultImageModel"
          :default-video-model="defaultVideoModel"
          :default-thinking-effort="defaultThinkingEffort"
          @send="handleComposerSend"
        />
      </div>
    </div>
  </Teleport>
  <ImageViewer v-model="showPreviewImage" :src="previewImageUrl" />
</template>

<style scoped>
/* 布局隔离：消息行与滚动区变更不牵连整层 dialog 重算 */
.ai-dialog-shell {
  contain: layout style;
  transform: translateZ(0);
}

.ai-chat-scroll {
  /* 不用 size/strict containment，避免 flex-1 滚动高度被算成 0 */
  contain: layout style;
  overscroll-behavior: contain;
}

.ai-chat-scroll--streaming {
  scroll-behavior: auto;
}

.ai-msg-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 140px;
  contain: layout style;
}

.contain-content {
  contain: content;
}

/* Ultra Premium Typography Reset adapted for theme variables */
:deep(.markdown-body) {
  font-family: inherit;
  color: inherit;
}

:deep(.ai-assistant-bubble) {
  border-radius: 1.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-surface-1);
  box-shadow: var(--shadow-raised);
  padding: 1.15rem 1.25rem;

  /* v-html 高频更新时限制重绘范围 */
  contain: content;
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
  color: inherit;
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
  /* 不要写死 color，否则会盖掉子 span 的 token 色观感 */
  color: inherit;
  background: transparent;
}

/*
 * 语法高亮色板：必须有足够对比度，之前几乎全是 text-1/text-2 灰阶，
 * 看起来像“完全没有高亮”。
 */
:deep(.markdown-body .hljs) {
  color: var(--text-1);
  background: transparent;
}

:deep(.markdown-body .hljs-comment),
:deep(.markdown-body .hljs-quote) {
  color: oklch(62% 0.02 250deg);
  font-style: italic;
}

:deep(.markdown-body .hljs-keyword),
:deep(.markdown-body .hljs-selector-tag),
:deep(.markdown-body .hljs-literal),
:deep(.markdown-body .hljs-section),
:deep(.markdown-body .hljs-link) {
  color: oklch(55% 0.18 290deg);
  font-weight: 600;
}

:deep(.markdown-body .hljs-built_in),
:deep(.markdown-body .hljs-type),
:deep(.markdown-body .hljs-params),
:deep(.markdown-body .hljs-class .hljs-title),
:deep(.markdown-body .hljs-title.class_) {
  color: oklch(58% 0.14 55deg);
}

:deep(.markdown-body .hljs-string),
:deep(.markdown-body .hljs-meta-string),
:deep(.markdown-body .hljs-template-tag),
:deep(.markdown-body .hljs-template-variable),
:deep(.markdown-body .hljs-addition) {
  color: oklch(52% 0.14 150deg);
}

:deep(.markdown-body .hljs-number),
:deep(.markdown-body .hljs-symbol),
:deep(.markdown-body .hljs-bullet),
:deep(.markdown-body .hljs-regexp) {
  color: oklch(55% 0.16 25deg);
}

:deep(.markdown-body .hljs-title),
:deep(.markdown-body .hljs-title.function_),
:deep(.markdown-body .hljs-function .hljs-title),
:deep(.markdown-body .hljs-attribute) {
  color: oklch(52% 0.16 250deg);
}

:deep(.markdown-body .hljs-variable),
:deep(.markdown-body .hljs-name),
:deep(.markdown-body .hljs-tag),
:deep(.markdown-body .hljs-selector-id),
:deep(.markdown-body .hljs-selector-class) {
  color: oklch(50% 0.15 350deg);
}

:deep(.markdown-body .hljs-meta),
:deep(.markdown-body .hljs-doctag),
:deep(.markdown-body .hljs-attr) {
  color: oklch(50% 0.1 200deg);
}

:deep(.markdown-body .hljs-deletion) {
  color: oklch(55% 0.18 25deg);
}

:deep(.markdown-body .hljs-emphasis) {
  font-style: italic;
}

:deep(.markdown-body .hljs-strong) {
  font-weight: 700;
}

:root.dark :deep(.markdown-body .hljs-comment),
:root.dark :deep(.markdown-body .hljs-quote),
.dark :deep(.markdown-body .hljs-comment),
.dark :deep(.markdown-body .hljs-quote) {
  color: oklch(68% 0.02 250deg);
}

:root.dark :deep(.markdown-body .hljs-keyword),
:root.dark :deep(.markdown-body .hljs-selector-tag),
:root.dark :deep(.markdown-body .hljs-literal),
:root.dark :deep(.markdown-body .hljs-section),
:root.dark :deep(.markdown-body .hljs-link),
.dark :deep(.markdown-body .hljs-keyword),
.dark :deep(.markdown-body .hljs-selector-tag),
.dark :deep(.markdown-body .hljs-literal),
.dark :deep(.markdown-body .hljs-section),
.dark :deep(.markdown-body .hljs-link) {
  color: oklch(78% 0.16 290deg);
}

:root.dark :deep(.markdown-body .hljs-built_in),
:root.dark :deep(.markdown-body .hljs-type),
:root.dark :deep(.markdown-body .hljs-params),
:root.dark :deep(.markdown-body .hljs-class .hljs-title),
:root.dark :deep(.markdown-body .hljs-title.class_),
.dark :deep(.markdown-body .hljs-built_in),
.dark :deep(.markdown-body .hljs-type),
.dark :deep(.markdown-body .hljs-params),
.dark :deep(.markdown-body .hljs-class .hljs-title),
.dark :deep(.markdown-body .hljs-title.class_) {
  color: oklch(82% 0.12 75deg);
}

:root.dark :deep(.markdown-body .hljs-string),
:root.dark :deep(.markdown-body .hljs-meta-string),
:root.dark :deep(.markdown-body .hljs-template-tag),
:root.dark :deep(.markdown-body .hljs-template-variable),
:root.dark :deep(.markdown-body .hljs-addition),
.dark :deep(.markdown-body .hljs-string),
.dark :deep(.markdown-body .hljs-meta-string),
.dark :deep(.markdown-body .hljs-template-tag),
.dark :deep(.markdown-body .hljs-template-variable),
.dark :deep(.markdown-body .hljs-addition) {
  color: oklch(80% 0.12 150deg);
}

:root.dark :deep(.markdown-body .hljs-number),
:root.dark :deep(.markdown-body .hljs-symbol),
:root.dark :deep(.markdown-body .hljs-bullet),
:root.dark :deep(.markdown-body .hljs-regexp),
.dark :deep(.markdown-body .hljs-number),
.dark :deep(.markdown-body .hljs-symbol),
.dark :deep(.markdown-body .hljs-bullet),
.dark :deep(.markdown-body .hljs-regexp) {
  color: oklch(78% 0.14 40deg);
}

:root.dark :deep(.markdown-body .hljs-title),
:root.dark :deep(.markdown-body .hljs-title.function_),
:root.dark :deep(.markdown-body .hljs-function .hljs-title),
:root.dark :deep(.markdown-body .hljs-attribute),
.dark :deep(.markdown-body .hljs-title),
.dark :deep(.markdown-body .hljs-title.function_),
.dark :deep(.markdown-body .hljs-function .hljs-title),
.dark :deep(.markdown-body .hljs-attribute) {
  color: oklch(80% 0.12 230deg);
}

:root.dark :deep(.markdown-body .hljs-variable),
:root.dark :deep(.markdown-body .hljs-name),
:root.dark :deep(.markdown-body .hljs-tag),
:root.dark :deep(.markdown-body .hljs-selector-id),
:root.dark :deep(.markdown-body .hljs-selector-class),
.dark :deep(.markdown-body .hljs-variable),
.dark :deep(.markdown-body .hljs-name),
.dark :deep(.markdown-body .hljs-tag),
.dark :deep(.markdown-body .hljs-selector-id),
.dark :deep(.markdown-body .hljs-selector-class) {
  color: oklch(82% 0.12 350deg);
}

:root.dark :deep(.markdown-body .hljs-meta),
:root.dark :deep(.markdown-body .hljs-doctag),
:root.dark :deep(.markdown-body .hljs-attr),
.dark :deep(.markdown-body .hljs-meta),
.dark :deep(.markdown-body .hljs-doctag),
.dark :deep(.markdown-body .hljs-attr) {
  color: oklch(78% 0.08 200deg);
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

/* Animations — 仅 transform/opacity，时长缩短以降低打开卡顿 */
.ease-out-expo {
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

/* 打开动画只做 opacity，避免 scale 触发大面积图层重绘 */
.zen-modal-enter-active,
.zen-modal-leave-active {
  transition: opacity 0.16s linear;
}

.zen-modal-enter-from,
.zen-modal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .zen-modal-enter-active,
  .zen-modal-leave-active,
  .animate-shimmer {
    animation: none !important;
    transition: none !important;
  }
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
