<script setup lang="ts">
import { ref, reactive, nextTick, watch, onBeforeUnmount, computed, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { getAccessToken } from '@/api/request'
import {
  X,
  Download,
  Loader2,
  Bot,
  UploadCloud,
  ArrowDown,
  ChevronDown,
  Brain,
} from 'lucide-vue-next'
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
  type AiResponsesContentPart,
  type AiResponsesMessage,
  type AiResponsesRequest,
} from '@/api/ai'
import { toast } from 'vue-sonner'
import ImageViewer from '@/components/common/ImageViewer.vue'
import AiChatComposer from '@/components/ai/AiChatComposer.vue'
import { useCreatorBridgeStore } from '@/stores/creatorBridge'
import { useSubmissionAccess, SUBMISSION_DISABLED_MESSAGE } from '@/composables/useSubmissionAccess'
import { buildAiSuggestedTitle, fetchAiAssetAsFile } from '@/utils/ai-assets'
import { renderMarkdownHtml } from '@/components/ai/ai-markdown'
import { createStreamBuffer, type StreamFlushPayload } from '@/components/ai/ai-stream-buffer'
import type { AiComposerSendPayload, AiModelType } from '@/components/ai/ai-types'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import AiChatWelcome from './AiChatWelcome.vue'
import AiMessageActions from './AiMessageActions.vue'
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
const { authStore, siteStore, submissionBlocked } = useSubmissionAccess()

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
  notice?: string
}

interface VideoResultItem {
  title: string
  href: string
  description: string
}

const messages = ref<ChatMessage[]>([])

const composerRef = ref<InstanceType<typeof AiChatComposer> | null>(null)

const hasConversation = computed(() => messages.value.length > 0)
const choosePrompt = (mode: AiModelType, prompt: string) =>
  composerRef.value?.choosePrompt(mode, prompt)
const isSending = ref(false)
let activeRequest: AbortController | null = null
const stopRequest = () => activeRequest?.abort()
/** 流式输出中：关闭 scroll-smooth，减少强制布局抖动 */
const isStreamingUi = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)
const previewImageUrl = ref('')
const showPreviewImage = ref(false)
const activeAssetActionKey = ref<string | null>(null)
let live2dPausedByDialog = false

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
const userPinnedToBottom = ref(true)
const SCROLL_PIN_THRESHOLD = 96

const scheduleScroll = (force = false) => {
  if (!force && !userPinnedToBottom.value) return
  if (scrollRafId !== null) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    const el = chatScrollRef.value
    if (!el) return
    el.scrollTop = el.scrollHeight
  })
}

const scrollToBottom = async (force = false) => {
  await nextTick()
  if (force) userPinnedToBottom.value = true
  scheduleScroll(force)
}

const handleChatScroll = () => {
  const el = chatScrollRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  userPinnedToBottom.value = distance <= SCROLL_PIN_THRESHOLD
}

// --- Markdown / content cache ---
// Maps message id → rendered HTML. Updated at display-rate, not chunk-rate.
const renderedHtmlMap = reactive<Record<string, string>>({})
const LOADING_CURSOR_HTML = '<span class="ai-stream-cursor" aria-hidden="true"></span>'

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
    delete pendingRenderRaw[msgId]
    delete pendingRenderStreaming[msgId]
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
      copyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="group-hover/copy:text-[var(--brand-blue)]"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
      copyButton.dataset.copied = 'false'
    }, 1400)
  } catch {
    toast.error('复制失败')
  }
}

onBeforeUnmount(() => {
  stopRequest()
  if (scrollRafId !== null) cancelAnimationFrame(scrollRafId)
  textStreamBuffer.dispose()
  for (const timer of pendingRenderTimers.values()) {
    window.clearTimeout(timer)
  }
  pendingRenderTimers.clear()
  for (const message of messages.value) {
    for (const url of message.images ?? []) URL.revokeObjectURL(url)
  }
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
      void scrollToBottom(true)
    } else {
      stopRequest()
      showPreviewImage.value = false
      previewImageUrl.value = ''
      isStreamingUi.value = false
      textStreamBuffer.flushFinal()
      if (live2dPausedByDialog) {
        setLive2dPaused(false)
        live2dPausedByDialog = false
      }
    }
  },
  { immediate: true }
)

