<script setup lang="ts">
import { ref } from 'vue'
import { Info } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import TagInput from './TagInput.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  apply: [data: { isOriginal: boolean; tags: string[] }]
}>()

const batchIsOriginal = ref(false)
const batchTags = ref<string[]>([])

const handleOpen = (val: boolean) => {
  if (val) {
    batchIsOriginal.value = false
    batchTags.value = []
  }
  emit('update:open', val)
}

const handleApply = () => {
  emit('apply', {
    isOriginal: batchIsOriginal.value,
    tags: [...batchTags.value],
  })
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleOpen">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          批量操作
          <Info class="h-4 w-4 text-muted-foreground" />
        </DialogTitle>
        <DialogDescription class="sr-only">批量设置所有作品的稿件类型和标签</DialogDescription>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <div class="flex items-center gap-6">
          <span class="text-sm font-medium w-16 shrink-0">稿件类型</span>
          <div class="flex gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="batchIsOriginal"
                type="radio"
                :value="true"
                class="accent-primary w-4 h-4"
              />
              <span class="text-sm">自制</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="batchIsOriginal"
                type="radio"
                :value="false"
                class="accent-primary w-4 h-4"
              />
              <span class="text-sm">转载</span>
            </label>
          </div>
        </div>

        <div class="flex items-start gap-6">
          <span class="text-sm font-medium w-16 shrink-0 pt-2">输入标签</span>
          <div class="flex-1">
            <TagInput v-model="batchTags" :max="10" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          class="hover:bg-muted/80 hover:text-foreground"
          @click="handleOpen(false)"
          >取消</Button
        >
        <Button @click="handleApply">确定</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
