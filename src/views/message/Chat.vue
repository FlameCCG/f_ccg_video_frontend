<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { toast } from 'vue-sonner'
import { ImagePlus, Loader2, SmilePlus, Wifi, WifiOff, X } from 'lucide-vue-next'
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
const currentConversation = computed(
  () => conversations.value.find((item) => item.peerId === currentPeerId.value) ?? null
)
const currentPeerProfile = computed(() =>
  currentPeerId.value ? (peerProfiles.value[currentPeerId.value] ?? null) : null
)
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
const connectionLabel = computed(() => (connected.value ? '消息实时连接中' : '消息重连中'))

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
  <div class="flex h-full flex-col overflow-hidden bg-background lg:flex-row">
    <div
      class="flex w-full shrink-0 flex-col border-b border-border/60 bg-background lg:w-[280px] lg:border-b-0 lg:border-r"
    >
      <div class="flex h-[52px] shrink-0 items-center justify-between border-b px-4">
        <div>
          <h2 class="text-[14px] font-medium text-foreground">近期消息</h2>
          <p class="mt-0.5 text-[11px] text-muted-foreground">点击会话后立即同步已读</p>
        </div>
        <span
          class="rounded-full px-2 py-1 text-[11px]"
          :class="
            connected ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
          "
        >
          {{ connectionLabel }}
        </span>
      </div>

      <div class="max-h-[240px] flex-1 overflow-y-auto py-2 lg:max-h-none">
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
            class="group mx-2 flex w-[calc(100%-16px)] items-center gap-3 rounded-xl p-3 text-left transition-colors"
            :class="
              currentPeerId === conversation.peerId
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
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
                class="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] text-destructive-foreground"
              >
                {{ conversation.unread > 99 ? '99+' : conversation.unread }}
              </span>
            </button>

            <div class="min-w-0 flex-1">
              <div class="mb-1 flex items-center justify-between gap-3">
                <span class="truncate text-[13px] font-medium text-foreground">
                  {{ resolvePeerName(conversation.peerId) }}
                </span>
                <span class="shrink-0 text-[11px] text-muted-foreground">
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

    <div class="relative min-w-0 flex-1 bg-background/90">
      <template v-if="currentPeerId">
        <div class="flex h-full flex-col">
          <div class="flex h-[52px] shrink-0 items-center justify-between border-b px-6">
            <div class="flex min-w-0 items-center gap-3">
              <button type="button" class="shrink-0" @click="openUserHome(currentPeerId)">
                <AppAvatar
                  :src="currentPeerProfile?.avatar"
                  :name="currentPeerDisplayName"
                  container-class="h-10 w-10 text-sm"
                />
              </button>
              <div class="min-w-0">
                <h2 class="text-[15px] font-medium text-foreground">
                  与 {{ currentPeerDisplayName }} 的对话
                </h2>
                <p class="mt-0.5 text-[12px] text-muted-foreground">
                  {{
                    currentConversation?.unread
                      ? `还有 ${currentConversation.unread} 条未读`
                      : '当前会话已读'
                  }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Wifi v-if="connected" class="h-4 w-4 text-emerald-500" />
              <WifiOff v-else class="h-4 w-4 text-amber-500" />
              <span>{{ connected ? '实时同步中' : '重连中' }}</span>
            </div>
          </div>

          <div ref="messageScrollerRef" class="flex-1 overflow-y-auto px-5 py-4">
            <div v-if="loadingMessages" class="mt-4 text-center text-xs text-muted-foreground">
              加载中...
            </div>

            <div
              v-else-if="messages.length === 0"
              class="flex h-full items-center justify-center text-sm text-muted-foreground"
            >
              还没有消息，发一句打个招呼吧。
            </div>

            <div v-else class="space-y-4">
              <div
                v-for="message in messages"
                :key="message.clientMsgId || message.id"
                class="flex items-end gap-2"
                :class="message.senderId === currentUserId ? 'flex-row-reverse' : ''"
              >
                <button type="button" class="shrink-0" @click="openUserHome(message.senderId)">
                  <AppAvatar
                    :src="resolveMessageAvatar(message)"
                    :name="resolveMessageName(message)"
                    container-class="h-[36px] w-[36px] shrink-0 text-xs"
                  />
                </button>

                <div
                  class="max-w-[72%] rounded-3xl px-4 py-3 text-[14px] shadow-sm transition-opacity"
                  :class="
                    message.senderId === currentUserId
                      ? 'rounded-tr-sm bg-primary text-primary-foreground'
                      : 'rounded-tl-sm bg-muted text-foreground'
                  "
                  :style="{ opacity: message.pending ? '0.72' : '1' }"
                >
                  <div v-if="message.type === 'emoji'" class="text-[30px] leading-none">
                    {{ message.emoji || message.text }}
                  </div>

                  <div v-else-if="message.type === 'image' || message.type === 'sticker'">
                    <img
                      :src="message.media?.url"
                      :alt="message.type === 'sticker' ? '表情包消息' : '图片消息'"
                      class="rounded-2xl object-cover"
                      :class="
                        message.type === 'sticker'
                          ? 'max-h-[220px] max-w-[220px]'
                          : 'max-h-[320px] max-w-full'
                      "
                    />
                    <div
                      v-if="message.type === 'sticker'"
                      class="mt-2 text-[11px] text-primary-foreground/70"
                    >
                      表情包
                    </div>
                  </div>

                  <div v-else class="whitespace-pre-wrap break-words">
                    {{ message.text }}
                  </div>

                  <div
                    class="mt-2 text-[11px]"
                    :class="
                      message.senderId === currentUserId
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground'
                    "
                  >
                    {{ formatTimeAgo(new Date(message.createdAt).getTime()) }}
                    <span v-if="message.pending"> · 发送中</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="shrink-0 border-t bg-background p-4">
            <div
              v-if="pendingMedia"
              class="mb-3 rounded-2xl border border-border/60 bg-muted/40 p-3"
            >
              <div class="mb-3 flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <img
                    :src="pendingMedia.previewUrl"
                    alt="待发送图片预览"
                    class="h-16 w-16 rounded-xl object-cover"
                  />
                  <div>
                    <div class="text-sm font-medium text-foreground">
                      {{ pendingMedia.file.name }}
                    </div>
                    <div class="mt-1 text-xs text-muted-foreground">
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

              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <button
                    class="rounded-full px-3 py-1 text-xs transition-colors"
                    :class="
                      pendingMedia.msgType === 'image'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground'
                    "
                    @click="updatePendingMediaType('image')"
                  >
                    图片消息
                  </button>
                  <button
                    class="rounded-full px-3 py-1 text-xs transition-colors"
                    :class="
                      pendingMedia.msgType === 'sticker'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground'
                    "
                    @click="updatePendingMediaType('sticker')"
                  >
                    表情包消息
                  </button>
                </div>

                <button
                  class="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="uploadingMedia || !connected"
                  @click="sendPendingMedia"
                >
                  <Loader2 v-if="uploadingMedia" class="h-4 w-4 animate-spin" />
                  <span>{{ uploadingMedia ? '上传中...' : '发送媒体消息' }}</span>
                </button>
              </div>
            </div>

            <div class="rounded-3xl border border-border/60 bg-background px-4 py-3 shadow-sm">
              <textarea
                v-model="draftText"
                class="min-h-[84px] w-full resize-none border-0 bg-transparent text-sm leading-6 outline-none"
                :disabled="composerDisabled"
                placeholder="输入文字消息，Enter 发送，Shift + Enter 换行"
                @keydown="handleEditorKeydown"
              ></textarea>

              <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <div ref="emojiPickerRef" class="relative">
                    <button
                      class="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      :disabled="composerDisabled"
                      @click="showEmojiPicker = !showEmojiPicker"
                    >
                      <SmilePlus class="h-4 w-4" />
                      <span>emoji</span>
                    </button>

                    <div
                      v-if="showEmojiPicker"
                      class="absolute bottom-[calc(100%+12px)] left-0 z-20"
                    >
                      <EmojiPicker @select="sendEmojiMessage" />
                    </div>
                  </div>

                  <button
                    class="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="composerDisabled"
                    @click="openMediaPicker"
                  >
                    <ImagePlus class="h-4 w-4" />
                    <span>图片/表情包</span>
                  </button>

                  <input
                    ref="fileInputRef"
                    type="file"
                    class="hidden"
                    accept="image/*"
                    @change="handleFileChange"
                  />
                </div>

                <button
                  class="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="composerDisabled || !draftText.trim() || !connected"
                  @click="sendTextMessage"
                >
                  发送文字消息
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <div class="rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
            从左侧选择会话后，会自动拉取消息并标记已读
          </div>
          <div class="max-w-sm text-[13px] leading-6 text-muted-foreground">
            当前私信支持文字消息、emoji
            消息，以及图片/表情包消息。媒体发送前会先上传并允许你切换成“图片”或“表情包”类型。
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
