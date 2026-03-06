import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore(
  'app',
  () => {
    const sidebarCollapsed = ref(false)
    const sidebarOpen = ref(false) // For mobile

    const toggleSidebar = () => {
      sidebarCollapsed.value = !sidebarCollapsed.value
    }

    const toggleMobileSidebar = () => {
      sidebarOpen.value = !sidebarOpen.value
    }

    const closeMobileSidebar = () => {
      sidebarOpen.value = false
    }

    const setSidebarCollapsed = (value: boolean) => {
      sidebarCollapsed.value = value
    }

    return {
      sidebarCollapsed,
      sidebarOpen,
      toggleSidebar,
      toggleMobileSidebar,
      closeMobileSidebar,
      setSidebarCollapsed,
    }
  },
  {
    persist: {
      pick: ['sidebarCollapsed'],
    },
  }
)
