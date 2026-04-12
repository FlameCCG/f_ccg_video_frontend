<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <!-- A single folded ribbon: a quiet, open counter at the centre. -->
    <path
      d="M5.5 25 13.1 7.2C14.2 4.6 17.8 4.6 18.9 7.2L26.5 25H22.1L16 10.2 9.9 25H5.5Z"
      fill="currentColor"
    />
    <path d="m12.1 18.2 10 6.8h-7.2l-4.3-3 1.5-3.8Z" fill="currentColor" opacity=".48" />
  </svg>
</template>