// —— 会话记忆 ——
// 后端 /responses 是无状态代理，多轮上下文必须由前端把历史一起带上。
// 图片只在「当前这一轮」以 data URI 发送（后端交给多模态向量模型做 RAG 检索）；
// 历史里的图片折叠成占位符，避免每轮都把几百 KB 的 base64 重复上行。
// 条数与字符预算由后端 conversation.trimHistory 统一裁剪，避免前端更小的硬编码窗口
// 提前丢失仍在后端预算内的上下文。

/** 把一条历史消息压成纯文本；无内容可带时返回空串。 */
const historyMessageText = (message: ChatMessage): string => {
  if (message.type === 'image_gen') {
    const count = message.results?.filter((item) => item.url).length ?? 0
    return count > 0 ? `（已为用户生成 ${count} 张图片）` : ''
  }

  if (message.type === 'video_gen') {
    const count = message.results?.filter((item) => item.url).length ?? 0
    return count > 0 ? '（已为用户生成视频）' : ''
  }

  const parts: string[] = []
  if (message.content?.trim()) parts.push(message.content.trim())
  if (message.role === 'user' && message.images?.length) {
    parts.push(`[用户上传了 ${message.images.length} 张图片]`)
  }

  return parts.join('\n')
}

/** 从历史消息构建 Responses 格式的多轮上下文。 */
const buildHistoryMessages = (history: ChatMessage[]): AiResponsesMessage[] => {
  const result: AiResponsesMessage[] = []

  for (const message of history) {
    // 仍在流式中的占位消息没有可用内容，带上去只会污染上下文
    if (message.isLoading || message.error) continue

    const text = historyMessageText(message)
    if (!text) continue

    result.push({
      role: message.role,
      content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text }],
    })
  }

  return result
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

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })

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
  if (!(await siteStore.refreshConfig(true)) || !(await authStore.fetchUserInfo())) {
    toast.error('无法确认投稿权限，请稍后重试')
    return
  }
  if (submissionBlocked.value) {
    toast.error(SUBMISSION_DISABLED_MESSAGE)
    return
  }
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
  message.results = message.results?.map((item, i) =>
    i === index ? { ...item, error: fallbackText } : item
  )
}

const ensureLoggedIn = () => {
  if (authStore.isLoggedIn && getAccessToken()) return true
  window.dispatchEvent(new CustomEvent('auth:login-required'))
  return false
}

