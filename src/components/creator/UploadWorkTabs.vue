<script setup lang="ts">
/**
 * 作品切换条。原实现是 div + @click：键盘完全不可达、没有 role/aria、
 * 删除按钮 opacity-0 + group-hover（触屏永远点不到，而它是唯一的移除路径）。
 * 这里改成标准 tablist：roving tabindex + 方向键 + Home/End，删除按钮在
 * hover / focus-within / 无 hover 设备上分别可达。
 */
import { computed, nextTick, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { CheckCircle2, Loader2, Plus, X } from 'lucide-vue-next'
import {
  dataAttrs,
  hasBlockingIssue,
  isBusyPartStatus,
  type VideoWork,
  type WorkIssues,
} from './upload-shared'

const props = defineProps<{
  works: VideoWork[]
  activeIndex: number
  issues: WorkIssues[]
  /** 已经点过发布：把「待完善」从中性提示升级为错误提示 */
  strict: boolean
}>()

const emit = defineEmits<{
  select: [index: number]
  remove: [index: number]
  add: []
}>()

type TabTone = 'busy' | 'ready' | 'todo' | 'danger' | 'done'

const tabRefs = ref<(HTMLButtonElement | null)[]>([])

const setTabRef = (el: Element | ComponentPublicInstance | null, index: number) => {
  tabRefs.value[index] = (el as HTMLButtonElement | null) ?? null
}

const statusOf = computed(() =>
  props.works.map((work, index): { tone: TabTone; label: string } => {
    if (work.publishState === 'done') return { tone: 'done', label: '已发布' }
    if (work.publishState === 'failed') return { tone: 'danger', label: '发布失败' }
    if (work.parts.some((part) => part.status === 'error')) {
      return { tone: 'danger', label: '有文件失败' }
    }
    if (work.parts.some((part) => isBusyPartStatus(part.status))) {
      return { tone: 'busy', label: '上传中' }
    }
    const issues = props.issues[index]
    if (issues && hasBlockingIssue(issues)) {
      return { tone: props.strict ? 'danger' : 'todo', label: '待完善' }
    }
    return { tone: 'ready', label: '可发布' }
  })
)

const focusTab = (index: number) => {
  void nextTick(() => tabRefs.value[index]?.focus())
}

const moveTo = (index: number) => {
  const total = props.works.length
  if (total === 0) return
  const next = ((index % total) + total) % total
  emit('select', next)
  focusTab(next)
}

const onKeydown = (event: KeyboardEvent, index: number) => {
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault()
      moveTo(index + 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      moveTo(index - 1)
      break
    case 'Home':
      event.preventDefault()
      moveTo(0)
      break
    case 'End':
      event.preventDefault()
      moveTo(props.works.length - 1)
      break
    default:
      break
  }
}

const tabLabel = (work: VideoWork, index: number) =>
  work.form.title || work.parts[0]?.sourceFileName || `作品 ${index + 1}`
</script>

<template>
  <div class="upload-tabs">
    <div
      class="upload-tabs__strip"
      role="tablist"
      aria-label="待发布的作品"
      aria-orientation="horizontal"
    >
      <div
        v-for="(work, wIdx) in works"
        :key="work.id"
        class="upload-tab"
        v-bind="
          dataAttrs({
            'data-active': activeIndex === wIdx ? 'true' : 'false',
            'data-tone': statusOf[wIdx]?.tone,
          })
        "
      >
        <button
          :id="`upload-work-tab-${work.id}`"
          :ref="(el) => setTabRef(el, wIdx)"
          type="button"
          role="tab"
          class="upload-tab__button"
          :aria-selected="activeIndex === wIdx"
          :aria-controls="`upload-work-panel-${work.id}`"
          :tabindex="activeIndex === wIdx ? 0 : -1"
          @click="emit('select', wIdx)"
          @keydown="onKeydown($event, wIdx)"
        >
          <span class="upload-tab__title">{{ tabLabel(work, wIdx) }}</span>
          <span class="upload-tab__status">
            <Loader2
              v-if="statusOf[wIdx]?.tone === 'busy'"
              class="h-3 w-3 shrink-0 animate-spin"
              aria-hidden="true"
            />
            <CheckCircle2
              v-else-if="statusOf[wIdx]?.tone === 'ready' || statusOf[wIdx]?.tone === 'done'"
              class="h-3 w-3 shrink-0"
              aria-hidden="true"
            />
            <span v-else class="upload-tab__dot" aria-hidden="true"></span>
            {{ statusOf[wIdx]?.label }}
          </span>
        </button>

        <button
          v-if="works.length > 1"
          type="button"
          class="upload-tab__remove focus-ring"
          :aria-label="`移除 ${tabLabel(work, wIdx)}`"
          :title="`移除 ${tabLabel(work, wIdx)}`"
          @click="emit('remove', wIdx)"
        >
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <button type="button" class="upload-tabs__add active-scale" @click="emit('add')">
      <Plus class="h-3.5 w-3.5" />
      <span>添加作品</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.upload-tabs {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
  overflow-x: auto;
  padding-bottom: 0.375rem;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--color-foreground) 12%, transparent) transparent;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in oklch, var(--color-foreground) 12%, transparent);
  }
}

