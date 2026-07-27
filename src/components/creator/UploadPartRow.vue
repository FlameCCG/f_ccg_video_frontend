<script setup lang="ts">
/**
 * 单个分P的传输行。
 *
 * 独立成组件是为了收敛重渲染范围：part 是响应式对象，进度写入只会失活本组件的
 * render effect，投稿页的分区网格 / 封面 / 定时发布面板不再跟着每 1% 重跑一遍。
 * 进度条动 transform: scaleX() 而不是 width —— 后者每帧触发布局重排。
 */
import { computed } from 'vue'
import { Pause, Play, RefreshCw, RotateCcw, X, Zap } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PART_STATUS_META,
  dataAttrs,
  formatBytes,
  formatEta,
  formatSpeed,
  type VideoPart,
} from './upload-shared'

const props = defineProps<{
  part: VideoPart
  index: number
  /** 多P时展示 P1/P2 序号并允许编辑分P标题 */
  showLabel: boolean
  /** 0 表示不在排队 */
  queuePosition: number
  chunkSize: number
}>()

const emit = defineEmits<{
  replace: []
  pause: []
  resume: []
  remove: []
  'update:title': [value: string]
}>()

const meta = computed(() => PART_STATUS_META[props.part.status])
const isDone = computed(() => props.part.status === 'success')
const isInstant = computed(() => isDone.value && props.part.instant)
const canPause = computed(() => ['uploading', 'hashing', 'checking'].includes(props.part.status))
const canResume = computed(() => ['paused', 'error', 'canceled'].includes(props.part.status))

const clampedProgress = computed(() => Math.min(Math.max(props.part.progress, 0), 100))
const fillScale = computed(() => (meta.value.indeterminate ? 1 : clampedProgress.value / 100))

const totalChunks = computed(() =>
  props.chunkSize > 0 ? Math.max(Math.ceil(props.part.file.size / props.chunkSize), 1) : 0
)

const statusLabel = computed(() => {
  if (props.part.status === 'pending' && props.queuePosition > 0) {
    return `排队中 · 第 ${props.queuePosition} 位`
  }
  return meta.value.label
})

/** 只有 uploading 有可信百分比；hashing 的百分比是指纹计算进度，单独在 detail 里说明 */
const showPercent = computed(() => props.part.status === 'uploading')

const detail = computed(() => {
  const part = props.part
  switch (part.status) {
    case 'uploading': {
      const segments = [`${formatBytes(part.uploadedBytes)} / ${formatBytes(part.file.size)}`]
      const speed = formatSpeed(part.speedBps)
      if (speed) segments.push(speed)
      const eta = formatEta(part.etaMs)
      if (eta) segments.push(`剩余 ${eta}`)
      return segments.join(' · ')
    }
    case 'hashing':
      return `本地读取 ${clampedProgress.value}%，用于秒传比对`
    case 'checking':
      return '正在比对服务端是否已有相同文件'
    case 'merging':
      return `${totalChunks.value} 个分片已传完，服务端合并中`
    case 'pending':
      return `${formatBytes(part.file.size)} · 等待前面的文件传完`
    case 'paused':
      return `已传 ${formatBytes(part.uploadedBytes)} / ${formatBytes(part.file.size)}，继续后从断点接着传`
    case 'canceled':
      return `${formatBytes(part.file.size)} · 已停止，可重新开始`
    case 'error':
      return part.errorMessage || '传输中断，请重试或更换文件'
    case 'success':
      return `${formatBytes(part.file.size)} · ${totalChunks.value} 个分片`
    default:
      return ''
  }
})
</script>

