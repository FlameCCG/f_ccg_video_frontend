<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { ImagePlus, Loader2, MoreVertical, SmilePlus, X } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import {
  getConversationList,
  getMessageList,
  getChatWebSocketUrl,
  markChatRead,
  type ChatClientEvent,
  type ChatConversationItem,
  type ChatMessage,
  type ChatMessageMedia,
  type ChatSendMediaEvent,
  type ChatSendTextEvent,
  type ChatSendEmojiEvent,
  type ChatWSEvent,
  type MessageType,
} from '@/api/chat'
import { uploadImage } from '@/api/upload'
import { getUserDetail, type UserDetail } from '@/api/user'
import EmojiPicker from '@/components/common/EmojiPicker.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAuthStore } from '@/stores/auth'
import { useNotificationStore } from '@/stores/notification'
import { formatTimeAgo } from '@/utils/time'

type MediaMessageType = Extract<MessageType, 'image' | 'sticker'>
type PeerProfile = Pick<UserDetail, 'id' | 'username' | 'avatar'>

interface ChatTimelineMessage extends ChatMessage {
  clientMsgId?: string
  pending?: boolean
}

interface PendingMediaState {
  file: File
  previewUrl: string
  msgType: MediaMessageType
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const notificationStore = useNotificationStore()

const conversations = ref<ChatConversationItem[]>([])
const currentPeerId = ref<number | null>(null)
const messages = ref<ChatTimelineMessage[]>([])
const peerProfiles = ref<Record<number, PeerProfile>>({})
const loadingConversations = ref(true)
const loadingMessages = ref(false)
const draftText = ref('')
const showEmojiPicker = ref(false)
const uploadingMedia = ref(false)
const pendingMedia = ref<PendingMediaState | null>(null)
const emojiPickerRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const messageScrollerRef = ref<HTMLElement | null>(null)

const currentUserId = computed(() => authStore.user?.id ?? 0)

const currentPeerDisplayName = computed(() =>
  currentPeerId.value
    ? (peerProfiles.value[currentPeerId.value]?.username ?? `UID ${currentPeerId.value}`)
    : ''
)

const peerProfileRequests = new Map<number, Promise<PeerProfile | null>>()

const buildConversationId = (peerId: number) =>
  [currentUserId.value, peerId].sort((a, b) => a - b).join('_')

const rememberPeerProfile = (profile: PeerProfile) => {
  peerProfiles.value = {
    ...peerProfiles.value,
    [profile.id]: profile,
  }
}

const ensurePeerProfile = async (peerId: number): Promise<PeerProfile | null> => {
  if (!peerId) return null
  if (peerProfiles.value[peerId]) return peerProfiles.value[peerId]

  const existingRequest = peerProfileRequests.get(peerId)
  if (existingRequest) return existingRequest

  const request = getUserDetail(peerId)
    .then((user) => {
      const profile: PeerProfile = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
      }
      rememberPeerProfile(profile)
      return profile
    })
    .catch((error) => {
      console.error('Failed to load peer profile', error)
      return null
    })
    .finally(() => {
      peerProfileRequests.delete(peerId)
    })

  peerProfileRequests.set(peerId, request)
  return request
}

const preloadPeerProfiles = (peerIds: number[]) => {
  const uniquePeerIds = [...new Set(peerIds.filter(Boolean))].filter(
    (peerId) => !peerProfiles.value[peerId]
  )
  if (uniquePeerIds.length === 0) return

  void Promise.allSettled(uniquePeerIds.map((peerId) => ensurePeerProfile(peerId)))
}

const resolvePeerName = (peerId: number) => peerProfiles.value[peerId]?.username ?? `UID ${peerId}`
const resolvePeerAvatar = (peerId: number) => peerProfiles.value[peerId]?.avatar ?? ''
const resolveMessageName = (message: ChatTimelineMessage) =>
  message.senderId === currentUserId.value
    ? authStore.user?.username || '我'
    : resolvePeerName(message.senderId)
const resolveMessageAvatar = (message: ChatTimelineMessage) =>
  message.senderId === currentUserId.value
    ? authStore.user?.avatar || ''
    : resolvePeerAvatar(message.senderId)

const resolveMessagePreview = (message: Pick<ChatMessage, 'type' | 'text' | 'emoji'>): string => {
  if (message.type === 'text') return message.text?.trim() || '[文本消息]'
  if (message.type === 'emoji') return message.emoji || message.text || '[emoji]'
  if (message.type === 'sticker') return '[表情包]'
  return '[图片]'
}

