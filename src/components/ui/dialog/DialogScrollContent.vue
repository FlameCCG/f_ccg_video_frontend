<script setup lang="ts">
import { computed } from 'vue'
import {
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

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
    <DialogOverlay
      class="motion-overlay overlay-scrim fixed inset-0 z-50 grid place-items-center overflow-y-auto"
    >
      <DialogContent
        :class="
          cn(
            'motion-surface relative z-50 my-8 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-overlay sm:rounded-lg',
            props.class
          )
        "
        v-bind="forwarded"
        @pointer-down-outside="
          (event) => {
            const originalEvent = event.detail.originalEvent
            const target = originalEvent.target as HTMLElement
            if (target.closest('[data-sonner-toaster]')) {
              event.preventDefault()
            }
          }
        "
      >
        <slot />

        <button
          v-if="!hideClose"
          class="ui-button absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
        >
          <X class="h-4 w-4" />
          <span class="sr-only">Close</span>
        </button>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
