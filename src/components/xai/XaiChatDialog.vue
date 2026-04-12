<script setup lang="ts">
import { ref, reactive, nextTick, watch, onBeforeUnmount } from 'vue'
import {
  Send,
  X,
  Image as ImageIcon,
  Film,
  MessageSquare,
  Download,
  Loader2,
  Bot,
  User,
  Settings2,
} from 'lucide-vue-next'
import {
  fetchXaiChatStream,
  resolveXaiAssetUrl,
  xaiGenerateImage,
  xaiEditImage,
  xaiGenerateVideo,
  xaiGetVideoStatus,
  type XaiImageGenParams,
  type XaiImageEditParams,
  type XaiVideoGenParams,
} from '@/api/xai'
import { toast } from 'vue-sonner'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark-dimmed.css'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', val: boolean): void }>()

// Model Types
type ModelType = 'text' | 'image' | 'video'
const activeModel = ref<ModelType>('text')

// Chat history
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  type: 'text' | 'image_gen' | 'video_gen'
  content?: string
  reasoningContent?: string
  images?: string[] // pasted image urls
  // Placeholder/Result fields
  isLoading?: boolean
  progress?: number // for video percentage
  results?: { url: string; mime_type?: string; duration?: number; error?: string }[]
  error?: string
}

const messages = ref<ChatMessage[]>([
  {
    id: 'init-1',
    role: 'assistant',
    type: 'text',
    content: '你好，我是一个全能助手，我能帮你找视频和聊天等。',
  },
])

const inputContent = ref('')
const isSending = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)

// Pasted media
const pastedImages = ref<{ url: string; file: File }[]>([])

// Advanced form state
const imgResolution = ref('1k')
const imgRatio = ref('16:9')
const imgCount = ref(1)

const vidResolution = ref('480p')
const vidRatio = ref('16:9')
const vidDuration = ref(8)

const IMAGE_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const
const IMAGE_RESOLUTION_OPTIONS = ['1k', '2k'] as const
const VIDEO_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p'] as const

const showSettings = ref(false)
const isSingleImageEdit = () => activeModel.value === 'image' && pastedImages.value.length === 1
const isReferenceVideoMode = () => activeModel.value === 'video' && pastedImages.value.length > 1
const videoDurationMax = () => (isReferenceVideoMode() ? 10 : 15)

// Focus/Blur helpers
const handleClose = () => {
  emit('update:open', false)
}

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
    const text = pendingRenderRaw[msgId] ?? ''
    delete pendingRenderRaw[msgId]
    try {
      const rawHtml = marked.parse(text)
      renderedHtmlMap[msgId] = DOMPurify.sanitize(rawHtml as string, {
        ADD_ATTR: ['referrerpolicy'],
      })
    } catch {
      renderedHtmlMap[msgId] = text
    }
    scheduleScroll()
  })
}
const pendingRenderRaw: Record<string, string> = {}

// Render helper used in template — returns cached HTML or triggers async render
const getRenderedHtml = (msg: ChatMessage) => {
  const text = msg.content ?? ''
  if (!text) return '<span class="inline-block animate-pulse w-2 h-4 bg-zinc-400"></span>'
  // If we have a cached version, return it (may be slightly stale during streaming)
  if (renderedHtmlMap[msg.id] !== undefined) {
    return renderedHtmlMap[msg.id]
  }
  // First render — do it synchronously so there's no blank flash
  try {
    const rawHtml = marked.parse(text)
    const html = DOMPurify.sanitize(rawHtml as string, { ADD_ATTR: ['referrerpolicy'] })
    renderedHtmlMap[msg.id] = html
    return html
  } catch {
    return text
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
})

watch(
  () => props.open,
  (val) => {
    if (val) {
      void scrollToBottom()
    }
  }
)

watch(
  imgCount,
  (count) => {
    if (count < 1) imgCount.value = 1
    if (count > 10) imgCount.value = 10
  },
  { immediate: true }
)

