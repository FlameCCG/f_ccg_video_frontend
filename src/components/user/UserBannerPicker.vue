<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, ImagePlus, Loader2, Sparkles, UploadCloud } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
  getUserBannerDefaults,
  updateUserConfig,
  uploadUserBanner,
  type UserHomeBannerDefaultsResult,
} from '@/api/user'
import type { BannerItem } from '@/api/banner'
import { getBannerPresetMediaStyle, normalizeBannerUrl } from '@/utils/user-banner-preview'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  preview: [url: string | null]
  saved: [payload: { bannerId: number; bannerUrl: string }]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const activeTab = ref<'default' | 'custom'>('default')
const defaultsResult = ref<UserHomeBannerDefaultsResult | null>(null)
const defaultsLoading = ref(false)
const applyingBannerId = ref<number | null>(null)
const uploadingCustom = ref(false)
const savingCustom = ref(false)
const uploadHintHovered = ref(false)
const pendingCustomBannerUrl = ref('')

const currentPresetBannerId = computed(() => {
  if (!defaultsResult.value) return null

  if (defaultsResult.value.currentBannerId > 0) {
    return defaultsResult.value.currentBannerId
  }

  const matchedPreset = defaultsResult.value.list.find(
    (item) =>
      normalizeBannerUrl(item.cover) ===
      normalizeBannerUrl(defaultsResult.value?.currentBannerImageUrl)
  )

  return matchedPreset?.id ?? null
})

const customBannerPreview = computed(() => {
  if (pendingCustomBannerUrl.value) return pendingCustomBannerUrl.value
  if (defaultsResult.value?.currentBannerId === 0) return defaultsResult.value.currentBannerImageUrl
  return ''
})

const hasPendingCustomUpdate = computed(() => {
  return (
    pendingCustomBannerUrl.value.length > 0 &&
    normalizeBannerUrl(pendingCustomBannerUrl.value) !==
      normalizeBannerUrl(defaultsResult.value?.currentBannerImageUrl)
  )
})

const bannerCards = computed(() => defaultsResult.value?.list ?? [])

const loadBannerDefaults = async () => {
  defaultsLoading.value = true
  try {
    defaultsResult.value = await getUserBannerDefaults()
    if (!pendingCustomBannerUrl.value) {
      activeTab.value = defaultsResult.value.currentBannerId === 0 ? 'custom' : 'default'
    }
  } catch {
    toast.error('获取横幅列表失败')
  } finally {
    defaultsLoading.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      void loadBannerDefaults()
    }
  },
  { immediate: true }
)

const closePanel = () => {
  emit('close')
}

const computeFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const openFilePicker = () => {
  fileInputRef.value?.click()
}

const handleCustomBannerUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const isValidType = ['image/jpeg', 'image/png'].includes(file.type)
  if (!isValidType) {
    toast.error('仅支持 JPG、PNG 格式图片')
    target.value = ''
    return
  }

  uploadingCustom.value = true
  try {
    const fileHash = await computeFileHash(file)
    const result = await uploadUserBanner(fileHash, file)
    pendingCustomBannerUrl.value = result.bannerUrl
    activeTab.value = 'custom'
    emit('preview', result.bannerUrl)
    toast.success('横幅已上传，点击更新后生效')
  } catch {
    toast.error('横幅上传失败')
  } finally {
    uploadingCustom.value = false
    target.value = ''
  }
}

const applyPresetBanner = async (banner: BannerItem) => {
  if (applyingBannerId.value || currentPresetBannerId.value === banner.id) return

  applyingBannerId.value = banner.id
  try {
    await updateUserConfig({ bannerId: banner.id })
    if (defaultsResult.value) {
      defaultsResult.value.currentBannerId = banner.id
      defaultsResult.value.currentBannerImageUrl = banner.cover
    }
    pendingCustomBannerUrl.value = ''
    emit('preview', null)
    emit('saved', { bannerId: banner.id, bannerUrl: banner.cover })
    toast.success('横幅已更新')
  } catch {
    toast.error('横幅更新失败')
  } finally {
    applyingBannerId.value = null
  }
}

const saveCustomBanner = async () => {
  if (!hasPendingCustomUpdate.value || savingCustom.value || !pendingCustomBannerUrl.value) return

  savingCustom.value = true
  try {
    await updateUserConfig({ bannerUrl: pendingCustomBannerUrl.value })
    if (defaultsResult.value) {
      defaultsResult.value.currentBannerId = 0
      defaultsResult.value.currentBannerImageUrl = pendingCustomBannerUrl.value
    }
    emit('saved', { bannerId: 0, bannerUrl: pendingCustomBannerUrl.value })
    emit('preview', null)
    pendingCustomBannerUrl.value = ''
    toast.success('自定义横幅已更新')
  } catch {
    toast.error('横幅更新失败')
  } finally {
    savingCustom.value = false
  }
}

const getPresetTitle = (_banner: BannerItem, index: number) => `系统横幅 ${index + 1}`

const isPresetActive = (banner: BannerItem) => currentPresetBannerId.value === banner.id
</script>

