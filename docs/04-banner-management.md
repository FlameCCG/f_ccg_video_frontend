# 轮播图管理

分类说明：轮播图获取与展示

Base URL：/v1

## [GET] 轮播图列表

- 接口路径: GET /common/banner/list
- 认证: 无需登录
- 依赖接口: 无
- 接口说明: 获取可展示的轮播图列表
- HTTP 状态码: 200（业务码 code 判断成功/失败）
- 响应结构: code=0 成功，code=1 失败；msg 为提示信息

请求参数:
| 名称 | 位置 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| type | query | integer | 否 | 轮播图类型（1首页轮播 2顶部横幅 3用户主页横幅） 可选: 1/2/3 |

响应字段:
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| data | array<BannerItem> | - |
| data[].id | integer(uint) | 轮播图ID |
| data[].cover | string | 图片链接 |
| data[].href | string | 跳转链接 |
| data[].show | boolean | 是否显示 |
| data[].type | integer | 轮播图类型（1首页轮播 2顶部横幅 3用户主页横幅） |

响应示例:
```json
{
  "code": 0,
  "data": [
    {
      "id": 6001,
      "cover": "https://cdn.example.com/cover/2001.jpg",
      "href": "https://example.com/page",
      "show": true,
      "type": 1
    }
  ],
  "msg": "获取成功"
}
```