const getConversationPreview = (conversation: ChatConversationItem): string => {
  if (!conversation.lastMessage) return '[暂无消息]'
  return conversation.lastMessage.preview || resolveMessagePreview(conversation.lastMessage)
}

const sortConversations = () => {
  conversations.value = [...conversations.value].sort(
    (left, right) => right.updatedAt - left.updatedAt
  )
}

const scrollMessagesToBottom = async (behavior: ScrollBehavior = 'smooth') => {
  await nextTick()
  if (!messageScrollerRef.value) return
  messageScrollerRef.value.scrollTo({
    top: messageScrollerRef.value.scrollHeight,
    behavior,
  })
}

const clearPendingMedia = () => {
  if (pendingMedia.value) {
    URL.revokeObjectURL(pendingMedia.value.previewUrl)
  }
  pendingMedia.value = null
}

const appendOrReplaceMessage = (message: ChatMessage, clientMsgId?: string) => {
  const nextMessage: ChatTimelineMessage = { ...message }
  const targetIndex = messages.value.findIndex(
    (item) => item.id === message.id || (!!clientMsgId && item.clientMsgId === clientMsgId)
  )

  if (targetIndex >= 0) {
    messages.value.splice(targetIndex, 1, nextMessage)
  } else {
    messages.value.push(nextMessage)
  }
}

const discardLastPendingSelfMessage = () => {
  const pendingIndex = [...messages.value]
    .map((message, index) => ({ message, index }))
    .reverse()
    .find(({ message }) => message.pending && message.senderId === currentUserId.value)?.index

  if (pendingIndex === undefined) return false

  messages.value.splice(pendingIndex, 1)
  return true
}

const updateConversationByMessage = (message: ChatMessage, incrementUnread: boolean) => {
  const peerId = message.senderId === currentUserId.value ? message.receiverId : message.senderId
  const preview = resolveMessagePreview(message)
  const updatedAt =
    Math.floor(new Date(message.createdAt).getTime() / 1000) || Math.floor(Date.now() / 1000)

  void ensurePeerProfile(peerId)

  const conversation = conversations.value.find((item) => item.peerId === peerId)
  if (conversation) {
    conversation.lastMessage = {
      msgId: message.id,
      type: message.type,
      preview,
      senderId: message.senderId,
      createdAt: message.createdAt,
    }
    conversation.updatedAt = updatedAt
    if (incrementUnread) {
      conversation.unread += 1
    }
  } else {
    conversations.value.unshift({
      id: message.conversationId || buildConversationId(peerId),
      peerId,
      unread: incrementUnread ? 1 : 0,
      lastMessage: {
        msgId: message.id,
        type: message.type,
        preview,
        senderId: message.senderId,
        createdAt: message.createdAt,
      },
      updatedAt,
    })
  }

  sortConversations()
}

const markConversationRead = async (peerId: number) => {
  const conversation = conversations.value.find((item) => item.peerId === peerId)
  const unreadBefore = Math.max(0, conversation?.unread ?? 0)

  await markChatRead({ peerId })
  if (connected.value) {
    send({ type: 'read', peerId })
  }

  if (conversation) {
    conversation.unread = 0
  }

  if (unreadBefore > 0) {
    notificationStore.markMessageRead(unreadBefore)
  } else {
    void notificationStore.fetchCounts()
  }
}

const loadConversations = async () => {
  try {
    loadingConversations.value = true
    const result = await getConversationList({ page: 1, pageSize: 50 })
    conversations.value = result.list || []
    sortConversations()
    preloadPeerProfiles(conversations.value.map((item) => item.peerId))

    if (currentPeerId.value) {
      const selectedConversation = conversations.value.find(
        (item) => item.peerId === currentPeerId.value
      )
      if (selectedConversation?.unread) {
        await markConversationRead(currentPeerId.value)
      }
    }
  } catch (error) {
    console.error('Failed to load conversations', error)
  } finally {
    loadingConversations.value = false
  }
}

const loadMessages = async (peerId: number) => {
  if (!peerId) return

  try {
    loadingMessages.value = true
    void ensurePeerProfile(peerId)
    const result = await getMessageList({ peerId })
    messages.value = (result.list || []).map((message) => ({ ...message }))
    await markConversationRead(peerId)
    await scrollMessagesToBottom('auto')
  } catch (error) {
    console.error('Failed to load messages', error)
  } finally {
    loadingMessages.value = false
  }
}

