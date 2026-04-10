import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 高频播放状态留在 video store，持久化订阅只观察这两个偏好。 */
export const usePlayerPreferencesStore = defineStore(
  'player-preferences',
  () => {
    const volume = ref(0.7)
    const muted = ref(false)
    // 可读取兼容键保存的音量和静音值；主键 hydration 就绪后优先使用主键数据。
    try {
      const legacy = JSON.parse(localStorage.getItem('video') ?? 'null') as {
        playerState?: { volume?: number; muted?: boolean }
      } | null
      const artVolume = localStorage.getItem('artplayer_volume')
      const savedVolume =
        artVolume === null ? (legacy?.playerState?.volume ?? 0.7) : Number(artVolume)
      if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
        volume.value = savedVolume
      }
      if (typeof legacy?.playerState?.muted === 'boolean') muted.value = legacy.playerState.muted
    } catch {
      // 存储不可用或数据损坏时使用默认值。
    }
    return { volume, muted }
  },
  { persist: true }
)
