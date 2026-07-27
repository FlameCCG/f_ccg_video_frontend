<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { getMentionSuggest, type MentionUser } from '@/api/user'
import EmojiPicker from '@/components/common/EmojiPicker.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { Smile, AtSign, ImagePlus, X, Loader2 } from 'lucide-vue-next'
import { useDebounceFn, onClickOutside } from '@vueuse/core'
import { uploadImage } from '@/api/upload'
import { toast } from 'vue-sonner'

const props = defineProps<{
  placeholder?: string
  autoFocus?: boolean
  replyTo?: string
}>()

const emit = defineEmits<{
  (e: 'submit', content: string, atUserIds: number[], pictures: string[]): void
}>()

const authStore = useAuthStore()
const content = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// Mentions
const showMention = ref(false)
const mentionKeyword = ref('')
const mentionUsers = ref<MentionUser[]>([])
const atUserIds = ref<Set<number>>(new Set())
const mentionCursorPos = ref(0)

// Emoji & Pictures
const showEmoji = ref(false)
const emojiPickerRef = ref<HTMLElement | null>(null)
const pictures = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

onClickOutside(emojiPickerRef, () => {
  showEmoji.value = false
})

const fetchMentions = useDebounceFn(async (keyword: string) => {
  try {
    const res = await getMentionSuggest({ keyword, page: 1, pageSize: 10 })
    mentionUsers.value = res.list
  } catch (error) {
    console.error('Failed to fetch mentions', error)
  }
}, 300)

const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  const val = target.value
  const pos = target.selectionStart

  if (showMention.value) {
    // Check if the '@' is still there
    if (pos < mentionCursorPos.value || val[mentionCursorPos.value - 1] !== '@') {
      showMention.value = false
    } else {
      const textAfterAt = val.slice(mentionCursorPos.value, pos)
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
        showMention.value = false
      } else {
        mentionKeyword.value = textAfterAt
        void fetchMentions(textAfterAt)
      }
    }
  }

  // We might have just typed '@'
  if (!showMention.value) {
    const lastChar = val.slice(pos - 1, pos)
    if (lastChar === '@') {
      showMention.value = true
      mentionKeyword.value = ''
      mentionCursorPos.value = pos
      void fetchMentions('')
    }
  }
}

const selectMention = (user: MentionUser) => {
  const before = content.value.slice(0, mentionCursorPos.value)
  const after = content.value.slice(textareaRef.value?.selectionStart || content.value.length)
  content.value = `${before}${user.username} ${after}`
  atUserIds.value.add(user.id)
  showMention.value = false

  void nextTick(() => {
    if (textareaRef.value) {
      const newPos = mentionCursorPos.value + user.username.length + 1
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newPos, newPos)
    }
  })
}

const handleEmojiSelect = (emoji: string) => {
  const pos = textareaRef.value?.selectionStart || content.value.length
  const before = content.value.slice(0, pos)
  const after = content.value.slice(pos)
  content.value = `${before}${emoji}${after}`
  showEmoji.value = false

  void nextTick(() => {
    if (textareaRef.value) {
      const newPos = pos + emoji.length
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(newPos, newPos)
    }
  })
}

const handleStickerSelect = (stickerUrl: string) => {
  if (pictures.value.length >= 9) {
    toast.error('最多只能发送9张图片')
    return
  }
  pictures.value.push(stickerUrl)
  showEmoji.value = false
}

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = ''

  if (!files.length) return
  if (pictures.value.length + files.length > 9) {
    toast.error('最多只能上传9张图片')
    return
  }

  isUploading.value = true
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error('请选择图片文件')
        continue
      }

      const buffer = await file.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const fileHash = Array.from(new Uint8Array(hashBuffer))
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('')

      const res = await uploadImage(fileHash, file)
      pictures.value.push(res.imageUrl)
    }
  } catch (error) {
    console.error('Failed to upload image', error)
    toast.error('上传图片失败')
  } finally {
    isUploading.value = false
  }
}

const removePicture = (index: number) => {
  pictures.value.splice(index, 1)
}

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleSubmit = () => {
  if ((!content.value.trim() && pictures.value.length === 0) || !authStore.isLoggedIn) return
  emit('submit', content.value, Array.from(atUserIds.value), [...pictures.value])
  content.value = ''
  atUserIds.value.clear()
  pictures.value = []
}

