<!-- 与 index.html 的启动画面共用 public/page-opening.css；此组件不依赖异步素材。 -->
<template>
  <div class="page-opening">
    <div class="page-opening__composition">
      <div class="page-opening__stage" aria-hidden="true">
        <span class="page-opening__orbit page-opening__orbit--outer"></span>
        <span class="page-opening__orbit page-opening__orbit--inner"></span>
        <span class="page-opening__tick page-opening__tick--one"></span>
        <span class="page-opening__tick page-opening__tick--two"></span>
        <div class="page-opening__frames">
          <span class="page-opening__frame page-opening__frame--back"></span>
          <span class="page-opening__frame page-opening__frame--middle"></span>
          <span class="page-opening__frame page-opening__frame--front">
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M18 12.5a2 2 0 0 1 3-1.7l19 11.5a2 2 0 0 1 0 3.4L21 37.2a2 2 0 0 1-3-1.7Z"
                fill="currentColor"
              />
            </svg>
            <i></i><i></i><i></i>
          </span>
        </div>
        <span class="page-opening__spark page-opening__spark--one"></span>
        <span class="page-opening__spark page-opening__spark--two"></span>
      </div>
      <div class="page-opening__identity" aria-hidden="true">
        <span class="page-opening__wordmark">CCG<span>视频</span></span>
        <span class="page-opening__caption">每一帧，都有热爱</span>
      </div>
      <div class="page-opening__status" role="status">
        <span class="page-opening__pulse" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>正在载入你的视界</span>
      </div>
    </div>
  </div>
</template>
