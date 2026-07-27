<script setup lang="ts">
/**
 * 封面卡。原来是塞在长表单中段的 240px 小框，操作只在 hover 出现（触屏换不了封面），
 * AI 入口是个没有可访问名的圆形图标按钮，自动截取的封面也没有任何标识 ——
 * 用户很容易带着一帧黑场就发布了。
 */
import { Bot, ImageIcon, Loader2, Sparkles } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { dataAttrs } from './upload-shared'

defineProps<{
  coverPreview: string
  coverSource: 'none' | 'auto' | 'manual'
  title: string
  invalid: boolean
  aiBusy: boolean
  tip: string
}>()

const emit = defineEmits<{
  open: []
  ai: []
}>()
</script>

<template>
  <section
    id="upload-field-cover"
    class="rounded-2xl border border-border bg-card p-5 shadow-surface"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold tracking-tight">
        视频封面 <span class="text-destructive">*</span>
      </h2>
      <span v-if="coverSource === 'auto'" class="status-surface-info cover-card__chip">
        <Sparkles class="h-3 w-3" aria-hidden="true" />
        自动截取
      </span>
    </div>

    <button
      type="button"
      class="cover-card__preview"
      v-bind="
        dataAttrs({
          'data-empty': coverPreview ? 'false' : 'true',
          'data-invalid': invalid ? 'true' : 'false',
        })
      "
      :aria-label="coverPreview ? '更换视频封面' : '设置视频封面'"
      @click="emit('open')"
    >
      <img
        v-if="coverPreview"
        :src="coverPreview"
        :alt="title ? `${title} 的封面` : '视频封面'"
        class="cover-card__image"
      />
      <span v-else class="cover-card__empty">
        <ImageIcon class="h-7 w-7" aria-hidden="true" />
        <span class="text-sm font-medium">设置封面</span>
        <span class="text-xs">上传图片，或从视频里截一帧</span>
      </span>
    </button>

    <p v-if="coverSource === 'auto'" class="mt-2.5 text-xs text-muted-foreground">
      这是从视频第一段自动截取的，建议确认一下再发布。
    </p>
    <p v-else-if="invalid" class="mt-2.5 text-xs text-destructive">发布前需要先设置封面</p>

    <!-- 按钮跟着预览图的宽度走，不然两颗按钮会被拉到整个版心宽 -->
    <div class="mt-3 flex max-w-[22rem] gap-2">
      <Button variant="outline" size="sm" class="flex-1" @click="emit('open')">
        <ImageIcon class="h-3.5 w-3.5" />
        {{ coverPreview ? '更换封面' : '选择封面' }}
      </Button>
      <Button variant="outline" size="sm" class="flex-1" :disabled="aiBusy" @click="emit('ai')">
        <Loader2 v-if="aiBusy" class="h-3.5 w-3.5 animate-spin" />
        <Bot v-else class="h-3.5 w-3.5" />
        AI 生成
      </Button>
    </div>

    <p class="mt-3 text-xs leading-5 text-muted-foreground">{{ tip }}</p>
  </section>
</template>

<style scoped lang="scss">
.cover-card__chip {
  display: inline-flex;
  gap: 0.25rem;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border: 1px solid;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 500;
  line-height: 1rem;
}

/* 单栏版心（56rem）下若还让 16:9 占满整行，封面会变成一块 900×500 的巨幕，
   比它在成品页里的任何一处都大得多，喧宾夺主。按真实封面的量级封顶。 */
.cover-card__preview {
  display: block;
  position: relative;
  width: 100%;
  max-width: 22rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background-color: color-mix(in oklch, var(--color-muted) 45%, transparent);
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    background-color var(--duration-fast) var(--ease-out-quart);

  &[data-empty='true'] {
    border-style: dashed;
  }

  &[data-invalid='true'] {
    border-color: var(--status-danger-border);
  }
}

@media (hover: hover) and (pointer: fine) {
  .cover-card__preview:hover {
    border-color: color-mix(in oklch, var(--color-primary) 50%, var(--color-border));
  }
}

.cover-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-card__empty {
  display: flex;
  position: absolute;
  inset: 0;
  flex-direction: column;
  gap: 0.25rem;
  align-items: center;
  justify-content: center;
  padding: 0 1rem;
  color: var(--color-muted-foreground);
  text-align: center;
}
</style>