const sendRequest = async (payload: AiComposerSendPayload) => {
  if (isSending.value) return
  if (!payload.text.trim() && payload.images.length === 0) return
  if (!ensureLoggedIn()) return

  const userText = payload.text.trim()
  const currentImages = payload.images
  const controller = new AbortController()
  const { signal } = controller
  activeRequest = controller
  let assistantMessage: ChatMessage | undefined
  isSending.value = true

  // 先快照历史，再 push 本轮消息，避免把当前这一轮重复带进上下文
  const historyMessages = buildHistoryMessages(messages.value)

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
      assistantMessage = reactiveAsstMsg
      textStreamBuffer.start(assistantMsgId)
      void scrollToBottom(true)

      // 只有当前这一轮才带真实图片数据：后端用多模态向量模型把「文本+图片」融合成
      // 同一个向量，去站内作品库做 RAG 召回，从而支持「以图搜视频」。
      const latestInput: AiResponsesContentPart[] = []
      if (userText) latestInput.push({ type: 'input_text', text: userText })
      for (const f of currentImages) {
        // 先降采样再编码，避免整张原图的 base64 上行
        const b64 = await encodeImageForAI(f.file)
        latestInput.push({ type: 'input_image', image_url: b64, detail: 'high' })
      }

      const finalInput: AiResponsesMessage[] = [
        ...historyMessages,
        { role: 'user', content: latestInput },
      ]

      const streamPayload: AiResponsesRequest = {
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
      userPinnedToBottom.value = true
      signal.throwIfAborted()
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
          void scrollToBottom()
        },
        (err) => {
          textStreamBuffer.flushFinal()
          // 必须收尾 loading，否则 API Key 未配置等业务错误会让界面一直转圈
          reactiveAsstMsg.isLoading = false
          isStreamingUi.value = false
          if (signal.aborted) return
          const message = formatAiErrorMessage(err.message)
          reactiveAsstMsg.error = message
          toast.error(message)
        },
        signal
      )
      signal.throwIfAborted()
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
      assistantMessage = reactiveImgMsg
      void scrollToBottom(true)

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
          res = await aiEditImage(reqData, signal)
        } else {
          const reqData: AiImageGenParams = {
            model: payload.image.model,
            prompt: userText,
            n: payload.image.count,
            aspect_ratio: payload.image.ratio,
            resolution: payload.image.resolution,
          }
          res = await aiGenerateImage(reqData, signal)
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
        if (signal.aborted) throw err
        // axios 拦截器已 toast，此处只更新气泡内错误态，避免重复提示
        reactiveImgMsg.error = formatAiErrorMessage(
          err instanceof Error ? err.message : String(err),
          '图像生成失败'
        )
      } finally {
        reactiveImgMsg.isLoading = false
        if (reactiveImgMsg.error) {
          reactiveImgMsg.results = reactiveImgMsg.results?.filter((result) => result.url)
        }
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
      assistantMessage = reactiveVidMsg
      void scrollToBottom(true)

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

        const res = await aiGenerateVideo(reqData, signal)
        // Interceptor already unwraps { code, data, msg } → data
        const requestId = extractRequestId(res)
        if (!requestId) throw new Error('未获取到任务ID')
        reactiveVidMsg.status = extractVideoStatus(res) || 'queued'

        // Polling loop
        const pollingDeadline = Date.now() + 10 * 60 * 1000
        let polling = true
        while (polling) {
          await sleep(3000, signal)
          if (Date.now() >= pollingDeadline) {
            throw new Error('视频生成等待超时，请稍后重试')
          }
          const statusRes = await aiGetVideoStatus(requestId, signal)
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
        if (signal.aborted) throw err
        // axios 拦截器已 toast，此处只更新气泡内错误态，避免重复提示
        reactiveVidMsg.error = formatAiErrorMessage(
          err instanceof Error ? err.message : String(err),
          '视频生成失败'
        )
      } finally {
        reactiveVidMsg.isLoading = false
      }
    }
  } catch (err: unknown) {
    if (assistantMessage) {
      assistantMessage.isLoading = false
      if (signal.aborted) {
        assistantMessage.notice =
          payload.mode === 'text' ? '已停止生成' : '已停止等待，已创建的生成任务可能仍在处理'
        if (payload.mode === 'image') {
          assistantMessage.results = assistantMessage.results?.filter((result) => result.url)
        }
      } else {
        const message = formatAiErrorMessage(err instanceof Error ? err.message : String(err))
        assistantMessage.error = message
        toast.error(message)
      }
    }
  } finally {
    if (payload.mode === 'text') textStreamBuffer.flushFinal()
    if (activeRequest === controller) activeRequest = null
    isSending.value = false
    void scrollToBottom()
  }
}

