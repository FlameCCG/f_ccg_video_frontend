<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    src?: string | null
    name?: string | null
    alt?: string
    fallback?: string
    containerClass?: string
    imageClass?: string
    textClass?: string
  }>(),
  {
    alt: 'avatar',
    fallback: 'U',
    containerClass: '',
    imageClass: 'h-full w-full object-cover',
    textClass: 'text-sm font-semibold',
  }
)

const imageFailed = ref(false)

watch(
  () => props.src,
  () => {
    imageFailed.value = false
  }
)

const normalizedSrc = computed(() => {
  const candidate = props.src?.trim() ?? ''
  return /^(null|undefined)$/i.test(candidate) ? '' : candidate
})

const showImage = computed(() => normalizedSrc.value.length > 0 && !imageFailed.value)

const displayInitial = computed(() => {
  const source = props.name?.trim()
  if (!source) return props.fallback

  const firstChar = Array.from(source)[0] ?? props.fallback
  return /^[a-z]$/i.test(firstChar) ? firstChar.toUpperCase() : firstChar
})

const handleError = () => {
  imageFailed.value = true
}
</script>

<template>
  <div
    :class="[
      'inline-flex select-none items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary',
      containerClass,
    ]"
  >
    <img
      v-if="showImage"
      :src="normalizedSrc"
      :alt="alt"
      :class="imageClass"
      @error="handleError"
    />
    <span v-else :class="['pointer-events-none leading-none', textClass]">
      {{ displayInitial }}
    </span>
  </div>
</template>