const handleAtClick = () => {
  const pos = textareaRef.value?.selectionStart || content.value.length
  const before = content.value.slice(0, pos)
  const after = content.value.slice(pos)
  content.value = `${before}@${after}`

  void nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      textareaRef.value.setSelectionRange(pos + 1, pos + 1)
      showMention.value = true
      mentionKeyword.value = ''
      mentionCursorPos.value = pos + 1
      void fetchMentions('')
    }
  })
}

onMounted(() => {
  if (props.autoFocus && textareaRef.value) {
    textareaRef.value.focus()
  }
})
</script>

<template>
  <div class="flex gap-4">
    <div class="shrink-0">
      <AppAvatar
        v-if="authStore.isLoggedIn"
        :src="authStore.user?.avatar"
        :name="authStore.user?.username"
        alt="avatar"
        container-class="h-10 w-10"
        text-class="text-sm font-semibold"
      />
      <div
        v-else
        class="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-xs text-muted-foreground/80"
      >
        登录
      </div>
    </div>

    <div class="relative flex-1">
      <textarea
        ref="textareaRef"
        v-model="content"
        class="min-h-[64px] w-full resize-none rounded-md border border-border bg-secondary px-3 py-2 text-sm transition-colors focus:border-primary focus:bg-card focus:outline-none"
        :placeholder="
          placeholder || (authStore.isLoggedIn ? '发一条友善的评论' : '请先登录后发表评论')
        "
        :disabled="!authStore.isLoggedIn"
        @input="handleInput"
        @keydown.enter.prevent="handleSubmit"
      ></textarea>

      <!-- Pictures Preview -->
      <div v-if="pictures.length > 0" class="mt-2 flex flex-wrap gap-2">
        <div
          v-for="(pic, idx) in pictures"
          :key="idx"
          class="group relative h-16 w-16 overflow-hidden rounded-md border border-border"
        >
          <img :src="pic" class="h-full w-full object-cover" />
          <button
            class="media-chip focus-ring absolute right-1 top-1 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            @click="removePicture(idx)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>

      <!-- Mention Dropdown -->
      <div
        v-if="showMention && mentionUsers.length > 0"
        class="absolute left-0 top-full z-50 mt-1 w-[240px] rounded-lg border border-border bg-card shadow-[0_4px_12px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        <div class="px-4 py-2 text-xs text-muted-foreground/80 border-b border-border/50 bg-card">
          选择或输入你想@的人
        </div>
        <div class="max-h-[240px] overflow-y-auto py-1">
          <button
            v-for="user in mentionUsers"
            :key="user.id"
            class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-secondary transition-colors"
            @click="selectMention(user)"
          >
            <AppAvatar
              :src="user.avatar"
              :name="user.username"
              container-class="h-8 w-8 shrink-0"
              text-class="text-xs font-semibold"
            />
            <div class="flex flex-col overflow-hidden">
              <span class="truncate text-sm text-foreground">{{ user.username }}</span>
              <span class="truncate text-xs text-muted-foreground/80"
                >{{ user.followerCount }}粉丝</span
              >
            </div>
          </button>
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between">
        <div class="flex items-center gap-2 relative">
          <div ref="emojiPickerRef">
            <button
              class="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
              :disabled="!authStore.isLoggedIn"
              @click="showEmoji = !showEmoji"
            >
              <Smile :size="16" />
              <span>表情</span>
            </button>
            <div v-if="showEmoji" class="absolute left-0 top-full z-50 mt-1">
              <EmojiPicker @select="handleEmojiSelect" @select-sticker="handleStickerSelect" />
            </div>
          </div>

          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
            :disabled="!authStore.isLoggedIn"
            @click="handleAtClick"
          >
            <AtSign :size="16" />
          </button>

          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
            :disabled="!authStore.isLoggedIn || isUploading || pictures.length >= 9"
            @click="triggerFileInput"
          >
            <Loader2 v-if="isUploading" class="h-4 w-4 animate-spin" />
            <ImagePlus v-else :size="16" />
            <span v-if="isUploading">上传中</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            @change="handleFileChange"
          />
        </div>

        <button
          class="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="
            !authStore.isLoggedIn || (!content.trim() && pictures.length === 0) || isUploading
          "
          @click="handleSubmit"
        >
          发布
        </button>
      </div>
    </div>
  </div>
</template>
