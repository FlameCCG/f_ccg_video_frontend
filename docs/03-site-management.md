# 站点管理

分类说明：站点配置与统计、心跳/打点

Base URL：/v1

## [GET] 获取 QQ 登录 URL

- 接口路径: GET /common/site/qq-url
- 认证: 无需登录
- 依赖接口: 无
- 接口说明: 获取 QQ OAuth 登录跳转 URL
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:

- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | string | QQ 登录跳转 URL |

响应示例:

```json
{
  "code": 0,
  "data": "https://example.com/page",
  "msg": "获取成功"
}
```

## [GET] 获取站点配置

- 接口路径: GET /common/site/config
- 认证: 无需登录
- 依赖接口: 无
- 接口说明: 获取站点公开配置（不返回存储敏感信息）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:

- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | object | - |
| data.site | SiteConfig | 站点配置 |

响应示例:

```json
{
  "code": 0,
  "data": {
    "site": {
      "login": {
        "qqLogin": true,
        "usernamePwdLogin": true,
        "textGraphicCaptcha": false,
        "textClickCaptcha": false,
        "textClickCaptchaTTL": 300,
        "textClickCaptchaPadding": 20
      },
      "register": {
        "emailCaptcha": false,
        "textGraphicCaptcha": false,
        "slideCaptcha": false,
        "slideCaptchaTTL": 300,
        "slideCaptchaPadding": 10
      },
      "storage": {
        "maxChunkSize": 20,
        "chunkSize": 10,
        "maxFileSize": 100,
        "maxUploadNum": 10
      },
      "contentReview": {
        "enable": false
      }
    }
  },
  "msg": "ok"
}
```

## [POST] 站点打点

- 接口路径: POST /common/site/stat/touch
- 认证: 可选登录（客户端可携带 Token）
- 依赖接口: 无
- 接口说明: 增加站点流量（PV）并统计今日 UV（含游客）；若已登录则当日首次打点时发放登录经验
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:

- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | SiteTouchResult | - |
| data.pv | integer(int64) | 今日 PV |
| data.uv | integer(int64) | 今日 UV（含游客与登录用户） |
| data.online | integer(int64) | 在线人数（5 分钟窗口） |

响应示例:

```json
{
  "code": 0,
  "data": {
    "pv": 1,
    "uv": 1,
    "online": 1
  },
  "msg": "打点成功"
}
```

## [POST] 在线心跳

- 接口路径: POST /common/site/stat/heartbeat
- 认证: 可选登录（客户端可携带 Token）
- 依赖接口: 无
- 接口说明: 维护 UV 与在线人数，不增加 PV（支持游客）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:

- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | SiteHeartbeatResult | - |
| data.uv | integer(int64) | 今日 UV（含游客与登录用户） |
| data.online | integer(int64) | 在线人数（5 分钟窗口） |

响应示例:

```json
{
  "code": 0,
  "data": {
    "uv": 1,
    "online": 1
  },
  "msg": "心跳成功"
}
```