watch(
  [vidDuration, () => pastedImages.value.length],
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
      if (lang && hljs.getLanguage(lang)) {
        try {
          const highlighted = hljs.highlight(text, { language: lang }).value
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
        } catch {
          // Fallback to plain code on highlight error
        }
      }
      return `<pre><code>${text}</code></pre>`
    },
    image(token: { href: string; title: string | null; text: string }) {
      const { href, title, text } = token
      const resolved = resolveXaiAssetUrl(href)
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

const encodeImageForXAI = async (file: File): Promise<string> => {
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

const looksLikeVideoUrl = (url: string, key = '') => {
  const lowerKey = key.toLowerCase()
  const lowerUrl = url.toLowerCase()
  return (
    lowerKey.includes('video') ||
    /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(lowerUrl) ||
    lowerUrl.includes('vidgen.x.ai')
  )
}

const looksLikeImageUrl = (url: string, key = '') => {
  const lowerKey = key.toLowerCase()
  const lowerUrl = url.toLowerCase()
  return (
    lowerKey.includes('image') ||
    /^data:image\//i.test(lowerUrl) ||
    /\.(png|jpe?g|webp|gif|bmp|svg|avif)(\?|$)/i.test(lowerUrl) ||
    lowerUrl.includes('imgen.x.ai')
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
    url: resolveXaiAssetUrl(url),
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

      await fetchXaiChatStream(
        { model: 'grok-4.20', input: finalInput },
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
          const finalContent = reactiveAsstMsg.content ?? ''
          try {
            const rawHtml = marked.parse(finalContent)
            renderedHtmlMap[assistantMsgId] = DOMPurify.sanitize(rawHtml as string, {
              ADD_ATTR: ['referrerpolicy'],
            })
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
            currentImages.slice(0, 2).map(async (f) => ({
              url: await encodeImageForXAI(f.file),
              type: 'image_url' as const,
            }))
          )
          const reqData: XaiImageEditParams =
            imageRefs.length === 1
              ? {
                  prompt: userText || '编辑图片',
                  image: imageRefs[0],
                  n: imgCount.value,
                  resolution: imgResolution.value,
                }
              : {
                  prompt: userText || '编辑图片',
                  images: imageRefs,
                  n: imgCount.value,
                  aspect_ratio: imgRatio.value,
                  resolution: imgResolution.value,
                }
          res = await xaiEditImage(reqData)
        } else {
          const reqData: XaiImageGenParams = {
            prompt: userText,
            n: imgCount.value,
            aspect_ratio: imgRatio.value,
            resolution: imgResolution.value,
          }
          res = await xaiGenerateImage(reqData)
        }
        // Flexible data mapping to handle different or unexpected xAI response structures
        const resObj = res as unknown
        const finalResults = extractMediaResults(resObj, 'image')

        if (finalResults.length > 0) {
          reactiveImgMsg.results!.splice(0, reactiveImgMsg.results!.length, ...finalResults)
        } else {
          console.error('Raw xAI Image Response (invalid format):', resObj)
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
        isLoading: true,
        progress: 0,
        results: [],
      }
      messages.value.push(asstMsg)
      // Retrieve the reactive proxy from the array to ensure Vue tracks mutations
      const reactiveVidMsg = messages.value[messages.value.length - 1]!

      try {
        const reqData: XaiVideoGenParams = {
          prompt: userText || '生成视频',
          duration: vidDuration.value,
          resolution: vidResolution.value,
        }
        if (currentImages.length === 1 && currentImages[0]) {
          reqData.image = {
            url: await encodeImageForXAI(currentImages[0].file),
            type: 'image_url',
          }
        } else if (currentImages.length > 1) {
          reqData.aspect_ratio = vidRatio.value
          reqData.reference_images = await Promise.all(
            currentImages.slice(0, 7).map(async (f) => ({
              url: await encodeImageForXAI(f.file),
              type: 'image_url' as const,
            }))
          )
        } else {
          reqData.aspect_ratio = vidRatio.value
        }

        const res = await xaiGenerateVideo(reqData)
        // Interceptor already unwraps { code, data, msg } → data
        const requestId = extractRequestId(res)
        if (!requestId) throw new Error('未获取到任务ID')

        // Polling loop
        let polling = true
        while (polling) {
          await sleep(3000)
          const statusRes = await xaiGetVideoStatus(requestId)
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
                console.error('Raw xAI Video Response (no url):', statusData)
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
            } else {
              // Log to console for debugging intermediate states
              console.log('Video Poll Tick:', statusData)
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
    <transition name="fade-bounce">
      <div
        v-if="open"
        class="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        @click.self="handleClose"
      >
        <div
          class="relative flex flex-col w-full max-w-[800px] h-[85vh] rounded-3xl shadow-2xl overflow-hidden border border-zinc-200/20 dark:border-zinc-800/60"
          style="background: var(--bg-surface-1)"
        >
          <!-- Header (Draggable feeling) -->
          <div
            class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-200/50 dark:border-zinc-800/80"
          >
            <div class="flex items-center gap-2 text-[var(--text-1)]">
              <Bot class="w-6 h-6" />
              <h2 class="text-xl font-bold tracking-tight">xAI Assistant</h2>
            </div>
            <button
              class="rounded-full p-2 text-[var(--text-2)] hover:text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              @click="handleClose"
            >
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Model Switcher Tabs -->
          <div
            class="shrink-0 px-6 py-3 flex items-center gap-4 border-b border-zinc-200/30 dark:border-zinc-800/50 bg-[var(--bg-surface-2)]"
          >
            <button
              class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
              :class="
                activeModel === 'text'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-md scale-105'
                  : 'text-[var(--text-2)] hover:bg-black/5 dark:hover:bg-white/5'
              "
              @click="activeModel = 'text'"
            >
              <MessageSquare class="w-4 h-4" /> 文本与找视频
              <span class="text-xs opacity-60">grok-4.20</span>
            </button>
            <button
              class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
              :class="
                activeModel === 'image'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-md scale-105'
                  : 'text-[var(--text-2)] hover:bg-black/5 dark:hover:bg-white/5'
              "
              @click="activeModel = 'image'"
            >
              <ImageIcon class="w-4 h-4" /> 图像创作
            </button>
            <button
              class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all"
              :class="
                activeModel === 'video'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-md scale-105'
                  : 'text-[var(--text-2)] hover:bg-black/5 dark:hover:bg-white/5'
              "
              @click="activeModel = 'video'"
            >
              <Film class="w-4 h-4" /> 视频探索
            </button>

            <!-- Advanced Config Toggle for Image/Video -->
            <button
              v-if="activeModel !== 'text'"
              class="ml-auto flex items-center p-2 rounded-full transition-colors text-[var(--text-2)] hover:bg-black/5 dark:hover:bg-white/5"
              :class="{ 'text-blue-500': showSettings }"
              title="高级配置"
              @click="showSettings = !showSettings"
            >
              <Settings2 class="w-5 h-5" />
            </button>
          </div>

          <!-- Advanced Settings Panel -->
          <div
            v-if="showSettings && activeModel === 'image'"
            class="shrink-0 px-6 py-3 flex gap-4 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200/30 dark:border-zinc-800/50 text-sm"
          >
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              数量:
              <input
                v-model="imgCount"
                type="number"
                min="1"
                max="10"
                class="w-16 p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              />
            </label>
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              比例:
              <select
                v-model="imgRatio"
                :disabled="isSingleImageEdit()"
                class="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              >
                <option v-for="ratio in IMAGE_RATIO_OPTIONS" :key="ratio" :value="ratio">
                  {{ ratio }}
                </option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              分辨率:
              <select
                v-model="imgResolution"
                class="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              >
                <option
                  v-for="resolution in IMAGE_RESOLUTION_OPTIONS"
                  :key="resolution"
                  :value="resolution"
                >
                  {{ resolution.toUpperCase() }}
                </option>
              </select>
            </label>
            <span v-if="isSingleImageEdit()" class="self-center text-xs text-[var(--text-2)]">
              单图编辑会继承输入图比例
            </span>
          </div>

          <div
            v-if="showSettings && activeModel === 'video'"
            class="shrink-0 px-6 py-3 flex gap-4 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200/30 dark:border-zinc-800/50 text-sm"
          >
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              秒数:
              <input
                v-model="vidDuration"
                type="number"
                min="1"
                :max="videoDurationMax()"
                class="w-16 p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              />
            </label>
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              比例:
              <select
                v-model="vidRatio"
                class="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              >
                <option v-for="ratio in VIDEO_RATIO_OPTIONS" :key="ratio" :value="ratio">
                  {{ ratio }}
                </option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-[var(--text-1)]">
              分辨率:
              <select
                v-model="vidResolution"
                class="p-1 rounded bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 outline-none"
              >
                <option
                  v-for="resolution in VIDEO_RESOLUTION_OPTIONS"
                  :key="resolution"
                  :value="resolution"
                >
                  {{ resolution.toUpperCase() }}
                </option>
              </select>
            </label>
            <span v-if="isReferenceVideoMode()" class="self-center text-xs text-[var(--text-2)]">
              多参考图模式最长 10 秒
            </span>
          </div>

          <!-- Chat Area -->
          <div
            ref="chatScrollRef"
            class="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 custom-scrollbar"
          >
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex w-full gap-4"
              :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
            >
              <!-- Avatar -->
              <div class="shrink-0">
                <div
                  v-if="msg.role === 'assistant'"
                  class="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex flex-col items-center justify-center shadow-inner overflow-hidden border border-zinc-200 dark:border-zinc-700 p-1"
                >
                  <img
                    src="/表情包/bili_emoji_20.png"
                    alt="ai"
                    class="w-full h-full object-contain"
                  />
                </div>
                <div
                  v-else
                  class="w-10 h-10 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center shadow-md"
                >
                  <User class="w-6 h-6" />
                </div>
              </div>

              <!-- Message Body -->
              <div class="max-w-[80%] flex flex-col gap-2">
                <!-- User attachments view -->
                <div
                  v-if="msg.role === 'user' && msg.images?.length"
                  class="flex flex-wrap gap-2 justify-end"
                >
                  <img
                    v-for="(img, idx) in msg.images"
                    :key="idx"
                    :src="img"
                    class="w-32 h-32 object-cover rounded-xl shadow-md border border-zinc-200 dark:border-zinc-700"
                  />
                </div>

                <!-- Reasoning Message -->
                <details
                  v-if="msg.reasoningContent"
                  class="px-5 py-3 rounded-2xl break-words leading-relaxed shadow-sm text-[14px] bg-zinc-50 border border-zinc-200/50 dark:bg-zinc-800/40 dark:border-zinc-700/50"
                  open
                >
                  <summary
                    class="cursor-pointer text-zinc-500 font-medium select-none flex items-center gap-2 outline-none"
                  >
                    <span class="opacity-80 flex items-center gap-2">
                      <Loader2 v-if="msg.isLoading && !msg.content" class="w-4 h-4 animate-spin" />
                      深度思考过程
                    </span>
                  </summary>
                  <div
                    class="mt-3 text-zinc-500 whitespace-pre-wrap font-mono text-sm leading-relaxed border-t border-zinc-200/50 dark:border-zinc-700/50 pt-2"
                  >
                    {{ msg.reasoningContent }}
                  </div>
                </details>

                <!-- Text Message -->
                <div
                  v-if="msg.content !== undefined"
                  class="px-5 py-3 rounded-2xl break-words leading-relaxed shadow-sm text-[15px] markdown-body"
                  :class="[
                    msg.role === 'user'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-tr-none whitespace-pre-wrap'
                      : 'bg-zinc-100/80 dark:bg-zinc-800/80 text-[var(--text-1)] rounded-tl-none border border-zinc-200/50 dark:border-zinc-700/50',
                  ]"
                  v-html="msg.role === 'assistant' ? getRenderedHtml(msg) : msg.content"
                ></div>
                <!-- Loading text indicator -->
                <div
                  v-if="
                    msg.role === 'assistant' &&
                    msg.isLoading &&
                    msg.content === '' &&
                    !msg.reasoningContent &&
                    msg.type === 'text'
                  "
                  class="flex items-center gap-2 text-zinc-500 py-2"
                >
                  <Loader2 class="w-4 h-4 animate-spin" /> <span class="text-sm">思考中...</span>
                </div>

                <!-- Error -->
                <div
                  v-if="msg.error"
                  class="text-sm text-red-500 px-4 py-2 bg-red-500/10 rounded-xl border border-red-500/20"
                >
                  ⚠️ {{ msg.error }}
                </div>

                <!-- Image Gen Results -->
                <div
                  v-if="msg.type === 'image_gen' && msg.results"
                  class="grid w-full gap-3"
                  :class="
                    msg.results.length > 1
                      ? 'max-w-[34rem] grid-cols-2'
                      : 'max-w-[24rem] grid-cols-1'
                  "
                >
                  <div
                    v-for="(res, idx) in msg.results"
                    :key="idx"
                    class="relative group w-full min-h-[14rem] rounded-xl overflow-hidden shadow-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 aspect-square"
                  >
                    <div
                      v-if="!res.url"
                      class="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-3"
                    >
                      <Loader2 class="w-8 h-8 animate-spin" />
                      <span class="text-xs font-medium">魔法绘制中...</span>
                    </div>
                    <div
                      v-else-if="res.error"
                      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-100 px-4 text-center text-zinc-500 dark:bg-zinc-800"
                    >
                      <span class="text-xs font-medium">{{ res.error }}</span>
                      <button
                        class="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-700"
                        @click.prevent="openExternal(res.url)"
                      >
                        打开原图
                      </button>
                    </div>
                    <template v-else>
                      <img
                        :src="res.url"
                        referrerpolicy="no-referrer"
                        class="block w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        @error="markMediaResultError(msg, idx, '图片加载失败')"
                      />
                      <!-- Hover mask & download -->
                      <div
                        class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3"
                      >
                        <button
                          class="bg-white/90 text-black px-4 py-2 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 hover:bg-white transform hover:scale-105 transition-all"
                          @click.prevent="
                            void downloadAsset(res.url, `xai-image-${Date.now()}.png`)
                          "
                        >
                          <Download class="w-4 h-4" /> 获取画作
                        </button>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Video Gen Results -->
                <div v-if="msg.type === 'video_gen'" class="flex flex-col gap-3">
                  <div
                    v-if="msg.isLoading"
                    class="w-72 aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center text-zinc-500 shadow-inner gap-4 relative overflow-hidden"
                  >
                    <div
                      class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
                      style="background-size: 200% 100%"
                    ></div>
                    <div class="relative z-10 flex flex-col items-center gap-3">
                      <div class="relative w-12 h-12 flex items-center justify-center">
                        <svg class="w-full h-full transform -rotate-90">
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            stroke-width="4"
                            fill="none"
                            class="opacity-20"
                          />
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            stroke-width="4"
                            fill="none"
                            :stroke-dasharray="125.6"
                            :stroke-dashoffset="125.6 - (125.6 * (msg.progress || 0)) / 100"
                            class="transition-all duration-300"
                          />
                        </svg>
                        <span class="absolute text-[10px] font-bold">{{ msg.progress || 0 }}%</span>
                      </div>
                      <span class="text-xs font-medium tracking-widest text-[var(--text-1)]"
                        >构筑世界线中...</span
                      >
                    </div>
                  </div>
                  <div
                    v-else-if="msg.results?.length"
                    class="w-96 aspect-video rounded-xl overflow-hidden shadow-xl border border-zinc-200 dark:border-zinc-700 relative group bg-black"
                  >
                    <video
                      :src="msg.results?.[0]?.url"
                      controls
                      class="w-full h-full object-contain"
                      autoplay
                      loop
                      muted
                      @error="markMediaResultError(msg, 0, '视频加载失败')"
                    />
                    <div
                      v-if="msg.results?.[0]?.error"
                      class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-4 text-center text-white"
                    >
                      <span class="text-sm font-medium">{{ msg.results?.[0]?.error }}</span>
                      <button
                        class="rounded-full bg-white/15 px-4 py-2 text-xs font-medium hover:bg-white/25"
                        @click.prevent="openExternal(msg.results?.[0]?.url || '')"
                      >
                        打开原视频
                      </button>
                    </div>
                    <div
                      class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <button
                        class="bg-black/60 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/80 transition-colors shadow-lg"
                        @click.prevent="
                          void downloadAsset(
                            msg.results?.[0]?.url || '',
                            `xai-video-${Date.now()}.mp4`
                          )
                        "
                      >
                        <Download class="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Bottom spacing -->
            <div class="h-2 shrink-0"></div>
          </div>

          <!-- Input Area -->
          <div
            class="shrink-0 p-4 border-t border-zinc-200/50 dark:border-zinc-800/80 bg-[var(--bg-surface-1)]"
          >
            <!-- Pasted Media Preview -->
            <div v-if="pastedImages.length > 0" class="flex gap-3 mb-4 overflow-x-auto py-2">
              <div v-for="(img, idx) in pastedImages" :key="idx" class="relative group shrink-0">
                <img
                  :src="img.url"
                  class="h-20 w-20 object-cover rounded-xl shadow-md border border-zinc-200 dark:border-zinc-700"
                />
                <button
                  class="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  @click="removePastedImage(idx)"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              class="relative flex items-end gap-3 max-w-4xl mx-auto bg-zinc-100/50 dark:bg-zinc-900/50 rounded-3xl p-2 border border-zinc-200/80 dark:border-zinc-800/80 shadow-inner focus-within:ring-2 focus-within:ring-zinc-900 dark:focus-within:ring-white focus-within:border-transparent transition-all"
            >
              <!-- Textarea -->
              <textarea
                v-model="inputContent"
                class="flex-1 max-h-40 min-h-[44px] bg-transparent resize-none outline-none py-2 px-4 text-[var(--text-1)] placeholder:text-zinc-500 custom-scrollbar"
                :placeholder="
                  activeModel === 'text'
                    ? '有什么问题尽管问我...(支持Ctrl+V粘贴图片)'
                    : '描述你想要的画面，越详细越好...(粘贴图片支持图生图)'
                "
                rows="1"
                @paste="handlePaste"
                @keydown.enter.exact.prevent="handleSend"
              ></textarea>

              <!-- Action group -->
              <div class="flex items-center gap-2 mb-1 mr-1">
                <button
                  class="flex items-center justify-center p-3 rounded-2xl transition-all shadow-sm"
                  :class="
                    (!inputContent.trim() && pastedImages.length === 0) || isSending
                      ? 'bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed'
                      : 'bg-black text-white hover:scale-105 active:scale-95 dark:bg-white dark:text-black hover:shadow-lg'
                  "
                  :disabled="(!inputContent.trim() && pastedImages.length === 0) || isSending"
                  @click="handleSend"
                >
                  <Send v-if="!isSending" class="w-5 h-5" />
                  <Loader2 v-else class="w-5 h-5 animate-spin" />
                </button>
              </div>
            </div>
            <div class="mt-2 text-center text-[11px] text-zinc-400 font-medium tracking-wide">
              AI 助手可能会生成不准确的信息，请独立核实。视频功能较慢请耐心等待。
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.5em;
  color: var(--text-1);
}
:deep(.markdown-body h1) {
  font-size: 1.5em;
}
:deep(.markdown-body h2) {
  font-size: 1.25em;
}
:deep(.markdown-body h3) {
  font-size: 1.1em;
}
:deep(.markdown-body a) {
  color: #3b82f6;
  text-decoration: none;
}
:deep(.markdown-body a:hover) {
  text-decoration: underline;
}
:deep(.markdown-body pre) {
  background-color: #1c2128;
  color: #adbac7;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 0.85em;
}
:deep(.markdown-body code:not(pre code)) {
  background-color: rgba(128, 128, 128, 0.2);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: monospace;
}
:deep(.markdown-body ul) {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}
:deep(.markdown-body ol) {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
}
:deep(.markdown-body p) {
  margin-bottom: 0.7em;
  line-height: 1.6;
}
:deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}

.fade-bounce-enter-active {
  animation: fadeBounceIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.fade-bounce-leave-active {
  animation: fadeBounceOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeBounceIn {
  0% {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes fadeBounceOut {
  0% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  100% {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
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
</style>
