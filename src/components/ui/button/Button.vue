<script setup lang="ts">
import type { HTMLAttributes, ButtonHTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { cn } from '@/lib/utils'
import { buttonVariants } from '.'

interface Props {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  type?: ButtonHTMLAttributes['type']
  disabled?: boolean
  asChild?: boolean
}

withDefaults(defineProps<Props>(), {
  type: 'button',
  asChild: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const handleClick = (event: MouseEvent) => {
  emit('click', event)
}
</script>

<template>
  <component
    :is="asChild ? 'slot' : 'button'"
    :class="cn(buttonVariants({ variant, size }), $props.class)"
    :type="asChild ? undefined : type"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot />
  </component>
</template>
