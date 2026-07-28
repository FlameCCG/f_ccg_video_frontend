<script setup lang="ts">
import type { HTMLAttributes, ButtonHTMLAttributes } from 'vue'
import type { ButtonVariants } from '.'
import { Primitive } from 'reka-ui'
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
  <Primitive
    :as="asChild ? 'div' : 'button'"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), $props.class)"
    v-bind="{
      type: asChild ? undefined : type,
      disabled,
      onClick: handleClick,
    }"
  >
    <slot />
  </Primitive>
</template>