const handleComposerSend = (payload: AiComposerSendPayload) => {
  void sendRequest(payload)
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="ai-dialog-overlay" />
      <DialogContent class="ai-dialog-shell">
        <header class="ai-dialog-header">
          <div class="ai-dialog-identity">
            <span class="ai-dialog-mark"><Bot :size="21" :stroke-width="1.6" /></span>
            <div>
              <DialogTitle class="ai-dialog-title">灵感会客室<span>AI</span></DialogTitle>
              <DialogDescription class="ai-dialog-description">你的全能视频助手</DialogDescription>
            </div>
          </div>
          <div class="ai-header-actions">
            <span class="ai-session-status" role="status"
              ><i :class="{ 'is-active': isSending }"></i
              >{{ isSending ? '正在回应' : '随时，聊聊' }}</span
            >
            <button type="button" aria-label="关闭 AI 助手" class="ai-close" @click="handleClose">
              <X :size="18" />
            </button>
          </div>
        </header>

        <!-- Immersive Chat Area -->
        <div
          ref="chatScrollRef"
          class="custom-scrollbar ai-chat-scroll"
          aria-label="对话记录"
          :class="isStreamingUi ? 'ai-chat-scroll--streaming' : ''"
          @scroll.passive="handleChatScroll"
        >
          <AiChatWelcome
            v-if="!hasConversation"
            :cover-picker-mode="isCoverPickerMode"
            @choose="choosePrompt"
          />
          <div v-else class="ai-conversation-start"><span>灵感，从这里开始</span></div>
          <div
            v-for="msg in messages"
            :key="msg.id"
            v-memo="[
              msg.id,
              msg.content,
              msg.reasoningContent,
              msg.isLoading,
              msg.error,
              msg.notice,
              msg.status,
              msg.results,
              renderedHtmlMap[msg.id],
              videoResultsMap[msg.id],
              activeAssetActionKey,
              isCoverPickerMode,
              isSending,
            ]"
            class="flex w-full group ai-msg-row"
            :class="msg.role === 'user' ? 'ai-msg-row--user' : 'ai-msg-row--assistant'"
          >
            <div v-if="msg.role === 'assistant'" class="ai-message-avatar" aria-hidden="true">
              <Bot :size="18" :stroke-width="1.5" />
            </div>

            <!-- Content Area -->
            <div
              class="ai-message-content"
              :class="[
                msg.role === 'user' ? 'items-end' : 'items-start',
                msg.type === 'video_gen' ? 'w-full' : '',
              ]"
            >
              <div v-if="msg.role === 'assistant'" class="ai-message-author">
                视频助手<span>AI</span>
              </div>
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
                  :alt="`上传的图片 ${idx + 1}`"
                />
              </div>

              <!-- 按需展开思考过程 -->
              <details v-if="msg.reasoningContent" class="ai-reasoning">
                <summary>
                  <Brain :size="14" /><span>{{
                    isSending && !msg.content ? '正在梳理思路' : '查看思考过程'
                  }}</span
                  ><ChevronDown :size="14" class="ai-reasoning-chevron" />
                </summary>
                <div class="ai-reasoning-content custom-scrollbar">{{ msg.reasoningContent }}</div>
              </details>

              <!-- Markdown Content -->
              <div
                v-if="msg.role === 'user' && msg.content"
                class="ai-user-bubble"
                v-text="msg.content"
              ></div>
              <div
                v-else-if="msg.role === 'assistant' && (primaryContentMap[msg.id] || msg.content)"
                class="markdown-body ai-assistant-bubble"
                @click="handleAssistantMarkupClick"
                v-html="getRenderedHtml(msg)"
              ></div>

              <div
                v-if="msg.role === 'assistant' && (videoResultsMap[msg.id]?.length ?? 0) > 0"
                class="mt-4 w-full"
              >
                <div class="mb-3 flex items-center gap-2">
                  <span class="h-2 w-2 rounded-full bg-[var(--brand-blue)]"></span>
                  <span
                    class="text-[11px] font-bold tracking-[0.24em] uppercase text-[var(--text-2)]"
                  >
                    为你找到的视频
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
                        class="shrink-0 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface-2)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-2)] duration-300 group-hover:text-[var(--brand-blue)]"
                      >
                        查看
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
                class="ai-waiting"
                role="status"
              >
                <span class="ai-waiting-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                <span>正在想一想</span>
              </div>

              <AiMessageActions
                v-if="msg.role === 'assistant' && msg.content && !msg.isLoading && !isSending"
                :content="msg.content"
              />

              <p v-if="msg.notice" role="status" class="text-sm text-muted-foreground">
                {{ msg.notice }}
              </p>

              <!-- Error Toast -->
              <div
                v-if="msg.error"
                role="alert"
                class="px-4 py-2 bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] text-sm rounded-xl border border-[var(--status-danger-border)] flex items-center gap-2"
              >
                <span class="w-2 h-2 rounded-full bg-[var(--status-danger)]"></span>
                {{ msg.error }}
              </div>

              <!-- 生成图片 -->
              <div
                v-if="msg.type === 'image_gen' && msg.results"
                class="mt-4 grid gap-3 self-start"
                :class="
                  msg.results.length > 1 ? 'w-full grid-cols-2' : 'w-[20rem] max-w-full grid-cols-1'
                "
              >
                <div
                  v-for="(res, idx) in msg.results"
                  :key="idx"
                  class="relative group aspect-square min-w-0 rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-1)] shadow-raised ring-1 ring-[var(--border-color)]"
                  :class="res.url && !res.error ? 'cursor-zoom-in' : ''"
                  @click="res.url && !res.error ? openImagePreview(res.url) : undefined"
                >
                  <div v-if="!res.url && !res.error" class="ai-image-pending">
                    <div class="ai-image-pending__sheen animate-shimmer"></div>
                    <span class="ai-image-pending__number">{{
                      String(idx + 1).padStart(2, '0')
                    }}</span>
                    <Loader2 :size="24" :stroke-width="1.3" class="animate-spin" />
                    <span>正在描绘你的想象</span>
                  </div>
                  <div
                    v-else-if="res.error"
                    class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
                  >
                    <span class="text-xs text-[var(--status-danger)]">{{ res.error }}</span>
                  </div>
                  <template v-else>
                    <div
                      class="ai-asset-actions absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300"
                    >
                      <button
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] shadow-overlay backdrop-blur-md"
                        title="下载图片"
                        @click.stop.prevent="void downloadAsset(res.url, `ai-${Date.now()}.png`)"
                      >
                        <Download class="w-4 h-4" />
                      </button>
                      <button
                        v-if="isCoverPickerMode"
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] shadow-overlay backdrop-blur-md"
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
                      :alt="`生成的图片 ${idx + 1}`"
                      referrerpolicy="no-referrer"
                      loading="lazy"
                      decoding="async"
                      class="w-full h-full object-cover transition-transform duration-500 ease-out-expo group-hover:scale-105"
                      @click.stop="openImagePreview(res.url)"
                      @error="markMediaResultError(msg, idx, '图片加载失败，请重新生成')"
                    />
                  </template>
                </div>
              </div>

              <!-- 生成视频 -->
              <div v-if="msg.type === 'video_gen'" class="mt-4 w-full">
                <div
                  v-if="msg.isLoading"
                  class="ai-video-frame relative aspect-video rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-1)] border border-[var(--border-color)] flex flex-col items-center justify-center gap-2 sm:gap-5 shadow-surface"
                >
                  <div
                    class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--brand-blue)]/10 to-transparent animate-shimmer"
                    style="background-size: 200% 100%"
                  ></div>
                  <div
                    class="relative z-10 flex h-9 w-9 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-surface-0)]/80 shadow-surface"
                  >
                    <Loader2 class="h-4 w-4 sm:h-7 sm:w-7 animate-spin text-[var(--brand-blue)]" />
                  </div>
                  <div class="relative z-10 flex flex-col items-center gap-1 sm:gap-2 text-center">
                    <span class="text-[10px] tracking-[0.3em] font-bold text-[var(--brand-blue)]">
                      {{ (msg.status || 'queued').toUpperCase() }}
                    </span>
                    <span class="text-sm font-medium text-[var(--text-1)]">
                      {{ formatVideoStatus(msg.status) }}
                    </span>
                  </div>
                </div>
                <div
                  v-else-if="msg.results?.[0]?.error"
                  role="alert"
                  class="ai-video-frame aspect-video flex items-center justify-center rounded-2xl border border-border p-6 text-sm text-muted-foreground"
                >
                  {{ msg.results[0].error }}
                </div>
                <div
                  v-else-if="msg.results?.length"
                  class="ai-video-frame relative group aspect-video rounded-[1.5rem] overflow-hidden bg-[var(--bg-surface-0)] shadow-cinematic ring-1 ring-[var(--border-color)]"
                >
                  <video
                    :src="msg.results?.[0]?.url"
                    controls
                    class="w-full h-full object-contain"
                    preload="metadata"
                    playsinline
                    muted
                    @error="markMediaResultError(msg, 0, '视频加载失败，请重新生成')"
                  />
                  <div
                    class="ai-asset-actions absolute top-4 right-4 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300"
                  >
                    <button
                      class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] shadow-overlay backdrop-blur-md"
                      title="下载视频"
                      @click.prevent="
                        void downloadAsset(msg.results?.[0]?.url || '', `ai-vid-${Date.now()}.mp4`)
                      "
                    >
                      <Download class="w-4 h-4" />
                    </button>
                    <button
                      v-if="showVideoSubmitAction"
                      class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-1)] hover:text-[var(--brand-blue)] shadow-overlay backdrop-blur-md"
                      :disabled="
                        submissionBlocked ||
                        isAssetActionBusy(makeAssetActionKey(msg.id, 0, 'submit'))
                      "
                      :title="
                        submissionBlocked
                          ? SUBMISSION_DISABLED_MESSAGE
                          : '一键投稿：跳转到投稿页并自动上传'
                      "
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
          </div>
        </div>

        <div v-if="hasConversation && !userPinnedToBottom" class="ai-jump-wrap">
          <button type="button" class="ai-jump" @click="scrollToBottom(true)">
            <ArrowDown :size="14" />回到最新消息
          </button>
        </div>
        <!-- v-memo：消息流式更新时不重绘底部命令栏；切模型状态在子组件内部 -->
        <AiChatComposer
          ref="composerRef"
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
          :before-send="ensureLoggedIn"
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
          @stop="stopRequest"
        />
      </DialogContent>
    </DialogPortal>
    <DialogRoot v-model:open="showPreviewImage">
      <DialogPortal>
        <DialogContent class="ai-preview-shell">
          <DialogTitle class="sr-only">查看生成图片</DialogTitle>
          <DialogDescription class="sr-only">支持缩放、旋转和下载前预览</DialogDescription>
          <ImageViewer v-model="showPreviewImage" :src="previewImageUrl" teleport-disabled />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </DialogRoot>
