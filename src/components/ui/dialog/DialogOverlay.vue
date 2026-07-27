<script setup lang="ts">
import { DialogOverlay, type DialogOverlayProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogOverlayProps & { class?: string }>()
</script>

<template>
  <DialogOverlay :class="cn('motion-overlay overlay-scrim fixed inset-0 z-[99999]', props.class)" />
</template>
