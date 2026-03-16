# 站点管理

分类说明：站点配置与统计、心跳/打点

Base URL：/v1

## [GET] 获取QQ登录URL

- 接口路径: GET /common/site/qq-url
- 认证: 无需登录
- 依赖接口: 无
- 接口说明: 获取QQ OAuth登录跳转URL
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | string | QQ登录跳转URL |

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
- 接口说明: 获取站点公开配置（普通用户接口，会返回脱敏后的 `data.site.storage`）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
- 无

说明:
- 前端应以本接口返回的配置项判断是否需要展示验证码组件以及是否需要在后续请求中提交验证码字段
- 注册相关验证码开关查看 `data.site.register.*`
- 登录相关验证码开关查看 `data.site.login.*`
- `data.site.storage` 仅返回上传限额相关字段，`chunkDir`、`local`、`minio` 不返回

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | object | - |
| data.site | PublicSiteConfig | 普通用户可见的站点公开配置 |
| data.site.contentReview | AdminSiteContentReviewConfig | - |
| data.site.contentReview.enable | boolean | 是否开启内容审核 |
| data.site.login | AdminSiteLoginConfig | - |
| data.site.login.qqLogin | boolean | 是否开启QQ登录 |
| data.site.login.usernamePwdLogin | boolean | 是否开启用户名密码登录 |
| data.site.login.textGraphicCaptcha | boolean | 是否开启文本图形验证码登录 |
| data.site.login.textClickCaptcha | boolean | 是否开启文本点击验证码登录 |
| data.site.login.textClickCaptchaTTL | integer | 文本点击验证码有效期(秒) |
| data.site.login.textClickCaptchaPadding | integer | 文本点击验证码容错像素 |
| data.site.register | AdminSiteRegisterConfig | - |
| data.site.register.emailCaptcha | boolean | 是否开启邮箱验证码注册 |
| data.site.register.textGraphicCaptcha | boolean | 是否开启文本图形验证码注册 |
| data.site.register.slideCaptcha | boolean | 是否开启滑块验证码注册 |
| data.site.register.slideCaptchaTTL | integer | 滑块验证码有效期(秒) |
| data.site.register.slideCaptchaPadding | integer | 滑块验证码容错像素 |
| data.site.storage | object | 存储配置（仅返回上传限额相关字段） |
| data.site.storage.maxChunkSize | integer(int64) | 单个分片大小上限（MB） |
| data.site.storage.chunkSize | integer(int64) | 默认分片大小（MB） |
| data.site.storage.maxFileSize | integer(int64) | 单文件大小上限（MB） |
| data.site.storage.maxUploadNum | integer(int) | 单次最多上传文件数 |

响应示例:
```json
{
  "code": 0,
  "data": {
    "site": {
      "contentReview": {
        "enable": true
      },
      "login": {
        "qqLogin": true,
        "usernamePwdLogin": true,
        "textGraphicCaptcha": true,
        "textClickCaptcha": true,
        "textClickCaptchaTTL": 1,
        "textClickCaptchaPadding": 1
      },
      "register": {
        "emailCaptcha": true,
        "textGraphicCaptcha": true,
        "slideCaptcha": true,
        "slideCaptchaTTL": 1,
        "slideCaptchaPadding": 1
      },
      "storage": {
        "maxChunkSize": 10,
        "chunkSize": 10,
        "maxFileSize": 100,
        "maxUploadNum": 10
      }
    }
  },
  "msg": "获取成功"
}
```

## [POST] 站点打点

- 接口路径: POST /common/site/stat/touch
- 认证: 可选登录（客户端可携带 Token）
- 依赖接口: 无
- 接口说明: 增加站点流量（PV）并统计今日UV（含游客）；若已登录则当日首次打点时发放登录经验
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | SiteTouchResult | - |
| data.pv | integer(int64) | 今日PV |
| data.uv | integer(int64) | 今日UV（含游客与登录用户） |
| data.online | integer(int64) | 在线人数（5分钟窗口） |

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
- 接口说明: 维护UV与在线人数，不增加PV（支持游客）
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
- 无

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | SiteHeartbeatResult | - |
| data.uv | integer(int64) | 今日UV（含游客与登录用户） |
| data.online | integer(int64) | 在线人数（5分钟窗口） |

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