const createClientMsgId = () => `msg-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const pushPendingMessage = (
  payload: ChatSendTextEvent | ChatSendEmojiEvent | ChatSendMediaEvent
) => {
  const pendingMessage: ChatTimelineMessage = {
    id: payload.clientMsgId || createClientMsgId(),
    clientMsgId: payload.clientMsgId,
    pending: true,
    conversationId: buildConversationId(payload.to),
    senderId: currentUserId.value,
    receiverId: payload.to,
    type: payload.msgType,
    text: payload.msgType === 'text' ? payload.text : undefined,
    emoji: payload.msgType === 'emoji' ? payload.emoji : undefined,
    media: 'media' in payload ? payload.media : undefined,
    createdAt: new Date().toISOString(),
  }

  messages.value.push(pendingMessage)
  updateConversationByMessage(pendingMessage, false)
  void scrollMessagesToBottom()
}

const sendTextMessage = () => {
  const text = draftText.value.trim()
  if (!text || !currentPeerId.value) return

  const payload: ChatSendTextEvent = {
    type: 'send',
    to: currentPeerId.value,
    msgType: 'text',
    text,
    clientMsgId: createClientMsgId(),
  }

  if (!sendEvent(payload)) return

  draftText.value = ''
  pushPendingMessage(payload)
}

const sendEmojiMessage = (emoji: string) => {
  if (!currentPeerId.value) {
    toast.error('先选择一个会话')
    return
  }

  const payload: ChatSendEmojiEvent = {
    type: 'send',
    to: currentPeerId.value,
    msgType: 'emoji',
    emoji,
    text: emoji,
    clientMsgId: createClientMsgId(),
  }

  if (!sendEvent(payload)) return

  showEmojiPicker.value = false
  pushPendingMessage(payload)
}

const computeFileHash = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

const readImageMeta = (file: File): Promise<Pick<ChatMessageMedia, 'width' | 'height'>> =>
  new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
      URL.revokeObjectURL(previewUrl)
    }

    image.onerror = () => {
      reject(new Error('图片解析失败'))
      URL.revokeObjectURL(previewUrl)
    }

    image.src = previewUrl
  })

const sendPendingMedia = async () => {
  if (!currentPeerId.value || !pendingMedia.value) return

  if (!connected.value) {
    toast.error('消息连接中，请稍后再试')
    return
  }

  const mediaToSend = pendingMedia.value
  uploadingMedia.value = true

  try {
    const [fileHash, dimensions] = await Promise.all([
      computeFileHash(mediaToSend.file),
      readImageMeta(mediaToSend.file),
    ])
    const result = await uploadImage(fileHash, mediaToSend.file)
    const payload: ChatSendMediaEvent = {
      type: 'send',
      to: currentPeerId.value,
      msgType: mediaToSend.msgType,
      media: {
        url: result.imageUrl,
        mime: mediaToSend.file.type || 'image/png',
        width: dimensions.width,
        height: dimensions.height,
        size: mediaToSend.file.size,
      },
      clientMsgId: createClientMsgId(),
    }

    if (!sendEvent(payload)) return

    pushPendingMessage(payload)
    clearPendingMedia()
  } catch (error) {
    console.error('Failed to send media message', error)
    toast.error('图片/表情包发送失败')
  } finally {
    uploadingMedia.value = false
  }
}

const selectConversation = (peerId: number) => {
  void router.push({ name: 'message-chat-room', params: { peerId } })
}

const openUserHome = (userId: number) => {
  void router.push({ name: 'user-home', params: { id: userId } })
}

const openMediaPicker = () => {
  if (!currentPeerId.value) {
    toast.error('先选择一个会话')
    return
  }
  fileInputRef.value?.click()
}

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''

  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('仅支持发送图片或表情包文件')
    return
  }

  clearPendingMedia()
  pendingMedia.value = {
    file,
    previewUrl: URL.createObjectURL(file),
    msgType: 'image',
  }
}

const updatePendingMediaType = (msgType: MediaMessageType) => {
  if (pendingMedia.value) {
    pendingMedia.value.msgType = msgType
  }
}

const handleWsMessage = (event: MessageEvent) => {
  try {
    const payload = JSON.parse(String(event.data)) as ChatWSEvent

    if (payload.type === 'ack' && payload.message) {
      appendOrReplaceMessage(payload.message, payload.clientMsgId)
      updateConversationByMessage(payload.message, false)
      void scrollMessagesToBottom()
      return
    }

    if (payload.type === 'message' && payload.message) {
      const peerId =
        payload.message.senderId === currentUserId.value
          ? payload.message.receiverId
          : payload.message.senderId
      const isCurrentConversation = currentPeerId.value === peerId
      const isIncoming = payload.message.senderId !== currentUserId.value

      updateConversationByMessage(payload.message, isIncoming && !isCurrentConversation)

      if (isCurrentConversation) {
        appendOrReplaceMessage(payload.message)
        void scrollMessagesToBottom()

        if (isIncoming) {
          void markConversationRead(peerId)
        }
      } else if (isIncoming) {
        notificationStore.updateCount('message', 1)
      }
      return
    }

    if (payload.type === 'system' && payload.system) {
      toast.error(payload.system)

      if (discardLastPendingSelfMessage()) {
        void loadConversations()
        if (currentPeerId.value) {
          void loadMessages(currentPeerId.value)
        }
      }
    }
  } catch (error) {
    console.error('Failed to parse chat websocket message', error)
  }
}

const { connected, send } = useWebSocket(
  () => (authStore.accessToken ? getChatWebSocketUrl(authStore.accessToken) : null),
  {
    heartbeat: { message: { type: 'ping' }, interval: 30000 },
    reconnect: { initialDelay: 1000, maxDelay: 10000 },
    onMessage: (_ws, event) => handleWsMessage(event),
  }
)

const sendEvent = (payload: ChatClientEvent) => {
  if (!connected.value) {
    toast.error('消息连接中，请稍后再试')
    return false
  }
  send(payload)
  return true
}

const composerDisabled = computed(() => !currentPeerId.value)

const MAX_TEXT_LENGTH = 500
const charCount = computed(() => draftText.value.length)

const formatMessageTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return `今天 ${timeStr}`
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`
}

