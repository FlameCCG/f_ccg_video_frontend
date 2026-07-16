<script setup lang="ts">
/**
 * 底部命令栏独立组件：模型切换 / 参数 / 输入 全部在此本地状态中。
 * 切换 TEXT/IMAGE/VIDEO 时不会触发父级消息列表重渲染。
 */
import { computed, ref, watch } from 'vue'
import { Loader2, Send, Settings2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { AiModelOption } from '@/api/ai'
import type { AiComposerSendPayload, AiModelType, AiPastedImage } from '@/components/ai/ai-types'

const props = withDefaults(
  defineProps<{
    isSending: boolean
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
}>()

const activeModel = ref<AiModelType>(props.coverPickerMode ? 'image' : props.initialModel)
const inputContent = ref(props.initialPrompt || '')
const pastedImages = ref<AiPastedImage[]>([])
const showSettings = ref(false)

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
}

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

const handleSend = () => {
  if (!canSend.value) return
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
</script>

<template>
  <div class="shrink-0 relative z-20 ai-composer">
    <div
      class="absolute top-0 left-0 right-0 h-12 -translate-y-full bg-gradient-to-t from-[var(--bg-surface-0)] to-transparent pointer-events-none"
    ></div>

    <div class="max-w-4xl mx-auto px-6 pb-6 w-full">
      <div
        class="flex flex-col rounded-[24px] bg-[var(--bg-surface-1)] shadow-overlay border border-[var(--border-color)] p-2 focus-within:ring-1 focus-within:ring-[var(--brand-blue)]"
      >
        <div class="flex items-center justify-between px-3 py-2 mb-1">
          <div
            class="flex items-center gap-1 p-1 bg-[var(--bg-surface-2)] rounded-xl border border-[var(--border-color)]"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              class="ai-model-tab"
              :class="activeModel === 'text' ? 'ai-model-tab--active' : ''"
              :disabled="coverPickerMode"
              @click="setModel('text')"
            >
              TEXT
            </button>
            <button
              type="button"
              role="tab"
              class="ai-model-tab"
              :class="activeModel === 'image' ? 'ai-model-tab--active' : ''"
              @click="setModel('image')"
            >
              IMAGE
            </button>
            <button
              type="button"
              role="tab"
              class="ai-model-tab"
              :class="activeModel === 'video' ? 'ai-model-tab--active' : ''"
              :disabled="coverPickerMode"
              @click="setModel('video')"
            >
              VIDEO
            </button>
          </div>
          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-xl border"
            :class="
              showSettings
                ? 'border-[var(--brand-blue)] text-[var(--brand-blue)] bg-black/5 dark:bg-white/10'
                : 'text-[var(--text-2)] bg-[var(--bg-surface-2)] border-[var(--border-color)] hover:text-[var(--text-1)]'
            "
            aria-label="设置"
            @click="showSettings = !showSettings"
          >
            <Settings2 class="w-4 h-4" />
          </button>
        </div>

        <!-- 不用 transition max-height，避免参数面板动画导致布局抖动 -->
        <div v-show="showSettings" class="overflow-hidden">
          <div
            class="px-4 py-3 mx-2 mb-2 bg-[var(--bg-surface-2)] rounded-[16px] border border-[var(--border-color)] flex gap-8 items-center text-xs font-mono uppercase tracking-widest text-[var(--text-2)] overflow-x-auto custom-scrollbar"
          >
            <template v-if="activeModel === 'text'">
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">Model</span>
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
                <span class="font-bold">Think</span>
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
                <span class="font-bold">Effort</span>
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
                <span class="font-bold">Model</span>
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
                v-if="isSingleImageEdit"
                class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                >Inherits Source</span
              >
            </template>

            <template v-else>
              <label class="flex items-center gap-3 shrink-0">
                <span class="font-bold">Model</span>
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
                <span class="font-bold">Seconds</span>
                <input
                  v-model.number="vidDuration"
                  type="number"
                  :min="videoDurationMin"
                  :max="videoDurationMax"
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
                v-if="isReferenceVideoMode"
                class="ml-auto opacity-70 text-[10px] shrink-0 text-[var(--brand-blue)]"
                >Max 10s Mode</span
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
                alt=""
              />
              <button
                type="button"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[var(--status-danger)] text-[var(--status-danger-ink)] rounded-full flex items-center justify-center shadow-md"
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
                activeModel === 'text' ? 'Type a message...' : 'Describe what you want to create...'
              "
              rows="1"
              @paste="handlePaste"
              @keydown.enter.exact.prevent="handleSend"
            ></textarea>

            <button
              type="button"
              class="shrink-0 w-11 h-11 flex items-center justify-center rounded-2xl shadow-raised"
              :class="
                !canSend
                  ? 'bg-[var(--bg-surface-2)] text-[var(--text-2)] cursor-not-allowed shadow-none border border-[var(--border-color)]'
                  : 'bg-[var(--brand-blue)] text-[var(--signal-foreground)] hover:opacity-90 active:scale-95'
              "
              :disabled="!canSend"
              @click="handleSend"
            >
              <Loader2 v-if="isSending" class="w-5 h-5 animate-spin" />
              <Send v-else class="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      <div class="mt-4 text-center">
        <span
          class="text-[10px] font-mono tracking-widest text-[var(--text-2)] uppercase opacity-70"
          >Generated content may require verification</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-composer {
  contain: layout style;
}

.ai-model-tab {
  padding: 0.375rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-2);
  border: 0;
  background: transparent;
  cursor: pointer;
}

.ai-model-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ai-model-tab--active {
  background: var(--text-1);
  color: var(--bg-surface-0);
  box-shadow: var(--shadow-surface);
}

.ai-model-tab:not(.ai-model-tab--active, :disabled):hover {
  color: var(--text-1);
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}
</style>
