<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import {
  getFolderList,
  getFolderVideos,
  createFolder,
  toggleVideoFavorite,
  type FolderItem,
} from '@/api/video'
import { useVideoStore } from '@/stores/video'
import { Dialog, DialogContent, DialogTitle, DialogHeader } from '@/components/ui/dialog'
import { Plus, Loader2, Check } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  videoId: number
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  done: []
}>()

const videoStore = useVideoStore()

const folders = ref<FolderItem[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const selectedFolderIds = ref<Set<number>>(new Set())
const initialFolderIds = ref<Set<number>>(new Set())
const isSubmitting = ref(false)

// 新建收藏夹
const showCreateInput = ref(false)
const newFolderName = ref('')
const isCreating = ref(false)

const MAX_FOLDER_VIDEOS = 1000

const loadFolders = async () => {
  isLoading.value = true
  error.value = null
  try {
    const result = await getFolderList(props.videoId)
    folders.value = result.list

    // 检查后端是否已返回 isFavorited 字段
    const hasIsFavorited = result.list.some((f) => 'isFavorited' in f)

    const ids = new Set<number>()

    if (hasIsFavorited) {
      // 后端已支持：直接使用 isFavorited
      for (const f of result.list) {
        if (f.isFavorited) ids.add(f.id)
      }
    } else {
      // 后端暂未支持：查询各收藏夹视频列表来判断
      const checks = await Promise.all(
        result.list.map(async (f) => {
          try {
            const videos = await getFolderVideos({
              folderId: f.id,
              page: 1,
              pageSize: 50,
            })
            const found = videos.list.some((v) => v.id === props.videoId)
            return { folderId: f.id, found }
          } catch {
            return { folderId: f.id, found: false }
          }
        })
      )
      for (const c of checks) {
        if (c.found) ids.add(c.folderId)
      }
    }

    selectedFolderIds.value = ids
    initialFolderIds.value = new Set(ids)
  } catch {
    error.value = '加载收藏夹失败'
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      void loadFolders()
      // 重置新建状态
      showCreateInput.value = false
      newFolderName.value = ''
    }
  }
)

const toggleFolder = (folderId: number) => {
  const next = new Set(selectedFolderIds.value)
  if (next.has(folderId)) {
    next.delete(folderId)
  } else {
    next.add(folderId)
  }
  selectedFolderIds.value = next
}

const handleConfirm = async () => {
  const added = [...selectedFolderIds.value].filter((id) => !initialFolderIds.value.has(id))
  const removed = [...initialFolderIds.value].filter((id) => !selectedFolderIds.value.has(id))

  if (added.length === 0 && removed.length === 0) {
    emit('update:open', false)
    return
  }

  isSubmitting.value = true
  try {
    // 并行处理新增和移除
    const tasks = [
      ...added.map((folderId) => toggleVideoFavorite({ videoId: props.videoId, folderId })),
      ...removed.map((folderId) => toggleVideoFavorite({ videoId: props.videoId, folderId })),
    ]
    await Promise.all(tasks)

    // 同步 store 的 isFavorited 状态
    const wasFavorited = initialFolderIds.value.size > 0
    const nowFavorited = selectedFolderIds.value.size > 0
    videoStore.interactionState.isFavorited = nowFavorited
    // favoriteCount 只在首次收藏 +1 或完全取消收藏 -1
    if (videoStore.currentVideo) {
      if (!wasFavorited && nowFavorited) {
        videoStore.currentVideo.favoriteCount += 1
      } else if (wasFavorited && !nowFavorited) {
        videoStore.currentVideo.favoriteCount -= 1
      }
    }

    toast.success('收藏夹已更新')
    emit('done')
    emit('update:open', false)
  } catch {
    toast.error('操作失败，请重试')
  } finally {
    isSubmitting.value = false
  }
}

const handleCreateFolder = async () => {
  const name = newFolderName.value.trim()
  if (!name) return

  isCreating.value = true
  try {
    const newFolder = await createFolder({ name })
    folders.value.push(newFolder)
    // 新建的收藏夹自动选中
    const next = new Set(selectedFolderIds.value)
    next.add(newFolder.id)
    selectedFolderIds.value = next
    newFolderName.value = ''
    showCreateInput.value = false
    toast.success('收藏夹创建成功')
  } catch {
    toast.error('创建收藏夹失败')
  } finally {
    isCreating.value = false
  }
}

