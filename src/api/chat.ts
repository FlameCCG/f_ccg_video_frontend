import request, { getAccessToken } from './request'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * 消息类型
 */
export type MessageType = 'text' | 'emoji' | 'image' | 'video'

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
  lastMessage: ChatConversationLastMessage
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
  media?: ChatMessageMedia // 媒体信息（type=image/video）
  createdAt: string // 创建时间
}

/**
 * 会话列表请求参数
 */
export interface ConversationListParams {
  page?: number
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
  total?: number
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
 * 返回 WebSocket 连接 URL（需要在 URL 中携带 token）
 */
export const getChatWebSocketUrl = (): string => {
  const token = getAccessToken()
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.host
  return `${protocol}//${host}/v1/common/chat/ws?token=${token}`
}

/**
 * 获取私信会话列表
 * GET /common/chat/conversations
 */
export const getConversationList = (
  params?: ConversationListParams
): Promise<ConversationListResult> => {
  return request.get('/common/chat/conversations', { params })
}

/**
 * 创建会话
 * POST /common/chat/conversations
 */
export const createConversation = (
  params: CreateConversationParams
): Promise<ChatConversationItem> => {
  return request.post('/common/chat/conversations', params)
}

/**
 * 删除会话
 * DELETE /common/chat/conversations
 */
export const deleteConversation = (params: DeleteConversationParams): Promise<void> => {
  return request.delete('/common/chat/conversations', { data: params })
}

/**
 * 获取私信消息列表
 * GET /common/chat/messages
 */
export const getMessageList = (params: MessageListParams): Promise<MessageListResult> => {
  return request.get('/common/chat/messages', { params })
}

/**
 * 标记私信已读
 * PUT /common/chat/read
 */
export const markChatRead = (params: MarkChatReadParams): Promise<void> => {
  return request.put('/common/chat/read', params)
}
