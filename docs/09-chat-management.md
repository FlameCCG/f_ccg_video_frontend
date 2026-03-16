# 私信管理

分类说明：私信/聊天相关

Base URL：/v1

## [GET] 私信WebSocket

- 接口路径: GET /common/chat/ws
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 私信实时推送WebSocket连接（需登录；支持 Authorization header 传递 token或者 query 传递 token）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
- 无

响应字段:
- 无

响应示例:
- 无

## [GET] 私信会话列表

- 接口路径: GET /common/chat/conversations
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 获取当前用户私信会话列表（需登录，pageSize 不限制上限）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| page | query | integer | 否 | 页码 |
| pageSize | query | integer | 否 | 每页数量（不设最大值） |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | object | - |
| data.list | array<ChatConversationItem> | - |
| data.list[].id | string | 会话ID（minUserId_maxUserId） |
| data.list[].peerId | integer(uint) | 对方用户ID |
| data.list[].unread | integer(int64) | 未读数 |
| data.list[].lastMessage | ChatConversationLastMessage | - |
| data.list[].lastMessage.msgId | string | 消息ID（ObjectID Hex） |
| data.list[].lastMessage.type | string | 消息类型 |
| data.list[].lastMessage.preview | string | 预览内容 |
| data.list[].lastMessage.senderId | integer(uint) | 发送者用户ID |
| data.list[].lastMessage.createdAt | string(date-time) | 创建时间 |
| data.list[].updatedAt | integer(int64) | 更新时间（Unix秒） |
| data.total | integer(int64) | - |

响应示例:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "1001_1002",
        "peerId": 1001,
        "unread": 1,
        "lastMessage": {
          "msgId": "65e8c7a0f1a2b3c4d5e6f789",
          "type": "text",
          "preview": "你好，在吗？",
          "senderId": 1001,
          "createdAt": "2024-06-01T12:00:00Z"
        },
        "updatedAt": 1
      }
    ],
    "total": 1
  },
  "msg": "获取成功"
}
```

## [POST] 创建会话

- 接口路径: POST /common/chat/conversations
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 创建与指定用户的私信会话（需登录，幂等；对方不会看到空会话，直到有人发送消息）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| peerId | body | integer | 是 | 对方用户ID |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | ChatConversationItem | - |
| data.id | string | 会话ID（minUserId_maxUserId） |
| data.peerId | integer(uint) | 对方用户ID |
| data.unread | integer(int64) | 未读数 |
| data.lastMessage | ChatConversationLastMessage | - |
| data.lastMessage.msgId | string | 消息ID（ObjectID Hex） |
| data.lastMessage.type | string | 消息类型 |
| data.lastMessage.preview | string | 预览内容 |
| data.lastMessage.senderId | integer(uint) | 发送者用户ID |
| data.lastMessage.createdAt | string(date-time) | 创建时间 |
| data.updatedAt | integer(int64) | 更新时间（Unix秒） |

响应示例:
```json
{
  "code": 0,
  "data": {
    "id": "1001_1002",
    "peerId": 1001,
    "unread": 1,
    "lastMessage": {
      "msgId": "65e8c7a0f1a2b3c4d5e6f789",
      "type": "text",
      "preview": "你好，在吗？",
      "senderId": 1001,
      "createdAt": "2024-06-01T12:00:00Z"
    },
    "updatedAt": 1
  },
  "msg": "创建成功"
}
```

## [DELETE] 删除会话

- 接口路径: DELETE /common/chat/conversations
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 删除与指定用户的会话（需登录；会硬删除该会话及其消息记录）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| peerId | body | integer | 是 | 对方用户ID |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | object | 响应数据 |

响应示例:
```json
{
  "code": 0,
  "data": {},
  "msg": "删除成功"
}
```

## [GET] 私信消息列表

- 接口路径: GET /common/chat/messages
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 获取与指定用户的私信消息（需登录，固定返回10条，按 before 游标向前翻页）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| peerId | query | integer | 是 | 对方用户ID |
| before | query | string | 否 | 游标（ObjectID Hex，取上一页返回的 nextBefore） |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | ChatMessageListResult | - |
| data.list | array<ChatMessage> | 消息列表（旧->新） |
| data.list[].id | string | 消息ID（ObjectID Hex） |
| data.list[].conversationId | string | 会话ID（minUserId_maxUserId） |
| data.list[].senderId | integer(uint) | 发送者用户ID |
| data.list[].receiverId | integer(uint) | 接收者用户ID |
| data.list[].type | string | 消息类型 |
| data.list[].text | string | 文本内容（type=text） |
| data.list[].emoji | string | emoji（type=emoji） |
| data.list[].media | ChatMessageMedia | - |
| data.list[].media.url | string | 资源URL |
| data.list[].media.mime | string | MIME类型 |
| data.list[].media.width | integer | 宽度 |
| data.list[].media.height | integer | 高度 |
| data.list[].media.size | integer(int64) | 文件大小（字节） |
| data.list[].createdAt | string(date-time) | 创建时间 |
| data.nextBefore | string | 下一页游标（用于 before 参数） |
| data.hasMore | boolean | 是否还有更多 |

响应示例:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "65e8c7a0f1a2b3c4d5e6f789",
        "conversationId": "1001_1002",
        "senderId": 1001,
        "receiverId": 1001,
        "type": "text",
        "text": "text",
        "emoji": "text",
        "media": {
          "url": "https://example.com/page",
          "mime": "image/png",
          "width": 1,
          "height": 1,
          "size": 1
        },
        "createdAt": "2024-06-01T12:00:00Z"
      }
    ],
    "nextBefore": "2024-06-01T12:00:00Z",
    "hasMore": true,
    "total": 1
  },
  "msg": "获取成功"
}
```

## [PUT] 私信标记已读

- 接口路径: PUT /common/chat/read
- 认证: 需要登录（客户端全局自动携带 Token）
- 依赖接口: 无
- 接口说明: 标记与指定用户的私信为已读（需登录，红点清零）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| peerId | body | integer | 是 | 对方用户ID |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | object | 响应数据 |

响应示例:
```json
{
  "code": 0,
  "data": {},
  "msg": "标记成功"
}
```
