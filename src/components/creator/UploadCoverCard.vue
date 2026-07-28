<script setup lang="ts">
import { Bot, ImageIcon, Loader2, Shuffle, SlidersHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { dataAttrs, type CoverCandidate } from './upload-shared'

defineProps<{
  coverPreview: string
  coverSource: 'none' | 'auto' | 'manual'
  coverCandidates: CoverCandidate[]
  title: string
  invalid: boolean
  aiBusy: boolean
}>()

const emit = defineEmits<{
  open: []
  ai: []
  select: [candidateId: string]
}>()
</script>

<template>
  <section id="upload-field-cover" class="cover-field">
    <div class="cover-field__label">
      <span>封面 <span class="text-destructive">*</span></span>
      <span
        v-if="coverSource !== 'none'"
        class="cover-field__source"
        :class="coverSource === 'auto' ? 'status-surface-info' : 'surface-tint'"
      >
        {{ coverSource === 'auto' ? '推荐封面' : '自定义' }}
      </span>
    </div>

    <div class="cover-field__content">
      <div class="cover-field__primary">
        <button
          type="button"
          class="cover-field__preview"
          v-bind="
            dataAttrs({
              'data-empty': coverPreview ? 'false' : 'true',
              'data-invalid': invalid ? 'true' : 'false',
            })
          "
          :aria-label="coverPreview ? '编辑视频封面' : '设置视频封面'"
          @click="emit('open')"
        >
          <img
            v-if="coverPreview"
            :src="coverPreview"
            :alt="title ? `${title} 的封面` : '视频封面'"
            class="cover-field__image"
            draggable="false"
          />
          <span v-else class="cover-field__empty">
            <ImageIcon class="h-6 w-6" />
            <span>设置封面</span>
          </span>
        </button>

        <div class="cover-field__actions">
          <p class="text-sm font-medium text-foreground">
            {{ coverPreview ? '封面已就绪' : '选择一个清晰的主画面' }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" @click="emit('open')">
              <SlidersHorizontal class="h-3.5 w-3.5" />
              封面设置
            </Button>
            <Button variant="ghost" size="sm" :disabled="aiBusy" @click="emit('ai')">
              <Loader2 v-if="aiBusy" class="h-3.5 w-3.5 animate-spin" />
              <Bot v-else class="h-3.5 w-3.5" />
              AI 生成
            </Button>
          </div>
        </div>
      </div>

      <p v-if="invalid" class="mt-2 text-xs text-destructive">发布前需要先设置封面</p>

      <div class="cover-field__recommend">
        <div class="cover-field__recommend-title">
          <span class="inline-flex items-center gap-1.5 font-medium text-foreground">
            <Shuffle class="h-3.5 w-3.5 text-primary" />
            推荐封面
          </span>
          <span>点击即可使用</span>
        </div>

        <div v-if="coverCandidates.length > 0" class="cover-field__rail">
          <button
            v-for="(candidate, index) in coverCandidates"
            :key="candidate.id"
            type="button"
            class="cover-field__candidate"
            :class="{ 'is-active': candidate.preview === coverPreview }"
            :aria-label="`使用第 ${index + 1} 张推荐封面`"
            @click="emit('select', candidate.id)"
          >
            <img :src="candidate.preview" alt="" draggable="false" />
          </button>
        </div>
        <div v-else class="cover-field__recommend-empty">
          视频上传完成后，这里会自动生成推荐封面。
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.cover-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

@media (width >= 720px) {
  .cover-field {
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 1.25rem;
  }
}

.cover-field__label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  align-self: start;
  min-height: 2.25rem;
  color: var(--color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
}

.cover-field__source {
  padding: 0.0625rem 0.375rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 500;
}

.cover-field__content {
  min-width: 0;
}

.cover-field__primary {
  display: grid;
  grid-template-columns: minmax(0, 13rem);
  gap: 1rem;
}

@media (width >= 640px) {
  .cover-field__primary {
    grid-template-columns: minmax(0, 13rem) minmax(0, 1fr);
    align-items: center;
  }
}

.cover-field__preview {
  display: block;
  position: relative;
  width: 100%;
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

  &:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .cover-field__preview:hover {
    border-color: color-mix(in oklch, var(--color-primary) 50%, var(--color-border));
  }
}

.cover-field__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-field__empty {
  display: flex;
  position: absolute;
  inset: 0;
  flex-direction: column;
  gap: 0.375rem;
  align-items: center;
  justify-content: center;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
}

.cover-field__actions {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  align-items: flex-start;
}

.cover-field__recommend {
  margin-top: 1rem;
  padding: 0.875rem;
  border-radius: var(--radius-lg);
  background-color: color-mix(in oklch, var(--color-muted) 36%, transparent);
}

.cover-field__recommend-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem 0.75rem;
  align-items: center;
  margin-bottom: 0.625rem;
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
}

.cover-field__rail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}

@media (width >= 560px) {
  .cover-field__rail {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

.cover-field__candidate {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  background-color: var(--color-muted);
  transition:
    border-color var(--duration-fast) var(--ease-out-quart),
    transform var(--duration-fast) var(--ease-out-quint);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.is-active {
    border-color: var(--color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 2px;
  }
}

@media (hover: hover) and (pointer: fine) {
  .cover-field__candidate:hover {
    border-color: color-mix(in oklch, var(--color-primary) 65%, var(--color-border));
    transform: translateY(-2px);
  }
}

.cover-field__recommend-empty {
  display: flex;
  min-height: 3.5rem;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-muted-foreground);
  font-size: 0.75rem;
  text-align: center;
}
</style>
