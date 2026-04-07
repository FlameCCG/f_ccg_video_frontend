import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { runThemeTransition, type ThemeTransitionOrigin } from '@/utils/theme-transition'

export type Theme = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore(
  'theme',
  () => {
    const theme = ref<Theme>('dark')
    const isDark = ref(false)
    let targetTheme: Theme | undefined
    let pendingTheme: Theme | undefined
    let pendingOrigin: ThemeTransitionOrigin | undefined
    let switching = false

    const resolveDark = (value: Theme) =>
      value === 'dark' ||
      (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    const applyTheme = (newTheme: Theme) => {
      const root = document.documentElement
      isDark.value = resolveDark(newTheme)
      root.classList.toggle('dark', isDark.value)
    }

    const flushThemeChanges = async () => {
      switching = true
      try {
        // 连点只保留最后一次意图，不中断正在展开的快照，也不堆积整串动画。
        while (pendingTheme) {
          const nextTheme = pendingTheme
          const origin = pendingOrigin
          pendingTheme = undefined
          pendingOrigin = undefined
          const update = () => {
            theme.value = nextTheme
            applyTheme(nextTheme)
          }

          if (resolveDark(nextTheme) === isDark.value) update()
          else await runThemeTransition(update, origin)
        }
      } finally {
        switching = false
        targetTheme = undefined
      }
    }

    const setTheme = (newTheme: Theme, origin?: ThemeTransitionOrigin) => {
      targetTheme = newTheme
      pendingTheme = newTheme
      pendingOrigin = origin
      if (!switching) void flushThemeChanges()
    }

    const toggleTheme = (origin?: ThemeTransitionOrigin) => {
      const newTheme = resolveDark(targetTheme ?? theme.value) ? 'light' : 'dark'
      setTheme(newTheme, origin)
    }

    // Watch for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (theme.value === 'system') {
        setTheme('system')
      }
    })

    // Apply theme on store initialization
    watch(
      theme,
      (newTheme) => {
        applyTheme(newTheme)
      },
      { immediate: true, flush: 'sync' }
    )

    return {
      theme,
      isDark,
      setTheme,
      toggleTheme,
    }
  },
  {
    persist: { pick: ['theme'] },
  }
)
