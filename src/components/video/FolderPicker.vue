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
            <div v-if="showCreateInput" class="folder-create-slide">
              <div class="folder-create-form">
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
            </div>
          </Transition>

          <button v-if="!showCreateInput" class="folder-create-btn" @click="startCreate">
            <Plus :size="16" />
            <span>新建收藏夹</span>
          </button>
        </div>

        <!-- Confirm Button -->
        <div class="folder-dialog-footer">
          <button
            class="folder-cancel-btn ui-button"
            type="button"
            @click="handleOpenChange(false)"
          >
            取消
          </button>
          <button
            class="folder-confirm-btn ui-button"
            type="button"
            :disabled="isSubmitting"
            @click="handleConfirm"
          >
            <Loader2 v-if="isSubmitting" :size="14" class="mr-1.5 animate-spin" />
            {{ isSubmitting ? '保存中...' : '确定' }}
          </button>
        </div>
      </template>
    </DialogContent>
  </Dialog>
</template>

<style scoped lang="scss">
.folder-dialog-content {
  max-width: 420px;
  padding: 0;
  gap: 0;
  overflow: hidden;
}

.folder-dialog-header {
  padding: 18px 24px 14px;
  border-bottom: 1px solid oklch(var(--border));
}

.folder-dialog-title {
  font-size: 1rem;
  font-weight: 600;
  text-align: center;
  color: oklch(var(--foreground));
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
  transition: background-color var(--duration-fast) var(--ease-out-quart);
  background: transparent;
  border: none;
  text-align: left;

  &:hover {
    background: oklch(var(--muted) / 0.5);
  }
}

.folder-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid oklch(var(--muted-foreground) / 0.3);
  flex-shrink: 0;
  transition:
    background-color var(--duration-fast) var(--ease-out-expo),
    border-color var(--duration-fast) var(--ease-out-expo),
    transform var(--duration-fast) var(--ease-out-quint);

  &.is-checked {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
  }
}

.folder-row:active .folder-checkbox {
  transform: scale(0.9);
}

.check-icon {
  color: var(--color-primary-foreground);
}

.folder-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: oklch(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-count {
  flex-shrink: 0;
  font-size: var(--text-sm-plus, 0.8125rem);
  color: oklch(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

.folder-create-area {
  padding: 4px 24px 8px;
  border-top: 1px solid oklch(var(--border) / 0.5);
}

.folder-create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  font-size: 14px;
  color: oklch(var(--muted-foreground));
  background: none;
  border: none;
  cursor: pointer;
  transition: color var(--duration-fast) linear;
  width: 100%;

  &:hover {
    color: var(--color-primary);
  }
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
  border: 1px solid oklch(var(--border));
  border-radius: var(--radius-sm, 0.375rem);
  font-size: var(--text-sm-plus, 0.8125rem);
  color: oklch(var(--foreground));
  background: oklch(var(--background));
  transition: border-color var(--duration-fast) var(--ease-out-quart);

  &:focus {
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: oklch(var(--muted-foreground) / 0.6);
  }
}

.folder-create-confirm {
  height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-sm, 0.375rem);
  font-size: var(--text-sm-plus, 0.8125rem);
  font-weight: 500;
  color: var(--color-primary-foreground);
  background-color: var(--color-primary);
  border: none;
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quint);
  white-space: nowrap;

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:hover:not(:disabled) {
    background: oklch(from var(--color-primary) calc(l - 0.05) c h);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.folder-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px 18px;
  border-top: 1px solid var(--color-border);
}

/* 次要动作：有边框但不抢主按钮 */
.folder-cancel-btn {
  padding: 8px 18px;
  color: var(--color-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;

  &:hover {
    background: color-mix(in oklch, var(--color-foreground) 6%, transparent);
  }
}

/* 主确认动作。原来是「透明底 + 无边框 + 品牌色文字 + 居中」，
   渲染出来跟一条超链接没有区别，完全读不出这是本弹窗的主按钮。 */
.folder-confirm-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 88px;
  padding: 8px 22px;
  color: var(--color-primary-foreground);
  font-size: 0.875rem;
  font-weight: 500;
  background: var(--color-primary);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-surface);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-out-quart),
    opacity var(--duration-fast) linear,
    transform var(--duration-fast) var(--ease-out-quint);

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:hover:not(:disabled) {
    background: color-mix(in oklch, var(--color-primary) 88%, var(--color-foreground));
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

/* 展开/收起：grid-template-rows 0fr→1fr。
   原实现过渡 max-height（布局属性，每帧触发 layout + 重排整个弹层），
   而且 60px 是写死的魔数 —— 内容超过 60px 时展开会被直接裁掉。 */
.folder-create-slide {
  display: grid;
  grid-template-rows: 1fr;

  > * {
    min-height: 0;
    overflow: hidden;
  }
}

.create-slide-enter-active,
.create-slide-leave-active {
  transition:
    grid-template-rows var(--duration-normal) var(--ease-out-expo),
    opacity var(--duration-fast) linear;
}

.create-slide-enter-from,
.create-slide-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.create-slide-enter-to,
.create-slide-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
}
</style>