<template>
  <div
    class="upload-part"
    v-bind="
      dataAttrs({
        'data-tone': meta.tone,
        'data-status': part.status,
        'data-indeterminate': meta.indeterminate ? 'true' : 'false',
      })
    "
  >
    <div class="upload-part__badge" aria-hidden="true">
      <span v-if="showLabel" class="tabular">P{{ index + 1 }}</span>
      <Play v-else class="h-4 w-4" />
    </div>

    <div class="upload-part__main">
      <div class="flex items-center gap-2">
        <template v-if="showLabel">
          <Label :for="`part-title-${part.id}`" class="sr-only">第 {{ index + 1 }} P 的标题</Label>
          <Input
            :id="`part-title-${part.id}`"
            :model-value="part.title"
            class="h-8 min-w-0 flex-1 text-xs"
            placeholder="给这一P起个名字"
            @update:model-value="emit('update:title', String($event))"
          />
        </template>
        <span v-else class="min-w-0 flex-1 truncate text-sm font-medium" :title="part.title">
          {{ part.title }}
        </span>

        <div class="upload-part__actions">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            @click="emit('replace')"
          >
            <RefreshCw class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">更换</span>
            <span class="sr-only sm:hidden">更换视频文件</span>
          </Button>
          <Button
            v-if="canPause"
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-muted-foreground hover:text-foreground"
            @click="emit('pause')"
          >
            <Pause class="h-3.5 w-3.5" />
            <span class="sr-only">暂停上传</span>
          </Button>
          <Button
            v-if="canResume"
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-primary hover:bg-primary/10"
            @click="emit('resume')"
          >
            <RotateCcw class="h-3.5 w-3.5" />
            <span class="sr-only">继续上传</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            @click="emit('remove')"
          >
            <X class="h-3.5 w-3.5" />
            <span class="sr-only">移除 {{ part.title || '这个文件' }}</span>
          </Button>
        </div>
      </div>

      <p v-if="isInstant" class="upload-part__instant">
        <Zap class="h-3.5 w-3.5 shrink-0" />
        <span class="font-medium">秒传成功</span>
        <span class="upload-part__instant-detail">
          服务端已有相同文件，跳过了 {{ formatBytes(part.file.size) }} 的传输
        </span>
      </p>

      <template v-else>
        <div
          v-if="!isDone"
          class="upload-part__track"
          role="progressbar"
          :aria-valuenow="meta.indeterminate ? undefined : clampedProgress"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-label="`${part.title || '文件'} ${statusLabel}`"
        >
          <div class="upload-part__fill" :style="{ '--upload-fill': fillScale }"></div>
        </div>

        <p class="upload-part__meta">
          <span class="upload-part__chip">
            <component :is="meta.icon" class="h-3.5 w-3.5 shrink-0" />
            <span>{{ statusLabel }}</span>
            <span v-if="showPercent" class="tabular">{{ clampedProgress }}%</span>
          </span>
          <span v-if="detail" class="upload-part__detail" :title="detail">{{ detail }}</span>
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.upload-part {
  --tone-fill: color-mix(in oklch, var(--color-foreground) 26%, transparent);
  --tone-ink: var(--color-muted-foreground);
  --tone-soft: color-mix(in oklch, var(--color-foreground) 7%, transparent);

  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: color-mix(in oklch, var(--color-card) 70%, transparent);
  transition:
    border-color var(--duration-normal) var(--ease-out-quart),
    background-color var(--duration-normal) var(--ease-out-quart);

  &[data-tone='active'] {
    --tone-fill: var(--color-primary);
    --tone-ink: var(--color-primary);
    --tone-soft: color-mix(in oklch, var(--color-primary) 12%, transparent);
  }

  &[data-tone='prepare'] {
    --tone-fill: var(--status-warning);
    --tone-ink: var(--status-warning-ink);
    --tone-soft: var(--status-warning-soft);
  }

  &[data-tone='probe'] {
    --tone-fill: var(--status-info);
    --tone-ink: var(--status-info-ink);
    --tone-soft: var(--status-info-soft);
  }

  &[data-tone='hold'] {
    --tone-fill: color-mix(in oklch, var(--color-foreground) 38%, transparent);
    --tone-ink: var(--color-foreground);
    --tone-soft: color-mix(in oklch, var(--color-foreground) 9%, transparent);
  }

  &[data-tone='danger'] {
    --tone-fill: var(--status-danger);
    --tone-ink: var(--status-danger-ink);
    --tone-soft: var(--status-danger-soft);

    border-color: var(--status-danger-border);
  }

  &[data-tone='done'] {
    --tone-fill: var(--status-success);
    --tone-ink: var(--status-success-ink);
    --tone-soft: var(--status-success-soft);
  }
}