</template>

<style scoped lang="scss">
.ai-preview-shell {
  position: fixed;
  z-index: 100100;
  inset: 0;
}
.ai-image-pending {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  overflow: hidden;
  color: var(--text-2);
  background: var(--bg-surface-1);
  font-size: 12px;
}
.ai-image-pending__number {
  position: absolute;
  top: 14px;
  left: 16px;
  font-size: 10px;
}
.ai-image-pending__sheen {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--skeleton-sheen), transparent);
}
.ai-dialog-shell[data-state='closed'] {
  animation: ai-fade-out 140ms ease-in forwards;
}
.ai-dialog-overlay[data-state='closed'] {
  animation: ai-fade-out 140ms ease-in forwards;
}

@keyframes ai-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.ai-dialog-overlay {
  position: fixed;
  z-index: 99998;
  inset: 0;
  background: var(--scrim-overlay);
  animation: ai-fade-in 180ms ease-out;
}

.ai-dialog-shell {
  position: fixed;
  z-index: 99999;
  inset: 0;
  display: flex;
  flex-direction: column;
  width: min(880px, calc(100% - 48px));
  height: min(820px, calc(100dvh - 64px));
  margin: auto;
  overflow: hidden;
  color: var(--text-1);
  background: var(--bg-surface-0);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  box-shadow: var(--shadow-cinematic-value);
  contain: layout style;
  animation: ai-panel-in 280ms var(--ease-out-quint);
}