const shouldShowTimeSeparator = (index: number): boolean => {
  if (index === 0) return true
  const currentMsg = messages.value[index]
  const prevMsg = messages.value[index - 1]
  if (!currentMsg || !prevMsg) return false
  const current = new Date(currentMsg.createdAt).getTime()
  const prev = new Date(prevMsg.createdAt).getTime()
  return current - prev > 5 * 60 * 1000
}

const handleEditorKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendTextMessage()
  }
}

watch(
  () => route.params.peerId,
  (nextPeerId) => {
    showEmojiPicker.value = false

    if (!nextPeerId) {
      currentPeerId.value = null
      messages.value = []
      clearPendingMedia()
      return
    }

    currentPeerId.value = Number(nextPeerId)
    clearPendingMedia()
    void ensurePeerProfile(currentPeerId.value)
    void loadMessages(currentPeerId.value)
  },
  { immediate: true }
)

onClickOutside(emojiPickerRef, () => {
  showEmojiPicker.value = false
})

onMounted(() => {
  void loadConversations()
})

onBeforeUnmount(() => {
  clearPendingMedia()
})
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-card lg:flex-row">
    <!-- Conversation List Panel -->
    <div
      class="flex w-full shrink-0 flex-col border-b border-border/60 bg-card lg:w-[280px] lg:border-b-0 lg:border-r"
    >
      <div
        class="flex h-[52px] shrink-0 items-center justify-between border-b border-border/40 px-4"
      >
        <h2 class="text-[14px] font-medium text-foreground">我的消息</h2>
      </div>

      <div class="flex h-[38px] shrink-0 items-center border-b border-border/30 px-4">
        <span class="text-[12px] text-muted-foreground">最近消息</span>
      </div>

      <div
        class="max-h-[240px] flex-1 overflow-y-auto lg:max-h-none [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-border hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
      >
        <div v-if="loadingConversations" class="p-4 text-center text-xs text-muted-foreground">
          加载中...
        </div>
        <div
          v-else-if="conversations.length === 0"
          class="p-6 text-center text-xs text-muted-foreground"
        >
          暂无消息
        </div>
        <template v-else>
          <div
            v-for="conversation in conversations"
            :key="conversation.id"
            class="group flex items-center gap-3 px-4 py-3 text-left transition-colors"
            :class="
              currentPeerId === conversation.peerId
                ? 'bg-muted/80 text-foreground'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
            "
            role="button"
            tabindex="0"
            @click="selectConversation(conversation.peerId)"
            @keydown.enter.prevent="selectConversation(conversation.peerId)"
            @keydown.space.prevent="selectConversation(conversation.peerId)"
          >
            <button
              type="button"
              class="relative shrink-0"
              @click.stop="openUserHome(conversation.peerId)"
            >
              <AppAvatar
                :src="resolvePeerAvatar(conversation.peerId)"
                :name="resolvePeerName(conversation.peerId)"
                container-class="h-[42px] w-[42px] text-sm"
              />
              <span
                v-if="conversation.unread > 0"
                class="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-primary-foreground"
              >
                {{ conversation.unread > 99 ? '99+' : conversation.unread }}
              </span>
            </button>

            <div class="min-w-0 flex-1">
              <div class="mb-0.5 flex items-center justify-between gap-2">
                <span class="truncate text-[13px] font-medium text-foreground">
                  {{ resolvePeerName(conversation.peerId) }}
                </span>
                <span class="shrink-0 text-[11px] text-muted-foreground/70">
                  {{ formatTimeAgo(conversation.updatedAt * 1000) }}
                </span>
              </div>
              <div class="truncate text-[12px] text-muted-foreground">
                {{ getConversationPreview(conversation) }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Chat Area -->
    <div class="relative min-w-0 flex-1 bg-card">
      <template v-if="currentPeerId">
        <div class="flex h-full flex-col">
          <!-- Chat Header -->
          <div
            class="flex h-[52px] shrink-0 items-center justify-between border-b border-border/40 px-6"
          >
            <h2 class="text-[15px] font-medium text-foreground">
              {{ currentPeerDisplayName }}
            </h2>
            <button
              type="button"
              class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="openUserHome(currentPeerId)"
            >
              <MoreVertical class="h-[18px] w-[18px]" />
            </button>
          </div>

          <!-- Messages -->
          <div
            ref="messageScrollerRef"
            class="flex-1 overflow-y-auto bg-muted/10 px-5 py-4 [&::-webkit-scrollbar-thumb]:rounded-[6px] [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
          >
            <div v-if="loadingMessages" class="mt-4 text-center text-xs text-muted-foreground">
              加载中...
            </div>

            <div
              v-else-if="messages.length === 0"
              class="flex h-full items-center justify-center text-sm text-muted-foreground"
            >
              还没有消息，发一句打个招呼吧
            </div>

            <div v-else class="space-y-3">
              <template
                v-for="(message, index) in messages"
                :key="message.clientMsgId || message.id"
              >
                <!-- Time Separator -->
                <div
                  v-if="shouldShowTimeSeparator(index)"
                  class="flex items-center justify-center py-2"
                >
                  <span
                    class="rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground"
                  >
                    {{ formatMessageTime(message.createdAt) }}
                  </span>
                </div>

                <!-- Message Bubble -->
                <div
                  class="flex items-end gap-2"
                  :class="message.senderId === currentUserId ? 'flex-row-reverse' : ''"
                >
                  <button
                    type="button"
                    class="shrink-0 self-start"
                    @click="openUserHome(message.senderId)"
                  >
                    <AppAvatar
                      :src="resolveMessageAvatar(message)"
                      :name="resolveMessageName(message)"
                      container-class="h-[34px] w-[34px] shrink-0 text-xs"
                    />
                  </button>

                  <div
                    class="chat-bubble max-w-[65%] text-[14px] transition-opacity"
                    :class="
                      message.senderId === currentUserId ? 'chat-bubble-self' : 'chat-bubble-peer'
                    "
                    :style="{ opacity: message.pending ? '0.65' : '1' }"
                  >
                    <div v-if="message.type === 'emoji'" class="text-[30px] leading-none">
                      {{ message.emoji || message.text }}
                    </div>

                    <div v-else-if="message.type === 'image' || message.type === 'sticker'">
                      <img
                        :src="message.media?.url"
                        :alt="message.type === 'sticker' ? '表情包消息' : '图片消息'"
                        class="rounded-xl object-cover"
                        :class="
                          message.type === 'sticker'
                            ? 'max-h-[200px] max-w-[200px]'
                            : 'max-h-[280px] max-w-full'
                        "
                      />
                    </div>

                    <div v-else class="whitespace-pre-wrap break-words leading-relaxed">
                      {{ message.text }}
                    </div>

                    <span v-if="message.pending" class="mt-1 block text-[11px] opacity-60">
                      发送中...
                    </span>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Composer -->
          <div class="shrink-0 border-t border-border/40 bg-card px-4 py-3">
            <!-- Pending Media Preview -->
            <div
              v-if="pendingMedia"
              class="mb-3 rounded-xl border border-border/50 bg-muted/30 p-3"
            >
              <div class="mb-2 flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <img
                    :src="pendingMedia.previewUrl"
                    alt="待发送图片预览"
                    class="h-14 w-14 rounded-lg object-cover"
                  />
                  <div>
                    <div class="text-[13px] font-medium text-foreground">
                      {{ pendingMedia.file.name }}
                    </div>
                    <div class="mt-0.5 text-[11px] text-muted-foreground">
                      {{ Math.max(1, Math.round(pendingMedia.file.size / 1024)) }} KB
                    </div>
                  </div>
                </div>
                <button
                  class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  @click="clearPendingMedia"
                >
                  <X class="h-4 w-4" />
                </button>
              </div>

              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-1.5">
                  <button
                    class="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                    :class="
                      pendingMedia.msgType === 'image'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    "
                    @click="updatePendingMediaType('image')"
                  >
                    图片
                  </button>
                  <button
                    class="rounded-full px-2.5 py-1 text-[11px] transition-colors"
                    :class="
                      pendingMedia.msgType === 'sticker'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                    "
                    @click="updatePendingMediaType('sticker')"
                  >
                    表情包
                  </button>
                </div>

                <button
                  class="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="uploadingMedia || !connected"
                  @click="sendPendingMedia"
                >
                  <Loader2 v-if="uploadingMedia" class="h-3.5 w-3.5 animate-spin" />
                  <span>{{ uploadingMedia ? '上传中...' : '发送' }}</span>
                </button>
              </div>
            </div>

            <!-- Tool bar -->
            <div class="mb-2 flex items-center gap-1">
              <div ref="emojiPickerRef" class="relative">
                <button
                  class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="composerDisabled"
                  title="表情"
                  @click="showEmojiPicker = !showEmojiPicker"
                >
                  <SmilePlus class="h-5 w-5" />
                </button>

                <div v-if="showEmojiPicker" class="absolute bottom-[calc(100%+8px)] left-0 z-20">
                  <EmojiPicker @select="sendEmojiMessage" />
                </div>
              </div>

              <button
                class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="composerDisabled"
                title="图片/表情包"
                @click="openMediaPicker"
              >
                <ImagePlus class="h-5 w-5" />
              </button>

              <input
                ref="fileInputRef"
                type="file"
                class="hidden"
                accept="image/*"
                @change="handleFileChange"
              />
            </div>

            <!-- Text input + Send -->
            <div
              class="rounded-xl border border-border/50 bg-muted/30 px-3 py-2 transition-colors focus-within:border-primary/50 focus-within:bg-background shadow-sm"
            >
              <textarea
                v-model="draftText"
                class="min-h-[36px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/60"
                :disabled="composerDisabled"
                :maxlength="MAX_TEXT_LENGTH"
                placeholder="请输入消息内容"
                rows="1"
                @keydown="handleEditorKeydown"
              ></textarea>

              <div class="mt-1 flex items-center justify-end gap-2">
                <span class="text-[11px] text-muted-foreground/60">
                  {{ charCount }}/{{ MAX_TEXT_LENGTH }}
                </span>
                <button
                  class="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  :disabled="composerDisabled || !draftText.trim() || !connected"
                  @click="sendTextMessage"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <template v-else>
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6">
          <img
            src="https://s1.hdslb.com/bfs/seed/jinkela/short/message/img/gochat.png"
            alt="开始聊天"
            class="mb-2 h-auto w-[280px] opacity-90"
          />
          <p class="text-[13px] text-muted-foreground">快找小伙伴聊天吧！（＾▽＾）ﾉ</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.chat-bubble {
  border-radius: 18px;
  padding: 10px 16px;
}

.chat-bubble-self {
  background-color: var(--color-primary);
  color: var(--color-primary-foreground);
  border-top-right-radius: 4px;
}

.chat-bubble-peer {
  background-color: var(--color-muted);
  color: var(--color-foreground);
  border-top-left-radius: 4px;
}
</style>
