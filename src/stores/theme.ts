import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type Theme = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore(
  'theme',
  () => {
    const theme = ref<Theme>('dark')

    const applyTheme = (newTheme: Theme) => {
      const root = document.documentElement
      const isDark =
        newTheme === 'dark' ||
        (newTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

      root.classList.toggle('dark', isDark)
    }

    const setTheme = (newTheme: Theme) => {
      theme.value = newTheme
      applyTheme(newTheme)
    }

    const toggleTheme = () => {
      const newTheme = theme.value === 'dark' ? 'light' : 'dark'
      setTheme(newTheme)
    }

    // Watch for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme('system')
      }
    })

    // Apply theme on store initialization
    watch(
      theme,
      (newTheme) => {
        applyTheme(newTheme)
      },
      { immediate: true }
    )

    return {
      theme,
      setTheme,
      toggleTheme,
    }
  },
  {
    persist: true,
  }
)
