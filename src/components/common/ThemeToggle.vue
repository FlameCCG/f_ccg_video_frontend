<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" class="h-9 w-9">
        <Sun class="theme-toggle-sun h-5 w-5" aria-hidden="true" />
        <Moon class="theme-toggle-moon absolute h-5 w-5" aria-hidden="true" />
        <span class="sr-only">切换主题</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="themeStore.setTheme('light')"> 亮色 </DropdownMenuItem>
      <DropdownMenuItem @select="themeStore.setTheme('dark')"> 暗色 </DropdownMenuItem>
      <DropdownMenuItem @select="themeStore.setTheme('system')"> 跟随系统 </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<style scoped lang="scss">
/* 依赖 html.dark 换图标，不用 dark: 工具类 */

/* 只过渡 transform：原来写的是 transition-all，会把 color/opacity 一起插值，
   而这两个图标是靠 rotate+scale 互相交接的，其余属性变化只是噪声。 */
.theme-toggle-sun,
.theme-toggle-moon {
  transition: transform var(--duration-normal) var(--ease-out-expo);
}

.theme-toggle-sun {
  transform: rotate(0) scale(1);
}

.theme-toggle-moon {
  transform: rotate(90deg) scale(0);
}

:global(html.dark) .theme-toggle-sun {
  transform: rotate(-90deg) scale(0);
}

:global(html.dark) .theme-toggle-moon {
  transform: rotate(0) scale(1);
}
</style>
