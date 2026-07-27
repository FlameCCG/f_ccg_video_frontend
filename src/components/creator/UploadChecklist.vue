<script setup lang="ts">
/**
 * 发布前检查清单。原来的校验只有一闪而过的 toast（多作品时还得自己去 8 个字段里找），
 * 这里把「还差什么」常驻在侧栏，每项可点击跳到对应字段。
 */
import { computed } from 'vue'
import { Check, ChevronRight, Circle } from 'lucide-vue-next'
import {
  dataAttrs,
  hasBlockingIssue,
  type ChecklistField,
  type VideoWork,
  type WorkIssues,
} from './upload-shared'

const props = defineProps<{
  works: VideoWork[]
  activeIndex: number
  issues: WorkIssues[]
  strict: boolean
}>()

const emit = defineEmits<{
  jump: [field: ChecklistField]
  select: [index: number]
}>()

const activeIssues = computed<WorkIssues | undefined>(() => props.issues[props.activeIndex])

interface ChecklistItem {
  field: ChecklistField
  label: string
  done: boolean
}

const items = computed<ChecklistItem[]>(() => {
  const issues = activeIssues.value
  if (!issues) return []

  const fileLabel = issues.noParts
    ? '添加视频文件'
    : issues.failed
      ? '有文件上传失败，需要重试'
      : issues.uploading
        ? '等待文件传输完成'
        : '视频文件已就绪'

  return [
    {
      field: 'parts',
      label: fileLabel,
      done: !issues.noParts && !issues.uploading && !issues.failed,
    },
    { field: 'title', label: '填写标题', done: !issues.title },
    { field: 'partition', label: '选择分区', done: !issues.partition },
    { field: 'cover', label: '设置封面', done: !issues.cover },
  ]
})

const remainingCount = computed(() => items.value.filter((item) => !item.done).length)

/** 其它作品里还没填完的，多作品投稿时最容易漏 */
const otherPending = computed(() =>
  props.works
    .map((work, index) => ({ work, index }))
    .filter(({ index }) => {
      if (index === props.activeIndex) return false
      const issues = props.issues[index]
      return issues ? hasBlockingIssue(issues) : false
    })
)
</script>

<template>
  <section class="rounded-2xl border border-border bg-card p-5 shadow-surface">
    <div class="mb-3 flex items-baseline justify-between gap-2">
      <h2 class="text-sm font-semibold tracking-tight">发布前检查</h2>
      <span
        class="text-xs"
        :class="remainingCount === 0 ? 'text-[var(--status-success-ink)]' : 'text-muted-foreground'"
      >
        {{ remainingCount === 0 ? '全部就绪' : `还差 ${remainingCount} 项` }}
      </span>
    </div>

    <ul class="space-y-0.5">
      <li v-for="item in items" :key="item.field">
        <button
          type="button"
          class="checklist__row"
          v-bind="
            dataAttrs({
              'data-done': item.done ? 'true' : 'false',
              'data-strict': strict && !item.done ? 'true' : 'false',
            })
          "
          @click="emit('jump', item.field)"
        >
          <span class="checklist__mark" aria-hidden="true">
            <Check v-if="item.done" class="h-3 w-3" />
            <Circle v-else class="h-2 w-2" />
          </span>
          <span class="min-w-0 flex-1 truncate text-left">{{ item.label }}</span>
          <ChevronRight
            v-if="!item.done"
            class="h-3.5 w-3.5 shrink-0 opacity-50"
            aria-hidden="true"
          />
          <span class="sr-only">{{ item.done ? '已完成' : '未完成，点击前往' }}</span>
        </button>
      </li>
    </ul>

    <div v-if="otherPending.length > 0" class="mt-3 border-t border-border pt-3">
      <p class="mb-1.5 text-xs text-muted-foreground">其它作品还没填完</p>
      <button
        v-for="entry in otherPending"
        :key="entry.work.id"
        type="button"
        class="checklist__row"
        @click="emit('select', entry.index)"
      >
        <span class="checklist__mark checklist__mark--warn" aria-hidden="true">
          <Circle class="h-2 w-2" />
        </span>
        <span class="min-w-0 flex-1 truncate text-left">
          {{ entry.work.form.title || `作品 ${entry.index + 1}` }}
        </span>
        <ChevronRight class="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.checklist__row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
  padding: 0.3125rem 0.375rem;
  border-radius: var(--radius-md);
  color: var(--color-muted-foreground);
  font-size: 0.8125rem;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    color var(--duration-fast) linear;

  &[data-done='true'] {
    color: var(--color-foreground);
  }

  &:hover {
    background-color: color-mix(in oklch, var(--color-foreground) 5%, transparent);
  }
}

.checklist__mark {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  border: 1px solid color-mix(in oklch, var(--color-foreground) 18%, transparent);
  border-radius: 999px;
  color: var(--color-muted-foreground);
  transition:
    border-color var(--duration-normal) var(--ease-out-quart),
    background-color var(--duration-normal) var(--ease-out-quart),
    color var(--duration-normal) linear;
}

.checklist__row[data-done='true'] .checklist__mark {
  border-color: var(--status-success-border);
  background-color: var(--status-success-soft);
  color: var(--status-success-ink);
}

.checklist__row[data-strict='true'] {
  color: var(--status-danger-ink);
}

.checklist__row[data-strict='true'] .checklist__mark {
  border-color: var(--status-danger-border);
  color: var(--status-danger-ink);
}

.checklist__mark--warn {
  border-color: var(--status-warning-border);
  color: var(--status-warning-ink);
}
</style>