.ai-dialog-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 21px 28px;
  border-bottom: 1px solid color-mix(in oklch, var(--border-color) 65%, transparent);
}

.ai-dialog-identity,
.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ai-dialog-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--brand-blue);
  background: var(--accent-surface);
  border: 1px solid color-mix(in oklch, var(--brand-blue) 20%, var(--border-color));
  border-radius: 14px;
}
.ai-dialog-title {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.03em;
}
.ai-dialog-title span,
.ai-message-author span {
  padding: 1px 5px;
  color: var(--text-2);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.ai-dialog-description {
  margin-top: 4px;
  color: var(--text-2);
  font-size: 11px;
}
.ai-session-status {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-right: 9px;
  color: var(--text-2);
  font-size: 11px;
}
.ai-session-status i {
  width: 5px;
  height: 5px;
  background: var(--text-2);
  border-radius: 50%;
}
.ai-session-status .is-active {
  background: var(--brand-blue);
  animation: ai-breathe 1.4s ease-in-out infinite;
}
.ai-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--text-2);
  border-radius: 10px;
}
.ai-close:hover {
  color: var(--text-1);
  background: var(--bg-surface-2);
}

.ai-chat-scroll {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 28px;
  min-height: 0;
  padding: 26px clamp(20px, 5vw, 60px) 32px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  contain: layout style;
}
.ai-conversation-start {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 0 0 2px;
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0.1em;
}
.ai-conversation-start::before,
.ai-conversation-start::after {
  flex: 1;
  height: 1px;
  background: var(--border-color);
  content: '';
}
.ai-msg-row {
  display: flex;
  flex-shrink: 0;
  gap: 12px;
  width: 100%;
  animation: ai-message-in 240ms var(--ease-out-quart);
}
.ai-msg-row--user {
  justify-content: flex-end;
}
.ai-message-avatar {
  display: grid;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--brand-blue);
  background: var(--accent-surface);
  border-radius: 10px;
}
.ai-message-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: calc(100% - 42px);
}
.ai-msg-row--assistant .ai-message-content {
  flex: 1;
}
.ai-msg-row--user .ai-message-content {
  max-width: 82%;
}
.ai-message-author {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 500;
}
.ai-user-bubble {
  padding: 12px 18px;
  overflow-wrap: anywhere;
  color: var(--text-1);
  background: color-mix(in oklch, var(--brand-blue) 8%, var(--bg-surface-1));
  border: 1px solid color-mix(in oklch, var(--brand-blue) 12%, var(--border-color));
  border-radius: 18px 18px 5px;
  font-size: 14px;
  line-height: 1.85;
  white-space: pre-wrap;
}
.ai-assistant-bubble {
  width: 100%;
  min-width: 0;
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.ai-reasoning {
  width: 100%;
  color: var(--text-2);
  background: var(--bg-surface-1);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  font-size: 12px;
}
.ai-reasoning summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 13px;
  cursor: pointer;
  list-style: none;
}
.ai-reasoning summary::-webkit-details-marker {
  display: none;
}
.ai-reasoning-chevron {
  margin-left: auto;
  transition: transform 180ms var(--ease-out-quart);
}
.ai-reasoning[open] .ai-reasoning-chevron {
  transform: rotate(180deg);
}
.ai-reasoning-content {
  max-height: 220px;
  padding: 12px 16px;
  overflow: auto;
  border-top: 1px solid var(--border-color);
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ai-waiting {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  color: var(--text-2);
  font-size: 12px;
}
.ai-waiting-dots {
  display: flex;
  gap: 4px;
}
.ai-waiting-dots i {
  width: 4px;
  height: 4px;
  background: var(--brand-blue);
  border-radius: 50%;
  animation: ai-breathe 1.2s ease-in-out infinite;
}
.ai-waiting-dots i:nth-child(2) {
  animation-delay: 160ms;
}
.ai-waiting-dots i:nth-child(3) {
  animation-delay: 320ms;
}
.ai-jump-wrap {
  position: relative;
  z-index: 21;
  display: flex;
  justify-content: center;
  height: 0;
}
.ai-jump {
  position: absolute;
  bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  color: var(--text-1);
  background: var(--bg-surface-0);
  border: 1px solid var(--border-color);
  border-radius: 99px;
  box-shadow: var(--shadow-overlay-value);
  font-size: 12px;
}
.ai-video-frame {
  width: min(38rem, 100%);
}
:deep(.ai-stream-cursor) {
  display: inline-block;
  width: 5px;
  height: 14px;
  margin-left: 5px;
  vertical-align: -2px;
  background: var(--brand-blue);
  border-radius: 2px;
  animation: ai-breathe 900ms ease-in-out infinite;
}
:deep(.markdown-body > :first-child) {
  margin-top: 0;
}
:deep(.markdown-body blockquote) {
  margin: 16px 0;
  padding: 4px 16px;
  color: var(--text-2);
  border-left: 2px solid var(--brand-blue);
}
:deep(.markdown-body table) {
  display: block;
  max-width: 100%;
  margin: 16px 0;
  overflow-x: auto;
  border-collapse: collapse;
  font-size: 13px;
}
:deep(.markdown-body th),
:deep(.markdown-body td) {
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  text-align: left;
}
:deep(.markdown-body th) {
  background: var(--bg-surface-1);
}
:deep(.markdown-body img) {
  max-width: 100%;
  height: auto;
  border-radius: 12px;
}
.animate-shimmer {
  animation: ai-shimmer 2s ease-in-out infinite;
}

@keyframes ai-shimmer {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@keyframes ai-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ai-panel-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ai-message-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ai-breathe {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

@media (width <= 600px) {
  .ai-dialog-shell {
    width: 100%;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
  .ai-dialog-header {
    padding: max(16px, env(safe-area-inset-top)) 18px 16px;
  }
  .ai-session-status {
    display: none;
  }
  .ai-chat-scroll {
    gap: 24px;
    padding: 20px 18px 28px;
  }
  .ai-message-content {
    max-width: calc(100% - 36px);
  }
  .ai-msg-row {
    gap: 9px;
  }
  .ai-message-avatar {
    width: 27px;
    height: 27px;
  }
  .ai-msg-row--user .ai-message-content {
    max-width: 90%;
  }
}

@media (hover: none) {
  .ai-asset-actions {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-dialog-overlay,
  .ai-dialog-shell,
  .ai-dialog-shell[data-state='closed'],
  .ai-dialog-overlay[data-state='closed'],
  .ai-msg-row,
  .ai-session-status .is-active,
  .ai-waiting-dots i,
  .animate-shimmer,
  :deep(.ai-stream-cursor),
  :deep(.animate-spin) {
    animation: none;
  }
  .ai-reasoning-chevron {
    transition: none;
  }
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  font-family: inherit;
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
  transition: transform 180ms var(--ease-out-quart);
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
  box-shadow: var(--shadow-surface-value);
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
  transition: transform 180ms var(--ease-out-quart);
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

:deep(.markdown-body .hljs) {
  color: var(--text-1);
  background: transparent;
}

:deep(.markdown-body .hljs-comment),
:deep(.markdown-body .hljs-quote) {
  color: var(--text-2);
  font-style: italic;
}

:deep(.markdown-body .hljs-keyword),
:deep(.markdown-body .hljs-selector-tag),
:deep(.markdown-body .hljs-literal),
:deep(.markdown-body .hljs-section),
:deep(.markdown-body .hljs-link) {
  color: var(--brand-blue);
  font-weight: 600;
}

:deep(.markdown-body .hljs-built_in),
:deep(.markdown-body .hljs-type),
:deep(.markdown-body .hljs-params),
:deep(.markdown-body .hljs-class .hljs-title),
:deep(.markdown-body .hljs-title.class_) {
  color: var(--status-warning-ink);
}

:deep(.markdown-body .hljs-string),
:deep(.markdown-body .hljs-meta-string),
:deep(.markdown-body .hljs-template-tag),
:deep(.markdown-body .hljs-template-variable),
:deep(.markdown-body .hljs-addition) {
  color: var(--status-success-ink);
}

:deep(.markdown-body .hljs-number),
:deep(.markdown-body .hljs-symbol),
:deep(.markdown-body .hljs-bullet),
:deep(.markdown-body .hljs-regexp) {
  color: var(--status-danger-ink);
}

:deep(.markdown-body .hljs-title),
:deep(.markdown-body .hljs-title.function_),
:deep(.markdown-body .hljs-function .hljs-title),
:deep(.markdown-body .hljs-attribute) {
  color: var(--brand-blue);
}

:deep(.markdown-body .hljs-variable),
:deep(.markdown-body .hljs-name),
:deep(.markdown-body .hljs-tag),
:deep(.markdown-body .hljs-selector-id),
:deep(.markdown-body .hljs-selector-class) {
  color: var(--status-warning-ink);
}

:deep(.markdown-body .hljs-meta),
:deep(.markdown-body .hljs-doctag),
:deep(.markdown-body .hljs-attr) {
  color: var(--status-info-ink);
}

:deep(.markdown-body .hljs-deletion) {
  color: var(--status-danger-ink);
}

:deep(.markdown-body .hljs-emphasis) {
  font-style: italic;
}

:deep(.markdown-body .hljs-strong) {
  font-weight: 700;
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

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;

  &-track {
    background: transparent;
  }

  &-thumb {
    background: var(--border-color);
    border-radius: 4px;
  }
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: var(--text-2);
}
</style>
