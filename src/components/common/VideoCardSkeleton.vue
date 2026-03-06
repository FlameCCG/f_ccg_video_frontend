<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  variant?: 'default' | 'compact'
}

withDefaults(defineProps<Props>(), {
  variant: 'default',
})
</script>

<template>
  <div class="overflow-hidden rounded-lg bg-card">
    <!-- Cover Skeleton -->
    <Skeleton class="aspect-video w-full" />

    <!-- Info Skeleton -->
    <div :class="[variant === 'compact' ? 'p-1.5' : 'p-3']">
      <!-- Title Skeleton -->
      <Skeleton :class="[variant === 'compact' ? 'mb-1 h-3' : 'mb-2 h-4']" class="w-full" />
      <Skeleton v-if="variant === 'default'" class="mb-2 h-4 w-3/4" />

      <!-- Author Skeleton (default only) -->
      <div v-if="variant === 'default'" class="mb-2 flex items-center gap-2">
        <Skeleton class="h-5 w-5 rounded-full" />
        <Skeleton class="h-3 w-20" />
      </div>

      <!-- Stats Skeleton (default only) -->
      <div v-if="variant === 'default'" class="flex items-center gap-3">
        <Skeleton class="h-3 w-12" />
        <Skeleton class="h-3 w-12" />
      </div>
    </div>
  </div>
</template>
