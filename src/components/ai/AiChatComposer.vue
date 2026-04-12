<script setup lang="ts">
/**
 * 底部命令栏独立组件：模型切换 / 参数 / 输入 全部在此本地状态中。
 * 切换 TEXT/IMAGE/VIDEO 时不会触发父级消息列表重渲染。
 */
import { computed, ref, watch, onBeforeUnmount, onMounted, nextTick, useId } from 'vue'
import {
  ArrowUp,
  Square,
  Settings2,
  X,
  MessageCircle,
  Image,
  Clapperboard,
  Paperclip,
  UploadCloud,
  ChevronDown,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { AiModelOption } from '@/api/ai'
import type { AiComposerSendPayload, AiModelType, AiPastedImage } from '@/components/ai/ai-types'

const props = withDefaults(
  defineProps<{
    isSending: boolean
    /** 发送前校验；返回 false 时保留输入和附件。 */
    beforeSend?: () => boolean
    coverPickerMode?: boolean
    initialModel?: AiModelType
    initialPrompt?: string
    /** 父级在 open 时拉取的 options，变更时同步默认值 */
    chatModelOptions?: AiModelOption[]
    imageModelOptions?: AiModelOption[]
    videoModelOptions?: AiModelOption[]
    thinkingEffortOptions?: AiModelOption[]
    thinkingFeatureEnabled?: boolean
    defaultChatModel?: string
    defaultImageModel?: string
    defaultVideoModel?: string
    defaultThinkingEffort?: string
  }>(),
  {
    coverPickerMode: false,
    initialModel: 'text',
    initialPrompt: '',
    chatModelOptions: () => [],
    imageModelOptions: () => [],
    videoModelOptions: () => [],
    thinkingEffortOptions: () => [],
    thinkingFeatureEnabled: false,
    defaultChatModel: '',
    defaultImageModel: '',
    defaultVideoModel: '',
    defaultThinkingEffort: 'high',
  }
)

const emit = defineEmits<{
  send: [payload: AiComposerSendPayload]
  stop: []
}>()

const activeModel = ref<AiModelType>(props.coverPickerMode ? 'image' : props.initialModel)
const inputContent = ref(props.initialPrompt || '')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const resizeInput = () => {
  const textarea = textareaRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`
}
watch(inputContent, resizeInput, { flush: 'post' })
onMounted(resizeInput)
const pastedImages = ref<AiPastedImage[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const dragDepth = ref(0)
const isDragging = computed(() => dragDepth.value > 0)
const showSettings = ref(false)
const settingsId = useId()
const focusInput = () => textareaRef.value?.focus({ preventScroll: true })
const choosePrompt = async (mode: AiModelType, prompt: string) => {
  if (props.isSending) return
  setModel(mode)
  inputContent.value = prompt
  await nextTick()
  focusInput()
}
defineExpose({ choosePrompt, focusInput })

const chatModel = ref(props.defaultChatModel)
const chatThinking = ref(true)
const chatThinkingEffort = ref(props.defaultThinkingEffort || 'high')

const imgModel = ref(props.defaultImageModel)
const imgResolution = ref('2k')
const imgRatio = ref('16:9')
const imgCount = ref(1)

const vidModel = ref(props.defaultVideoModel)
const vidResolution = ref('720p')
const vidRatio = ref('16:9')
const vidDuration = ref(8)
const selectedModelLabel = computed(() => {
  const options =
    activeModel.value === 'text'
      ? props.chatModelOptions
      : activeModel.value === 'image'
        ? props.imageModelOptions
        : props.videoModelOptions
  const value =
    activeModel.value === 'text'
      ? chatModel.value
      : activeModel.value === 'image'
        ? imgModel.value
        : vidModel.value
  return options.find((option) => option.value === value)?.label || value || '默认模型'
})
const modeHint = computed(() => {
  if (activeModel.value === 'image')
    return isSingleImageEdit.value
      ? '以这张图片为起点，描述你想做的改变'
      : '描述越具体，画面越接近你的想象'
  if (activeModel.value === 'video') return '写下场景、镜头和动作，让灵感开始流动'
  return '随意提问，也可以上传图片一起聊'
})

const IMAGE_RATIO_OPTIONS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const
const IMAGE_RESOLUTION_OPTIONS = ['1k', '2k', '3k', '4k'] as const
const VIDEO_RATIO_OPTIONS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const
const VIDEO_RESOLUTION_OPTIONS = ['480p', '720p', '1080p'] as const

const ensureOptionValue = (current: string, options: AiModelOption[], fallback: string) => {
  if (current && options.some((o) => o.value === current)) return current
  if (fallback && options.some((o) => o.value === fallback)) return fallback
  return options[0]?.value || fallback || current || ''
}

const isSingleImageEdit = computed(
  () => activeModel.value === 'image' && pastedImages.value.length === 1
)
const isReferenceVideoMode = computed(
  () => activeModel.value === 'video' && pastedImages.value.length > 1
)
const isFastVideoModel = computed(
  () => vidModel.value.includes('pro-fast') || vidModel.value.includes('1-0-pro-fast')
)
const videoDurationMin = computed(() => (isFastVideoModel.value ? 2 : 4))
const videoDurationMax = computed(() =>
  isReferenceVideoMode.value ? 10 : isFastVideoModel.value ? 12 : 15
)

const canSend = computed(
  () => !props.isSending && (!!inputContent.value.trim() || pastedImages.value.length > 0)
)

watch(
  () => props.coverPickerMode,
  (cover) => {
    if (cover) activeModel.value = 'image'
  }
)

watch(
  () => props.initialPrompt,
  (prompt) => {
    if (prompt && !inputContent.value) inputContent.value = prompt
  }
)

watch(
  () =>
    [
      props.chatModelOptions,
      props.imageModelOptions,
      props.videoModelOptions,
      props.thinkingEffortOptions,
      props.defaultChatModel,
      props.defaultImageModel,
      props.defaultVideoModel,
      props.defaultThinkingEffort,
      props.thinkingFeatureEnabled,
    ] as const,
  () => {
    chatModel.value = ensureOptionValue(
      chatModel.value,
      props.chatModelOptions,
      props.defaultChatModel
    )
    imgModel.value = ensureOptionValue(
      imgModel.value,
      props.imageModelOptions,
      props.defaultImageModel
    )
    vidModel.value = ensureOptionValue(
      vidModel.value,
      props.videoModelOptions,
      props.defaultVideoModel
    )
    chatThinkingEffort.value = ensureOptionValue(
      chatThinkingEffort.value,
      props.thinkingEffortOptions,
      props.defaultThinkingEffort || 'high'
    )
    if (!props.thinkingFeatureEnabled) {
      chatThinking.value = false
    }
  },
  { deep: true, immediate: true }
)

watch(imgCount, (count) => {
  if (count < 1) imgCount.value = 1
  if (count > 15) imgCount.value = 15
})

watch([vidDuration, isFastVideoModel, isReferenceVideoMode], () => {
  const min = videoDurationMin.value
  const max = videoDurationMax.value
  const duration = Number(vidDuration.value)
  if (!Number.isFinite(duration)) {
    vidDuration.value = min
    return
  }
  if (duration < min) vidDuration.value = min
  else if (duration > max) vidDuration.value = max
})

const setModel = (mode: AiModelType) => {
  if (props.coverPickerMode && mode !== 'image') return
  activeModel.value = mode
  void nextTick(focusInput)
}

const addImages = (files: File[]) => {
  let skipped = false
  let overLimit = false
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      skipped = true
      continue
    }
    if (pastedImages.value.length >= 7) {
      overLimit = true
      continue
    }
    pastedImages.value.push({ url: URL.createObjectURL(file), file })
  }
  if (skipped) toast.warning('目前支持上传图片文件')
  if (overLimit) toast.warning('最多可以添加 7 张图片')
}

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  addImages(Array.from(input.files ?? []))
  input.value = ''
  focusInput()
}

const handleDragEnter = (event: DragEvent) => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragDepth.value++
}

const handleDragOver = (event: DragEvent) => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
}

const handleDragLeave = () => {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

const handleDrop = (event: DragEvent) => {
  dragDepth.value = 0
  if (!event.dataTransfer?.files.length) return
  event.preventDefault()
  addImages(Array.from(event.dataTransfer.files))
  focusInput()
}

const handlePaste = (e: ClipboardEvent) => {
  const items = e.clipboardData?.items
  if (!items) return

  const files = Array.from(items)
    .filter((item) => item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (!files.length) return
  e.preventDefault()
  addImages(files)
}

const removePastedImage = (index: number) => {
  const item = pastedImages.value[index]
  if (item) {
    URL.revokeObjectURL(item.url)
    pastedImages.value.splice(index, 1)
  }
}

const handleSend = () => {
  if (!canSend.value) return
  if (props.beforeSend && !props.beforeSend()) return
  const text = inputContent.value.trim()
  const images = [...pastedImages.value]
  inputContent.value = ''
  pastedImages.value = []

  emit('send', {
    text,
    images,
    mode: activeModel.value,
    chat: {
      model: chatModel.value,
      thinking: chatThinking.value,
      thinkingEffort: chatThinkingEffort.value,
      thinkingFeatureEnabled: props.thinkingFeatureEnabled,
    },
    image: {
      model: imgModel.value,
      resolution: imgResolution.value,
      ratio: imgRatio.value,
      count: imgCount.value,
    },
    video: {
      model: vidModel.value,
      resolution: vidResolution.value,
      ratio: vidRatio.value,
      duration: vidDuration.value,
    },
  })
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
    return
  if (event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  handleSend()
}

onBeforeUnmount(() => {
  for (const image of pastedImages.value) URL.revokeObjectURL(image.url)
})
</script>

<template>
  <div class="shrink-0 relative z-20 ai-composer">
    <div class="ai-composer__inner">
      <div
        class="ai-composer__surface"
        :class="{
          'ai-composer__surface--dragging': isDragging,
          'ai-composer__surface--sending': isSending,
        }"
        @dragenter="handleDragEnter"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div v-if="isDragging" class="ai-composer__dropzone">
          <UploadCloud :size="28" :stroke-width="1.5" />
          <strong>松开，把图片带进灵感里</strong>
          <span>支持同时添加多张图片，最多 7 张</span>
        </div>
        <div class="ai-composer__toolbar">
          <div class="ai-composer__modes" role="group" aria-label="创作模式">
            <button
              type="button"
              :aria-pressed="activeModel === 'text'"
              class="ai-model-tab"
              :class="activeModel === 'text' ? 'ai-model-tab--active' : ''"
              :disabled="coverPickerMode"
              @click="setModel('text')"
            >
              <MessageCircle :size="14" /> 对话
            </button>
            <button
              type="button"
              :aria-pressed="activeModel === 'image'"
              class="ai-model-tab"
              :class="activeModel === 'image' ? 'ai-model-tab--active' : ''"
              @click="setModel('image')"
            >
              <Image :size="14" /> 绘图
            </button>
            <button
              type="button"
              :aria-pressed="activeModel === 'video'"
              class="ai-model-tab"
              :class="activeModel === 'video' ? 'ai-model-tab--active' : ''"
              :disabled="coverPickerMode"
              @click="setModel('video')"
            >
              <Clapperboard :size="14" /> 视频
            </button>
          </div>
          <button
            type="button"
            class="ai-composer__settings-toggle"
            :class="{ 'is-active': showSettings }"
            aria-label="生成设置"
            :aria-expanded="showSettings"
            :aria-controls="settingsId"
            @click="showSettings = !showSettings"
          >
            <Settings2 class="w-4 h-4" />
            <span>参数</span>
            <ChevronDown :size="12" class="ai-composer__settings-chevron" />
          </button>
        </div>

        <!-- 不用 transition max-height，避免参数面板动画导致布局抖动 -->
        <div v-show="showSettings" :id="settingsId" class="ai-composer__settings custom-scrollbar">
          <div
            class="flex flex-wrap gap-x-6 gap-y-4 items-center text-xs text-muted-foreground p-4"
          >
            <template v-if="activeModel === 'text'">
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">模型</span>
                <select
                  v-model="chatModel"
                  class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                >
                  <option
                    v-for="model in chatModelOptions"
                    :key="model.value"
                    :value="model.value"
                    class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                  >
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label v-if="thinkingFeatureEnabled" class="flex items-center gap-3 shrink-0">
                <span class="font-bold">深度思考</span>
                <input
                  v-model="chatThinking"
                  type="checkbox"
                  class="w-4 h-4 accent-[var(--brand-blue)] cursor-pointer"
                />
              </label>
              <label
                v-if="thinkingFeatureEnabled && chatThinking"
                class="flex items-center gap-3 shrink-0"
              >
                <span class="font-bold">思考强度</span>
                <select
                  v-model="chatThinkingEffort"
                  class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                >
                  <option
                    v-for="effort in thinkingEffortOptions"
                    :key="effort.value"
                    :value="effort.value"
                    class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                  >
                    {{ effort.label }}
                  </option>
                </select>
              </label>
            </template>

            <template v-else-if="activeModel === 'image'">
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">模型</span>
                <select
                  v-model="imgModel"
                  class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                >
                  <option
                    v-for="model in imageModelOptions"
                    :key="model.value"
                    :value="model.value"
                    class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                  >
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">数量</span>
                <input
                  v-model="imgCount"
                  type="number"
                  min="1"
                  max="15"
                  class="w-12 bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none text-center"
                />
              </label>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">画幅</span>
                <select
                  v-model="imgRatio"
                  :disabled="isSingleImageEdit"
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
                <span class="font-bold">清晰度</span>
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
                v-if="isSingleImageEdit"
                class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                >沿用原图比例</span
              >
            </template>

            <template v-else>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">模型</span>
                <select
                  v-model="vidModel"
                  class="bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none"
                >
                  <option
                    v-for="model in videoModelOptions"
                    :key="model.value"
                    :value="model.value"
                    class="bg-[var(--bg-surface-0)] text-[var(--text-1)]"
                  >
                    {{ model.label }}
                  </option>
                </select>
              </label>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">时长（秒）</span>
                <input
                  v-model.number="vidDuration"
                  type="number"
                  :min="videoDurationMin"
                  :max="videoDurationMax"
                  class="w-12 bg-transparent text-[var(--text-1)] border-b border-[var(--border-color)] focus:border-[var(--brand-blue)] outline-none text-center"
                />
              </label>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">画幅</span>
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
                <span class="font-bold">清晰度</span>
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
                v-if="isReferenceVideoMode"
                class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                >参考图模式 · 最长 10 秒</span
              >
            </template>
          </div>
        </div>

        <div class="flex flex-col px-3 pb-3">
          <div
            v-if="pastedImages.length > 0"
            class="flex gap-2.5 overflow-x-auto py-2 custom-scrollbar px-1"
          >
            <div v-for="(img, idx) in pastedImages" :key="idx" class="relative group shrink-0">
              <img
                :src="img.url"
                class="h-16 w-16 object-cover rounded-[12px] shadow-sm border border-[var(--border-color)]"
                :alt="`参考图片 ${idx + 1}`"
              />
              <button
                type="button"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--status-danger)] text-[var(--status-danger-ink)] rounded-full flex items-center justify-center shadow-md"
                :aria-label="`移除第 ${idx + 1} 张图片`"
                @click="removePastedImage(idx)"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
          </div>

          <div class="flex items-end gap-3 mt-1 px-1">
            <textarea
              ref="textareaRef"
              v-model="inputContent"
              class="ai-composer__input flex-1 max-h-[160px] min-h-[44px] bg-transparent resize-none outline-none py-2 px-2 text-[16px] leading-[1.6] text-[var(--text-1)] placeholder:text-[var(--text-2)] custom-scrollbar font-normal"
              :placeholder="
                activeModel === 'text'
                  ? '把想法写在这里…'
                  : activeModel === 'image'
                    ? '描述画面、风格，以及你想表达的氛围…'
                    : '描述场景、镜头和动作…'
              "
              rows="1"
              aria-label="AI 消息"
              @paste="handlePaste"
              @keydown="handleKeydown"
            ></textarea>
          </div>
          <div class="ai-composer__bottom">
            <div class="ai-composer__tools">
              <input
                ref="fileInputRef"
                type="file"
                class="ai-composer__file-input"
                accept="image/*"
                multiple
                tabindex="-1"
                aria-label="选择参考图片"
                @change="handleFileChange"
              />
              <button
                type="button"
                class="ai-composer__attach"
                aria-label="添加图片"
                title="添加图片，也可以拖放或粘贴"
                :disabled="pastedImages.length >= 7"
                @click="fileInputRef?.click()"
              >
                <Paperclip :size="17" />
                <span v-if="pastedImages.length" class="ai-composer__attachment-count">{{
                  pastedImages.length
                }}</span>
              </button>
              <span class="ai-composer__tool-divider"></span>
              <button
                type="button"
                class="ai-composer__model-select"
                :title="selectedModelLabel"
                :aria-expanded="showSettings"
                :aria-controls="settingsId"
                @click="showSettings = !showSettings"
              >
                <span class="ai-composer__model-dot"></span>
                <span>{{ selectedModelLabel }}</span>
                <ChevronDown :size="12" />
              </button>
            </div>
            <div class="ai-composer__submit-group">
              <span class="ai-composer__send-hint">{{
                isSending ? '正在生成，可随时停止' : '让灵感发生'
              }}</span>
              <button
                type="button"
                class="ai-composer__send"
                :class="
                  !canSend && !isSending
                    ? 'bg-[var(--bg-surface-2)] text-[var(--text-2)] cursor-not-allowed shadow-none border border-[var(--border-color)]'
                    : 'ai-composer__send--ready'
                "
                :disabled="!canSend && !isSending"
                :aria-label="isSending ? '停止生成' : '发送消息'"
                :title="isSending ? '停止等待本次生成' : '发送消息（Shift + Enter 换行）'"
                @click="isSending ? emit('stop') : handleSend()"
              >
                <Square v-if="isSending" class="w-4 h-4" />
                <ArrowUp v-else :size="19" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-composer__footnote">
        <span class="ai-composer__mode-hint">{{ modeHint }}</span
        ><span class="ai-composer__shortcut"
          ><kbd>Enter</kbd> 发送 · <kbd>Shift Enter</kbd> 换行</span
        >
      </div>
      <p class="ai-composer__disclaimer">由 AI 生成，精彩之余，也请核实重要信息</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-composer {
  position: relative;
  flex-shrink: 0;
  background: linear-gradient(transparent, var(--bg-surface-0) 28%);
}
.ai-composer__inner {
  width: 100%;
  max-width: 816px;
  margin: 0 auto;
  padding: 6px 28px 14px;
}
.ai-composer__surface {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 5px;
  background: var(--bg-surface-0);
  border: 1px solid color-mix(in oklch, var(--brand-blue) 17%, var(--border-color));
  border-radius: 22px;
  box-shadow: var(--shadow-raised-value);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease;
}
.ai-composer__surface:focus-within {
  border-color: color-mix(in oklch, var(--brand-blue) 55%, var(--border-color));
  box-shadow:
    0 0 0 4px color-mix(in oklch, var(--brand-blue) 6%, transparent),
    0 10px 34px color-mix(in oklch, var(--brand-blue) 9%, transparent);
}
.ai-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 9px 9px;
}
.ai-composer__modes {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  background: var(--bg-surface-1);
  border: 1px solid color-mix(in oklch, var(--border-color) 50%, transparent);
  border-radius: 12px;
}
.ai-composer__settings {
  max-height: min(220px, 28dvh);
  margin: 6px 10px;
  overflow: auto;
  background: var(--bg-surface-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}
.ai-composer__settings select {
  max-width: 220px;
}
.ai-composer__input {
  min-width: 0;
  min-height: 52px;
  caret-color: var(--brand-blue);
}
.ai-composer__input::placeholder {
  opacity: 0.8;
  font-size: 14px;
}
.ai-composer__send {
  display: grid;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 12px;
  transition: transform 160ms var(--ease-out-quart);
}
.ai-composer__send--ready {
  color: var(--bg-surface-0);
  background: var(--text-1);
  box-shadow: 0 3px 8px color-mix(in oklch, var(--text-1) 12%, transparent);
}
.ai-composer__send--ready:hover {
  transform: translateY(-2px);
}
.ai-composer__send--ready:active {
  transform: scale(0.95);
}
.ai-composer__footnote {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 5px 0;
  color: var(--text-2);
  font-size: 10px;
}
.ai-composer__footnote kbd {
  padding: 2px 4px;
  border: 1px solid color-mix(in oklch, var(--border-color) 80%, transparent);
  border-radius: 4px;
  font-family: inherit;
  font-size: 9px;
}
.ai-composer__disclaimer {
  margin: 10px 0 0;
  color: var(--text-2);
  font-size: 9px;
  text-align: center;
}
.ai-composer__settings-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 9px;
  color: var(--text-2);
  border-radius: 9px;
  font-size: 11px;
}
.ai-composer__settings-toggle:hover,
.ai-composer__settings-toggle.is-active {
  color: var(--brand-blue);
  background: var(--accent-surface);
}
.ai-composer__settings-chevron {
  transition: transform 180ms ease;
}
.ai-composer__settings-toggle.is-active .ai-composer__settings-chevron {
  transform: rotate(180deg);
}
.ai-composer__settings {
  border-style: dashed;
}
.ai-composer__settings select {
  min-height: 28px;
}
.ai-composer__bottom,
.ai-composer__tools,
.ai-composer__submit-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ai-composer__bottom {
  justify-content: space-between;
  padding: 4px 3px 0;
}
.ai-composer__tools {
  flex: 1;
  gap: 8px;
}
.ai-composer__file-input {
  display: none;
}
.ai-composer__attach {
  position: relative;
  display: grid;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--text-2);
  border-radius: 9px;
}
.ai-composer__attach:hover:not(:disabled) {
  color: var(--brand-blue);
  background: var(--accent-surface);
}
.ai-composer__attach:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.ai-composer__attachment-count {
  position: absolute;
  top: -2px;
  right: -2px;
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  color: var(--bg-surface-0);
  background: var(--text-1);
  border-radius: 50%;
  font-size: 9px;
}
.ai-composer__tool-divider {
  flex-shrink: 0;
  width: 1px;
  height: 14px;
  background: var(--border-color);
}
.ai-composer__model-select {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 240px;
  min-height: 30px;
  padding: 4px 7px;
  color: var(--text-2);
  border-radius: 8px;
  font-size: 11px;
}
.ai-composer__model-select:hover {
  color: var(--text-1);
  background: var(--bg-surface-1);
}
.ai-composer__model-select > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-composer__model-select svg {
  flex-shrink: 0;
}
.ai-composer__model-dot {
  flex-shrink: 0;
  width: 5px;
  height: 5px;
  background: var(--brand-blue);
  border-radius: 50%;
}
.ai-composer__submit-group {
  flex-shrink: 0;
}
.ai-composer__send-hint {
  color: var(--text-2);
  font-size: 10px;
}
.ai-composer__surface--sending .ai-composer__send--ready {
  color: var(--text-1);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-color);
}
.ai-composer__surface--dragging {
  border-color: var(--brand-blue);
}
.ai-composer__dropzone {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--brand-blue);
  background: color-mix(in oklch, var(--bg-surface-0) 96%, transparent);
  border: 2px dashed var(--brand-blue);
  border-radius: 21px;
  pointer-events: none;
}
.ai-composer__dropzone strong {
  font-size: 14px;
  font-weight: 500;
}
.ai-composer__dropzone span {
  color: var(--text-2);
  font-size: 11px;
}
.ai-model-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 29px;
  padding: 5px 13px;
  color: var(--text-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  transition:
    color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}
.ai-model-tab:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.ai-model-tab--active {
  color: var(--brand-blue);
  background: var(--bg-surface-0);
  border-color: var(--border-color);
  box-shadow: var(--shadow-surface-value);
}
.ai-model-tab:not(.ai-model-tab--active, :disabled):hover {
  color: var(--text-1);
  background: var(--bg-surface-2);
}
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

@media (width <= 600px) {
  .ai-composer__inner {
    padding: 0 12px max(14px, env(safe-area-inset-bottom));
  }
  .ai-composer__shortcut,
  .ai-composer__send-hint {
    display: none;
  }
  .ai-composer__footnote {
    justify-content: center;
  }
  .ai-composer__toolbar {
    padding-right: 8px;
    padding-left: 8px;
  }
  .ai-model-tab {
    gap: 5px;
    padding: 6px 8px;
  }
  .ai-composer__surface {
    border-radius: 18px;
  }
  .ai-composer__input {
    min-height: 54px;
  }
  .ai-composer__settings-toggle {
    gap: 4px;
    padding: 0 7px;
  }
  .ai-composer__settings-toggle > span,
  .ai-composer__settings-chevron {
    display: none;
  }
  .ai-composer__model-select {
    max-width: 190px;
  }
  .ai-composer__disclaimer {
    margin-top: 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-composer__send,
  .ai-composer__surface,
  .ai-composer__settings-chevron,
  .ai-model-tab {
    transition: none;
  }
}
</style>