<template>
  <div
    class="flex min-h-[360px] max-h-[82vh] flex-col rounded-[28px] border border-border/70 bg-background/96 text-foreground shadow-[0_28px_80px_-32px_rgba(0,0,0,0.28)] backdrop-blur-xl md:min-h-[420px]"
  >
    <div class="flex items-center justify-between border-b border-border/70 px-6 py-5">
      <div class="flex items-center gap-6">
        <button
          type="button"
          class="relative pb-3 text-sm font-medium transition-colors"
          :class="
            activeTab === 'default' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          "
          @click="activeTab = 'default'"
        >
          默认
          <span
            v-if="activeTab === 'default'"
            class="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary"
          />
        </button>
        <button
          type="button"
          class="relative pb-3 text-sm font-medium transition-colors"
          :class="
            activeTab === 'custom' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          "
          @click="activeTab = 'custom'"
        >
          自定义
          <span
            v-if="activeTab === 'custom'"
            class="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary"
          />
        </button>
      </div>

      <button
        type="button"
        class="rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
        @click="closePanel"
      >
        <span class="sr-only">关闭横幅面板</span>
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div
        v-if="defaultsLoading"
        class="flex h-[260px] items-center justify-center text-sm text-muted-foreground"
      >
        <Loader2 class="mr-2 h-4 w-4 animate-spin" />
        横幅列表加载中...
      </div>

      <template v-else>
        <div v-if="activeTab === 'default'" class="grid grid-cols-3 gap-x-4 gap-y-14 pb-2">
          <div
            v-for="(banner, index) in bannerCards"
            :key="banner.id"
            class="group relative overflow-visible"
          >
            <div
              class="overflow-hidden border bg-card shadow-sm transition duration-300"
              :class="
                isPresetActive(banner)
                  ? 'border-primary shadow-[0_0_0_1px_rgba(34,164,255,0.2)]'
                  : 'border-border/70 group-hover:border-primary/45'
              "
            >
              <img
                :src="banner.cover"
                :alt="getPresetTitle(banner, index)"
                class="aspect-[3.6/1] w-full object-cover"
                :style="getBannerPresetMediaStyle(index)"
              />
            </div>

            <div
              class="absolute inset-x-0 top-full z-20 -mt-px border border-border/80 border-t-0 bg-background/[0.98] p-3 shadow-[0_20px_40px_-28px_rgba(0,0,0,0.35)] transition duration-300"
              :class="
                isPresetActive(banner)
                  ? 'pointer-events-auto translate-y-0 opacity-100'
                  : 'pointer-events-none translate-y-4 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100'
              "
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-[14px] font-semibold text-foreground">
                    {{ getPresetTitle(banner, index) }}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">免费</p>
                </div>

                <button
                  type="button"
                  class="inline-flex min-w-[92px] items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed"
                  :class="
                    isPresetActive(banner)
                      ? 'bg-secondary text-muted-foreground'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  "
                  :disabled="isPresetActive(banner) || applyingBannerId === banner.id"
                  @click="void applyPresetBanner(banner)"
                >
                  <Loader2
                    v-if="applyingBannerId === banner.id"
                    class="mr-2 h-4 w-4 animate-spin"
                  />
                  <Check v-else-if="isPresetActive(banner)" class="mr-2 h-4 w-4" />
                  <span>{{ isPresetActive(banner) ? '已使用' : '使用' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="space-y-5">
          <button
            type="button"
            class="group block w-full rounded-[24px] border border-dashed border-border/80 bg-card/50 p-5 text-left transition hover:border-primary/50 hover:bg-card"
            @mouseenter="uploadHintHovered = true"
            @mouseleave="uploadHintHovered = false"
            @click="openFilePicker"
          >
            <div
              class="flex h-[198px] items-center justify-center overflow-hidden rounded-[20px] border border-border/60 bg-background"
            >
              <img
                v-if="customBannerPreview"
                :src="customBannerPreview"
                alt="自定义横幅预览"
                class="h-full w-full object-cover"
              />
              <div v-else class="flex flex-col items-center gap-3 text-muted-foreground">
                <div class="rounded-full border border-border/70 bg-card p-4">
                  <ImagePlus class="h-9 w-9" />
                </div>
                <div class="space-y-1 text-center">
                  <p class="text-base font-medium text-foreground">自定义头图</p>
                  <p class="text-sm text-muted-foreground">点击上传横幅图片</p>
                </div>
              </div>
            </div>

            <div class="mt-4 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm font-medium text-foreground">
                  {{ customBannerPreview ? '自定义横幅预览' : '上传自定义横幅' }}
                </p>
                <p
                  class="mt-1 text-sm transition-opacity"
                  :class="
                    uploadHintHovered
                      ? 'opacity-100 text-primary'
                      : 'opacity-70 text-muted-foreground'
                  "
                >
                  推荐尺寸为 3840x400，支持 jpg、png 格式图片
                </p>
              </div>

              <div
                class="shrink-0 rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-foreground"
              >
                <span v-if="uploadingCustom" class="inline-flex items-center">
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  上传中...
                </span>
                <span v-else class="inline-flex items-center">
                  <UploadCloud class="mr-2 h-4 w-4 text-primary" />
                  {{ customBannerPreview ? '重新上传' : '选择图片' }}
                </span>
              </div>
            </div>

            <input
              ref="fileInputRef"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              class="hidden"
              @change="void handleCustomBannerUpload($event)"
            />
          </button>

          <div
            v-if="hasPendingCustomUpdate"
            class="sticky bottom-0 flex items-center justify-between rounded-[20px] border border-primary/20 bg-background/[0.96] px-5 py-4 shadow-[0_20px_40px_-32px_rgba(0,0,0,0.35)] backdrop-blur"
          >
            <div class="flex items-center gap-3 text-sm text-muted-foreground">
              <div class="rounded-full bg-primary/10 p-2 text-primary">
                <Sparkles class="h-4 w-4" />
              </div>
              <div>
                <p class="font-medium text-foreground">横幅预览已更新</p>
                <p class="mt-1 text-xs">点击右侧更新后，新的横幅才会持久化保存。</p>
              </div>
            </div>

            <button
              type="button"
              class="inline-flex min-w-[112px] items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="savingCustom"
              @click="void saveCustomBanner()"
            >
              <Loader2 v-if="savingCustom" class="mr-2 h-4 w-4 animate-spin" />
              <span>{{ savingCustom ? '更新中...' : '更新' }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
