<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogClose,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import DialogOverlay from './DialogOverlay.vue'

const props = defineProps<DialogContentProps & { class?: string; hideClose?: boolean }>()
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, hideClose: __, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      v-bind="forwarded"
      :class="
        cn(
          'motion-surface fixed left-1/2 top-1/2 z-[99999] grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-overlay sm:rounded-lg',
          props.class
        )
      "
    >
      <slot />

      <DialogClose
        v-if="!hideClose"
        class="ui-button absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X class="h-4 w-4" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
