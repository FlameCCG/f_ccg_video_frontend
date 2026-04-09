<script setup lang="ts">
import { ArrowUpRight, Radio, Play } from 'lucide-vue-next'
</script>

<template>
  <section class="dynamic-intro" aria-label="动态介绍">
    <div class="dynamic-intro__heading">
      <Radio :size="16" aria-hidden="true" /><span>动态</span
      ><span class="dynamic-intro__caption">关注 · 相遇</span>
    </div>
    <h2>喜欢的创作，<br />不再错过。</h2>
    <p>关注 UP 主，让每一次更新<br />都与你相遇。</p>
    <div class="dynamic-intro__art" aria-hidden="true">
      <div class="dynamic-intro__sheet dynamic-intro__sheet--back"></div>
      <div class="dynamic-intro__sheet">
        <span class="dynamic-intro__avatar"></span
        ><span class="dynamic-intro__lines"><i></i><i></i></span><Play :size="15" />
      </div>
    </div>
    <RouterLink to="/" class="dynamic-intro__link"
      >去首页发现精彩<ArrowUpRight :size="14" aria-hidden="true"
    /></RouterLink>
  </section>
</template>

<style scoped lang="scss">
.dynamic-intro {
  position: relative;
  padding: 20px;
  overflow: hidden;
  background: color-mix(in oklch, var(--color-primary) 5%, var(--color-card));
  border: 1px solid color-mix(in oklch, var(--color-primary) 16%, var(--color-border));
  border-radius: 16px;
}
.dynamic-intro__heading {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
}
.dynamic-intro__caption {
  margin-left: auto;
  font-size: 10px;
  font-weight: 400;
  color: var(--color-muted-foreground);
}
.dynamic-intro h2 {
  margin: 22px 0 10px;
  font-size: 23px;
  font-weight: 650;
  line-height: 1.5;
  letter-spacing: 0.025em;
  color: var(--color-foreground);
}
.dynamic-intro p {
  font-size: 12px;
  line-height: 1.85;
  color: var(--color-muted-foreground);
}
.dynamic-intro__art {
  position: relative;
  height: 76px;
  margin-top: 17px;
}
.dynamic-intro__sheet {
  position: absolute;
  inset: 13px 1px 10px;
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  color: var(--color-primary);
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transform: rotate(-3deg);
  transition: transform 360ms var(--ease-out-expo);
}
.dynamic-intro__sheet--back {
  inset: 6px 7px 17px;
  background: var(--color-secondary);
  transform: rotate(4deg);
}
.dynamic-intro:hover .dynamic-intro__sheet {
  transform: translateY(-2px) rotate(-1deg);
}
.dynamic-intro:hover .dynamic-intro__sheet--back {
  transform: translateY(-4px) rotate(5deg);
}
.dynamic-intro__avatar {
  width: 24px;
  height: 24px;
  background: color-mix(in oklch, var(--color-primary) 16%, var(--color-secondary));
  border: 4px solid var(--color-secondary);
  border-radius: 50%;
}
.dynamic-intro__lines {
  display: grid;
  flex: 1;
  gap: 7px;
}
.dynamic-intro__lines i {
  width: 80%;
  height: 4px;
  background: var(--color-border);
  border-radius: 4px;
}
.dynamic-intro__lines i:last-child {
  width: 52%;
  opacity: 0.6;
}
.dynamic-intro__link {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--color-muted-foreground);
}
.dynamic-intro__link:hover {
  color: var(--color-primary);
}

@media (prefers-reduced-motion: reduce) {
  .dynamic-intro__sheet {
    transition: none;
  }
  .dynamic-intro:hover .dynamic-intro__sheet {
    transform: rotate(-3deg);
  }
  .dynamic-intro:hover .dynamic-intro__sheet--back {
    transform: rotate(4deg);
  }
}
</style>
