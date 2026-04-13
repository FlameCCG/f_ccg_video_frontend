import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export interface PendingCreatorVideoImport {
  id: string
  file: File
  title: string
  prompt: string
  sourceUrl: string
}

export const useCreatorBridgeStore = defineStore('creatorBridge', () => {
  const pendingVideoImport = shallowRef<PendingCreatorVideoImport | null>(null)

  const setPendingVideoImport = (draft: PendingCreatorVideoImport) => {
    pendingVideoImport.value = draft
  }

  const clearPendingVideoImport = () => {
    pendingVideoImport.value = null
  }

  return {
    pendingVideoImport,
    setPendingVideoImport,
    clearPendingVideoImport,
  }
})
