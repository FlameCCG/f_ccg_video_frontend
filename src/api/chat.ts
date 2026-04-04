import request from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 消息类型
 */
export type MessageType = 'text' | 'emoji' | 'image' | 'sticker'

/**
 * 消息媒体信息
 */
export interface ChatMessageMedia {
  url: string
  mime: string
  width: number
  height: number
  size: number
}

/**
 * 会话最后一条消息
 */
export interface ChatConversationLastMessage {
  msgId: string
  type: MessageType
  preview: string
  senderId: number
  createdAt: string
}

/**
 * 会话项
 */
export interface ChatConversationItem {
  id: string // 会话ID（minUserId_maxUserId）
  peerId: number // 对方用户ID
  unread: number // 未读数
  lastMessage?: ChatConversationLastMessage
  updatedAt: number // 更新时间（Unix秒）
}

/**
 * 私信消息
 */
export interface ChatMessage {
  id: string // 消息ID（ObjectID Hex）
  conversationId: string // 会话ID（minUserId_maxUserId）
  senderId: number // 发送者用户ID
  receiverId: number // 接收者用户ID
  type: MessageType // 消息类型
  text?: string // 文本内容（type=text）
  emoji?: string // emoji（type=emoji）
  media?: ChatMessageMedia // 媒体信息（type=image/sticker）
  createdAt: string // 创建时间
}

export interface ChatSendTextEvent {
  type: 'send'
  to: number
  msgType: 'text'
  text: string
  clientMsgId?: string
}

export interface ChatSendEmojiEvent {
  type: 'send'
  to: number
  msgType: 'emoji'
  emoji: string
  text?: string
  clientMsgId?: string
}

export interface ChatSendMediaEvent {
  type: 'send'
  to: number
  msgType: 'image' | 'sticker'
  media: ChatMessageMedia
  clientMsgId?: string
}

export interface ChatReadEvent {
  type: 'read'
  peerId: number
}

export type ChatClientEvent =
  | { type: 'ping' }
  | ChatSendTextEvent
  | ChatSendEmojiEvent
  | ChatSendMediaEvent
  | ChatReadEvent

export interface ChatAckWSEvent {
  type: 'ack'
  clientMsgId?: string
  message: ChatMessage
}

export interface ChatMessageWSEvent {
  type: 'message'
  message: ChatMessage
}

export interface ChatReadAckWSEvent {
  type: 'read_ack'
  peerId: number
}

export interface ChatSystemWSEvent {
  type: 'system'
  system: string
}

export type ChatWSEvent =
  | ChatAckWSEvent
  | ChatMessageWSEvent
  | ChatReadAckWSEvent
  | ChatSystemWSEvent

/**
 * 会话列表请求参数
 */
export interface ConversationListParams {
  page?: number
  /** 每页数量，默认 20，最大 50（超出由后端截断） */
  pageSize?: number
}

/**
 * 会话列表响应
 */
export interface ConversationListResult {
  list: ChatConversationItem[]
  total: number
}

/**
 * 创建会话请求参数
 */
export interface CreateConversationParams {
  peerId: number
}

/**
 * 删除会话请求参数
 */
export interface DeleteConversationParams {
  peerId: number
}

/**
 * 消息列表请求参数
 */
export interface MessageListParams {
  peerId: number
  before?: string // 游标（ObjectID Hex，取上一页返回的 nextBefore）
}

/**
 * 消息列表响应
 */
export interface MessageListResult {
  list: ChatMessage[]
  nextBefore: string // 下一页游标
  hasMore: boolean // 是否还有更多
  total: number
}

/**
 * 标记已读请求参数
 */
export interface MarkChatReadParams {
  peerId: number
}

// ============================================================================
// 9.1 私信 API
// ============================================================================

/**
 * 获取私信WebSocket URL
 * GET /common/chat/ws
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 私信实时推送 WebSocket 连接（支持 Authorization header 传递 token或者 query 传递 token）
 */
export const getChatWebSocketUrl = (token?: string): string => {
  const baseUrl = import.meta.env.DEV
    ? `ws://${window.location.hostname}:8080/v1`
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/v1`
  const url = new URL(`${baseUrl}/common/chat/ws`)
  if (token) {
    url.searchParams.set('token', token)
  }
  return url.toString()
}

/**
 * 获取私信会话列表
 * GET /common/chat/conversations
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取当前用户私信会话列表（需登录，pageSize 不限制上限）
 */
export const getConversationList = (
  params?: ConversationListParams
): Promise<ConversationListResult> => {
  return request.get('/common/chat/conversations', { params })
}

/**
 * 创建会话
 * POST /common/chat/conversations
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 创建与指定用户的私信会话（需登录，幂等）
 * 重要说明: 对方不会看到空会话，直到有人发送消息
 */
export const createConversation = (
  params: CreateConversationParams
): Promise<ChatConversationItem> => {
  return request.post('/common/chat/conversations', params)
}

/**
 * 删除会话
 * DELETE /common/chat/conversations
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 删除与指定用户的会话（需登录）
 * 重要说明: 会硬删除该会话及其消息记录
 */
export const deleteConversation = (params: DeleteConversationParams): Promise<void> => {
  return request.delete('/common/chat/conversations', { data: params })
}

/**
 * 获取私信消息列表
 * GET /common/chat/messages
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 获取与指定用户的私信消息（需登录）
 * 重要说明: 固定返回 10 条，按 before 游标向前翻页
 */
export const getMessageList = (params: MessageListParams): Promise<MessageListResult> => {
  return request.get('/common/chat/messages', { params })
}

/**
 * 标记私信已读
 * PUT /common/chat/read
 * 认证: 需要登录（客户端全局自动携带 Token）
 * 依赖接口: 无
 * 接口说明: 标记与指定用户的私信为已读（需登录，红点清零）
 */
export const markChatRead = (params: MarkChatReadParams): Promise<void> => {
  return request.put('/common/chat/read', params)
}