.upload-tabs__strip {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.upload-tab {
  --tab-ink: var(--color-muted-foreground);

  display: flex;
  position: relative;
  flex-shrink: 0;
  align-items: stretch;
  width: 11.5rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: var(--color-card);
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  /* 选中态用「左侧竖条 + 描边 + 淡底」，不做整块反色 ——
     原来的 bg-primary 反色逼出了 text-white/80 这类硬编码色。 */
  &::before {
    content: '';
    position: absolute;
    top: 0.5rem;
    bottom: 0.5rem;
    left: 0;
    width: 3px;
    border-radius: 0 999px 999px 0;
    background-color: var(--color-primary);
    transform: scaleY(0);
    transform-origin: center;
    transition: transform var(--duration-normal) var(--ease-out-expo);
  }

  &[data-active='true'] {
    border-color: color-mix(in oklch, var(--color-primary) 45%, var(--color-border));
    background-color: color-mix(in oklch, var(--color-primary) 8%, var(--color-card));

    &::before {
      transform: scaleY(1);
    }
  }

  &[data-tone='busy'] {
    --tab-ink: var(--color-primary);
  }

  &[data-tone='ready'],
  &[data-tone='done'] {
    --tab-ink: var(--status-success-ink);
  }

  &[data-tone='todo'] {
    --tab-ink: var(--status-warning-ink);
  }

  &[data-tone='danger'] {
    --tab-ink: var(--status-danger-ink);
  }
}

@media (hover: hover) and (pointer: fine) {
  .upload-tab:not([data-active='true']):hover {
    border-color: color-mix(in oklch, var(--color-foreground) 22%, var(--color-border));
  }
}

.upload-tab__button {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-start;
  min-width: 0;
  padding: 0.625rem 0.75rem;
  text-align: left;
}

/* 有删除按钮时才让出右上角空间，单作品时标题可以吃满整宽 */
.upload-tab:has(.upload-tab__remove) .upload-tab__button {
  padding-right: 1.75rem;
}

.upload-tab__title {
  display: block;
  width: 100%;
  overflow: hidden;
  color: var(--color-foreground);
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-tab__status {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  color: var(--tab-ink);
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1rem;
}

.upload-tab__dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 999px;
  background-color: currentcolor;
}

.upload-tab__remove {
  display: flex;
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: var(--radius-sm);
  color: var(--color-muted-foreground);
  opacity: 0;
  transition:
    opacity var(--duration-fast) linear,
    color var(--duration-fast) linear,
    background-color var(--duration-fast) linear;

  &:hover {
    background-color: color-mix(in oklch, var(--status-danger) 14%, transparent);
    color: var(--status-danger-ink);
  }

  &:focus-visible {
    opacity: 1;
  }
}

.upload-tab:hover .upload-tab__remove,
.upload-tab:focus-within .upload-tab__remove {
  opacity: 1;
}

/* 触屏没有 hover，删除按钮必须常驻，否则多余作品永远删不掉 */
@media (hover: none) {
  .upload-tab__remove {
    opacity: 1;
  }
}

.upload-tabs__add {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.375rem;
  align-items: center;
  align-self: stretch;
  padding: 0 0.875rem;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear,
    background-color var(--duration-fast) var(--ease-out-quart);

  &:hover {
    border-color: color-mix(in oklch, var(--color-primary) 45%, var(--color-border));
    background-color: color-mix(in oklch, var(--color-primary) 6%, transparent);
    color: var(--color-foreground);
  }
}
</style>
