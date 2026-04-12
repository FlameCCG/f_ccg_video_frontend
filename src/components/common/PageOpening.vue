<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { resumeOpeningMotion } from '@/utils/openingMotion'

const opening = ref<HTMLElement | null>(null)

onMounted(() => {
  if (opening.value) resumeOpeningMotion(opening.value)
})
</script>

<!-- 与 index.html 共用结构和样式，动画在 Vue 接管时延续播放进度。 -->
<template>
  <div ref="opening" class="page-opening">
    <div class="page-opening__composition">
      <div class="page-opening__stage" aria-hidden="true">
        <svg class="page-opening__viewfinder" viewBox="0 0 336 224" fill="none">
          <path
            d="M25 1H9a8 8 0 0 0-8 8v16M311 1h16a8 8 0 0 1 8 8v16M335 199v16a8 8 0 0 1-8 8h-16M25 223H9a8 8 0 0 1-8-8v-16"
            stroke="currentColor"
            stroke-linecap="round"
          />
        </svg>
        <div class="page-opening__frames">
          <span class="page-opening__frame page-opening__frame--back"></span>
          <span class="page-opening__frame page-opening__frame--middle"></span>
          <span class="page-opening__frame page-opening__frame--front">
            <span class="page-opening__perforations page-opening__perforations--left"></span>
            <span class="page-opening__perforations page-opening__perforations--right"></span>
            <span class="page-opening__screen">
              <span class="page-opening__play">
                <svg viewBox="0 0 40 40" fill="none">
                  <path
                    d="M13 10.5c0-1.6 1.7-2.6 3.1-1.8l15 9.5c1.3.8 1.3 2.8 0 3.6l-15 9.5c-1.4.8-3.1-.2-3.1-1.8Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
            </span>
          </span>
        </div>
      </div>
      <div class="page-opening__identity" aria-hidden="true">
        <span class="page-opening__wordmark">CCG<span>视频</span></span>
        <span class="page-opening__caption">每一帧，都有热爱</span>
      </div>
      <div class="page-opening__status" role="status" aria-live="polite" aria-atomic="true">
        <span class="page-opening__track" aria-hidden="true"></span>
        <span class="page-opening__status-label">
          <span class="page-opening__equalizer" aria-hidden="true"> <i></i><i></i><i></i> </span>
          正在载入你的视界
        </span>
      </div>
    </div>
  </div>
</template>
