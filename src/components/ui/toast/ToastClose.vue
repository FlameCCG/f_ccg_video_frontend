<script setup lang="ts">
import type { ToastCloseProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { X } from 'lucide-vue-next'
import { ToastClose } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<
  ToastCloseProps & {
    class?: HTMLAttributes['class']
  }
>()

const delegatedProps = reactiveOmit(props, 'class')
</script>

<template>
  <ToastClose
    v-bind="delegatedProps"
    :class="
      cn(
        'focus-ring absolute right-1 top-1 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none group-hover:opacity-100 group-[.destructive]:text-[var(--status-danger-ink)] group-[.destructive]:hover:text-[var(--color-destructive-foreground)]',
        props.class
      )
    "
  >
    <X class="h-4 w-4" />
  </ToastClose>
</template>