const startCreate = () => {
  showCreateInput.value = true
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.folder-create-input')
    input?.focus()
  })
}

const handleOpenChange = (val: boolean) => {
  emit('update:open', val)
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="folder-dialog-content">
      <DialogHeader class="folder-dialog-header">
        <DialogTitle class="folder-dialog-title">添加到收藏夹</DialogTitle>
      </DialogHeader>

      <!-- Loading -->
      <div v-if="isLoading" class="flex items-center justify-center py-10">
        <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="py-8 text-center text-sm text-muted-foreground">
        {{ error }}
      </div>

      <!-- Folder List -->
      <template v-else>
        <div class="folder-list">
          <button
            v-for="folder in folders"
            :key="folder.id"
            class="folder-row"
            @click="toggleFolder(folder.id)"
          >
            <span
              class="folder-checkbox"
              :class="{ 'is-checked': selectedFolderIds.has(folder.id) }"
            >
              <Check v-if="selectedFolderIds.has(folder.id)" :size="12" class="check-icon" />
            </span>
            <span class="folder-name">{{ folder.isDefault ? '默认收藏夹' : folder.name }}</span>
            <span class="folder-count">{{ folder.videoCount }}/{{ MAX_FOLDER_VIDEOS }}</span>
          </button>
        </div>

        <!-- Create Folder -->
        <div class="folder-create-area">
          <Transition name="create-slide">
            <div v-if="showCreateInput" class="folder-create-form">
              <input
                v-model="newFolderName"
                class="folder-create-input"
                placeholder="输入收藏夹名称"
                maxlength="20"
                @keydown.enter="handleCreateFolder"
              />
              <button
                class="folder-create-confirm"
                :disabled="!newFolderName.trim() || isCreating"
                @click="handleCreateFolder"
              >
                <Loader2 v-if="isCreating" :size="14" class="animate-spin" />
                <template v-else>创建</template>
              </button>
            </div>
          </Transition>

          <button v-if="!showCreateInput" class="folder-create-btn" @click="startCreate">
            <Plus :size="16" />
            <span>新建收藏夹</span>
          </button>
        </div>

        <!-- Confirm Button -->
        <div class="folder-dialog-footer">
          <button class="folder-confirm-btn" :disabled="isSubmitting" @click="handleConfirm">
            <Loader2 v-if="isSubmitting" :size="14" class="mr-1.5 animate-spin" />
            {{ isSubmitting ? '保存中...' : '确定' }}
          </button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.folder-dialog-content {
  max-width: 420px;
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.folder-dialog-header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid hsl(var(--border));
}

.folder-dialog-title {
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: hsl(var(--foreground));
}

.folder-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px 0;
}

.folder-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 24px;
  cursor: pointer;
  transition: background 0.15s ease;
  background: transparent;
  border: none;
  text-align: left;
}

.folder-row:hover {
  background: hsl(var(--muted) / 0.5);
}

.folder-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid hsl(var(--muted-foreground) / 0.3);
  flex-shrink: 0;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.folder-checkbox.is-checked {
  background: #00a1d6;
  border-color: #00a1d6;
}

.check-icon {
  color: #fff;
}

.folder-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  flex-shrink: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.folder-create-area {
  padding: 4px 24px 8px;
  border-top: 1px solid hsl(var(--border) / 0.5);
}

.folder-create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;
  width: 100%;
}

.folder-create-btn:hover {
  color: #00a1d6;
}

.folder-create-form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.folder-create-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  font-size: 13px;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  outline: none;
  transition: border-color 0.2s ease;
}

.folder-create-input:focus {
  border-color: #00a1d6;
}

.folder-create-input::placeholder {
  color: hsl(var(--muted-foreground) / 0.6);
}

.folder-create-confirm {
  height: 36px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: #00a1d6;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.folder-create-confirm:hover:not(:disabled) {
  background: #0090c1;
}

.folder-create-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.folder-dialog-footer {
  padding: 12px 24px 18px;
  display: flex;
  justify-content: center;
}

.folder-confirm-btn {
  padding: 8px 48px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #00a1d6;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}

.folder-confirm-btn:hover:not(:disabled) {
  background: hsl(var(--muted) / 0.5);
}

.folder-confirm-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Create input slide transition */
.create-slide-enter-active,
.create-slide-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.create-slide-enter-from,
.create-slide-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}

.create-slide-enter-to,
.create-slide-leave-from {
  opacity: 1;
  max-height: 60px;
}
</style>