.upload-part__badge {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: var(--radius-md);
  background-color: var(--tone-soft);
  color: var(--tone-ink);
  font-size: 0.75rem;
  font-weight: 600;
  transition:
    background-color var(--duration-normal) var(--ease-out-quart),
    color var(--duration-normal) var(--ease-out-quart);
}

.upload-part__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
}

.upload-part__actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.125rem;
  align-items: center;
}

.upload-part__track {
  position: relative;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background-color: color-mix(in oklch, var(--color-foreground) 8%, transparent);

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 38%;
    background-image: linear-gradient(90deg, transparent, var(--tone-fill), transparent);
    opacity: 0;
    transform: translate3d(-110%, 0, 0);
  }
}

.upload-part__fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background-color: var(--tone-fill);
  transform: scaleX(var(--upload-fill, 0));
  transform-origin: left center;
  transition: transform var(--duration-normal) var(--ease-out-quart);
  will-change: transform;
}

/* 已暂停：颜色相近的 idle/hold 靠斜纹再区分一层，不依赖色觉 */
.upload-part[data-status='paused'] .upload-part__fill {
  background-image: repeating-linear-gradient(
    115deg,
    transparent 0 5px,
    color-mix(in oklch, var(--color-background) 60%, transparent) 5px 10px
  );
}

.upload-part[data-status='canceled'] .upload-part__fill {
  opacity: 0.4;
}

.upload-part[data-indeterminate='true'] {
  .upload-part__fill {
    opacity: 0.2;
  }

  .upload-part__track::after {
    opacity: 0.95;
    animation: upload-sweep 1.15s var(--ease-out-quart) infinite;
  }
}

@keyframes upload-sweep {
  from {
    transform: translate3d(-110%, 0, 0);
  }

  to {
    transform: translate3d(275%, 0, 0);
  }
}

.upload-part__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: baseline;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.25rem;
}

.upload-part__chip {
  display: inline-flex;
  flex-shrink: 0;
  gap: 0.3rem;
  align-items: center;
  color: var(--tone-ink);
  font-weight: 500;
}

/* 完成态给一个实心句号：描边图标在一行小字里太轻，撑不起「这件事结束了」 */
.upload-part[data-status='success'] .upload-part__chip svg {
  fill: var(--status-success);
  color: var(--signal-foreground);
}

.upload-part__detail {
  min-width: 0;
  overflow: hidden;
  color: var(--color-muted-foreground);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 秒传：这一页最值得炫耀的能力，给它一个独立的记忆点而不是又一行灰字 */
.upload-part__instant {
  display: flex;
  position: relative;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;
  align-items: center;
  align-self: flex-start;
  overflow: hidden;
  padding: 0.25rem 0.625rem;
  border: 1px solid var(--status-info-border);
  border-radius: 999px;
  background: var(--status-info-soft);
  color: var(--status-info-ink);
  font-size: 0.75rem;
  line-height: 1.25rem;
  animation: upload-instant-in var(--duration-slow) var(--ease-out-expo) both;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 45%;
    background-image: linear-gradient(
      90deg,
      transparent,
      color-mix(in oklch, var(--status-info) 30%, transparent),
      transparent
    );
    transform: translate3d(-120%, 0, 0);
    animation: upload-instant-flare 900ms var(--ease-out-expo) 160ms both;
  }
}

.upload-part__instant-detail {
  color: color-mix(in oklch, var(--status-info-ink) 76%, transparent);
}

@keyframes upload-instant-in {
  from {
    opacity: 0;
    transform: translate3d(0, 4px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes upload-instant-flare {
  from {
    transform: translate3d(-120%, 0, 0);
  }

  to {
    transform: translate3d(260%, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .upload-part[data-indeterminate='true'] .upload-part__track::after {
    animation: none;
    opacity: 0.6;
    transform: translate3d(30%, 0, 0);
  }

  .upload-part__instant,
  .upload-part__instant::after {
    animation: none;
  }

  .upload-part__instant::after {
    opacity: 0;
  }
}
</style>
