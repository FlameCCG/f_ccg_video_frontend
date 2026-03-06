# Bilibili 视频平台前端 - 开发规范

## 角色分工 (三 Agent 流水线)

```
┌─────────────────────────────────────────────────────────┐
│  主 Agent (Composer 1.5) — 架构 / DOM / API 对接 / 编排     │
│  职责: 读 tasks.md → 写 Vue 组件骨架+逻辑+API 调用      │
│        → 跑 lint/typecheck → 派发子 Agent                │
└─────────────┬───────────────────────────┬───────────────┘
              │ ① 完成 DOM + API 后       │ ② 样式完成后
              ▼                           ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ 样式 Agent (gemini-3.1-pro) │ │ 测试 Agent (gpt-5.4-medium)  │
│ subagent: css-artisan        │ │ subagent: e2e-playwright-test│
│ 输入: 组件路径+设计要求      │ │ 输入: 页面URL+验收清单       │
│ 范围: Tailwind class + CSS   │ │ 输出: PASS/FAIL + issue.md   │
│ 可改: <template> class 属性  │ │                              │
│       <style> 块             │ │                              │
│ 禁改: DOM 结构 / JS 逻辑    │ │                              │
└──────────────────────────────┘ └──────────────────────────────┘
```

### 执行顺序 (严格)

每个功能模块（如 tasks.md 中的一个 Task 组）：

1. **主 Agent** 编写 DOM 骨架 + TypeScript 逻辑 + API 对接
   - 跑通 `pnpm -s lint && pnpm prettier && pnpm -s typecheck && pnpm -s stylelint`
   - 确保 `pnpm dev` 能启动且页面可访问
2. **派发样式 Agent** (subagent_type=`css-artisan`, model 指定 Gemini 3.1 Pro)
   - 传入：需要美化的组件文件路径列表 + 设计上下文（参考 ui-ux-pro-max 设计系统）
   - 样式 Agent 可修改：`<template>` 中的 Tailwind class 属性、`<style>` 块
   - 样式 Agent 禁止修改：DOM 结构（标签嵌套）、`<script>` 逻辑代码
   - 等待返回，检查 lint 无报错
3. **派发测试 Agent** (subagent_type=`e2e-playwright-test`, model 指定 gpt-5.4-medium)
   - 传入：测试的页面 URL + 验收清单（从 tasks.md Requirements 提取）
   - 等待返回测试报告
4. **如果测试 FAIL**：主 Agent 根据 issue.md 修复 → 重跑步骤 2-3（最多重试 3 次）
5. **如果重试 3 次仍 FAIL**：记录到 issue.md 标记为 🟡 待排查，继续下一个 Task
6. **全部 PASS**：Git 提交（Angular 规范、中文 body）

### 子 Agent 派发模板

#### 派发样式 Agent

```
请美化以下 Vue 组件的样式:

组件路径:
- src/views/xxx/Xxx.vue
- src/components/xxx/Xxx.vue

设计上下文:
- 项目: 仿 Bilibili 视频平台
- 技术栈: Vue 3 + shadcn-vue + Tailwind CSS
- 主题色: Bilibili 蓝 (#00a1d6)
- 要求: 参考 ui-ux-pro-max 设计系统，bilibili 风格，响应式适配

修改范围:
- ✅ 可改: <template> 中的 Tailwind class 属性
- ✅ 可改: <style> 块 (CSS Variables、动画、过渡)
- ❌ 禁改: DOM 标签结构 (不增删改标签嵌套)
- ❌ 禁改: <script> 中的任何逻辑代码
```

#### 派发测试 Agent

```
请对以下页面进行 E2E 自动化测试:

测试目标:
- 页面 URL: http://localhost:5173/xxx
- 测试账号: flame / 123 (验证码已禁用)

验收清单:
1. 页面渲染: [具体元素是否显示]
2. 交互测试: [具体操作和预期结果]
3. API 验证: [需要验证的接口调用]
4. 错误检查: 控制台无 Error 级别日志

使用 Playwright MCP 工具执行测试。
测试结果写入 issue.md（仅记录失败项），PASS 则回复 "ALL PASS"。
```

---

## 技术栈约束

### 必须使用
- Vue 3 + TypeScript + Vite
- shadcn-vue (UI 组件库)
- ArtPlayer + artplayer-plugin-danmuku (视频播放器)
- Tailwind CSS + CSS Variables (样式)
- Pinia + pinia-plugin-persistedstate (状态管理)
- Lucide Icons (图标)

### 按需引入
- VeeValidate + Zod (复杂表单验证场景，如上传投稿表单)

### 禁止使用
- Element Plus (太重，难定制)
- 自己实现视频播放器
- Vitest/Jest 等单元测试框架
- SASS/SCSS/Less (用 Tailwind CSS + CSS Variables 即可)

## API 文档

- 位置: `docs/01-10-*.md`
- Base URL: `http://localhost:8080/v1`
- 测试账号: flame / 123 (验证码已禁用)
- Token 格式: `Authorization: Bearer {accessToken}`

### 响应格式
HTTP 状态码始终返回 200，业务状态通过 code 字段判断：
```json
{
  "code": 0,      // 0=成功, 1=失败
  "msg": "...",   // 错误信息 (code=1 时)
  "data": {}      // 业务数据 (code=0 时)
}
```

错误处理：检查 `code === 1` 时提取 `msg` 显示 Toast 提示。

## Git 提交规范

Angular format，中文 body：
```
feat(video): 添加视频播放器组件

做了什么: 集成 ArtPlayer，支持多清晰度切换
影响范围: src/components/player/
关键接口: GET /common/video/detail
```

小原子提交，每个功能点独立提交。

## 代码质量检查

每次提交前执行:
```bash
pnpm -s lint && pnpm prettier && pnpm -s typecheck && pnpm -s stylelint
```

---

## 测试策略 (Playwright MCP)

**所有页面测试均使用 Playwright MCP**，不再使用 Chrome DevTools MCP。

测试分两类:
- **Playwright MCP**: 页面交互测试、UI 验证、文件上传（支持 `browser_file_upload`）
- **不写单元测试**

### Playwright MCP 工具速查

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `browser_navigate` | 打开页面 | `url` |
| `browser_snapshot` | 获取页面结构 (获取元素 ref) | `filename?` |
| `browser_click` | 点击元素 | `ref`, `element?` |
| `browser_fill_form` | 填写表单 | `fields: [{name, type, ref, value}]` |
| `browser_type` | 在元素中输入文本 | `ref`, `text`, `submit?`, `slowly?` |
| `browser_wait_for` | 等待文本出现/消失/延时 | `text?`, `textGone?`, `time?` |
| `browser_network_requests` | 获取网络请求列表 | `includeStatic` |
| `browser_console_messages` | 获取控制台日志 | `level` (error/warning/info/debug) |
| `browser_take_screenshot` | 截图 | `type`, `filename?`, `fullPage?` |
| `browser_file_upload` | 上传文件 | `paths: [绝对路径]` |
| `browser_evaluate` | 执行 JavaScript | `function` |
| `browser_run_code` | 执行 Playwright 代码片段 | `code` (完整 async function) |
| `browser_press_key` | 按键 | `key` |
| `browser_hover` | 悬停元素 | `ref` |
| `browser_select_option` | 选择下拉选项 | `ref`, `value` |
| `browser_resize` | 调整窗口大小 | `width`, `height` |
| `browser_close` | 关闭页面 | — |

### 标准测试流程

```
1. browser_navigate → http://localhost:5173/目标页面
2. browser_snapshot → 获取页面结构和元素 ref
3. browser_fill_form / browser_click / browser_type → 执行交互
4. browser_wait_for → 等待页面响应 (text 出现或 textGone 消失)
5. browser_snapshot → 验证交互结果
6. browser_network_requests → 验证 API 调用 (includeStatic=false)
7. browser_console_messages → 检查控制台错误 (level="error")
8. browser_take_screenshot → 截图保存证据
```

### 登录测试示例

```
1. browser_navigate → http://localhost:5173/login
2. browser_snapshot → 获取表单元素 ref
3. browser_fill_form → [{name:"用户名", type:"textbox", ref:"REF", value:"flame"},
                        {name:"密码", type:"textbox", ref:"REF", value:"123"}]
4. browser_click → ref=登录按钮的ref
5. browser_wait_for → text="首页" 或等待跳转
6. browser_network_requests → 验证 POST /common/user/login/pwd 返回 200
7. browser_console_messages → level="error" 应为空
```

### 文件上传测试

Playwright MCP 支持本地文件上传，无需脚本替代:
```
1. browser_navigate → http://localhost:5173/upload
2. browser_snapshot → 获取上传区域元素 ref
3. browser_click → 点击上传按钮 (触发文件选择器)
4. browser_file_upload → paths=["/绝对路径/test-video.mp4"]
5. browser_wait_for → text="上传完成" 或进度条出现
6. browser_network_requests → 验证 POST /common/video/upload/chunk 调用
```

---

## MCP 使用场景

### Playwright (页面测试 + E2E)
所有页面交互测试和 UI 验证均通过 Playwright MCP 完成，详见上方测试策略。

### context7 (库文档查询)
用于查询技术栈相关文档：
- `resolve-library-id`: 搜索库 ID (如 vue, artplayer, shadcn)
- `query-docs`: 查询具体用法

使用场景：
- ArtPlayer 配置和插件用法
- shadcn-vue 组件 API
- Tailwind CSS 类名
- Pinia 状态管理模式
- VeeValidate + Zod 表单验证

### fetch (网页获取)
用于获取外部资源：
- 查阅官方文档
- 获取 API 参考
- 下载配置模板

---

## UI/UX 规范
详见 `.cursor/skills/ui-ux-pro-max/SKILL.md`，由样式 Agent (Gemini 3.1 Pro) 执行。

## 目录结构

```
src/
├── api/          # API 封装 (按模块: user.ts, video.ts, comment.ts ...)
├── assets/       # 静态资源 (styles/, images/)
├── components/   # 通用组件 (ui/, layout/, common/, player/, comment/ ...)
├── composables/  # 组合式函数 (useChunkUpload, useChatWebSocket ...)
├── layouts/      # 布局组件 (MainLayout.vue)
├── lib/          # 第三方库工具封装 (utils.ts)
├── router/       # 路由配置
├── stores/       # Pinia stores (auth.ts, video.ts, theme.ts ...)
├── types/        # TypeScript 类型定义 (api.d.ts, components.d.ts ...)
├── utils/        # 业务工具函数 (hash.ts, format.ts ...)
└── views/        # 页面视图 (按模块分目录: home/, video/, user/ ...)
```

## Bug 追踪

测试 Agent 发现的 bug 记录到 `issue.md`，格式如下:
```markdown
## [模块名] Bug 描述
- **页面**: /xxx
- **复现步骤**: 1. ... 2. ... 3. ...
- **预期结果**: ...
- **实际结果**: ...
- **截图**: (如有)
- **API 异常**: (如有，附 network request 信息)
- **控制台错误**: (如有)
- **状态**: 🔴 未修复 / 🟡 待排查 (重试 3 次仍失败) / 🟢 已修复
```

---

## 完整开发循环 (每个 Task)

```
┌────────────────────────────────────────────────────────────┐
│ 1. 主 Agent 阅读 tasks.md 中当前 Task 的需求               │
│ 2. 主 Agent 阅读 docs/*.md 中相关 API 文档                 │
│ 3. 主 Agent 编写:                                          │
│    - API 封装 (src/api/)                                   │
│    - 路由配置 (src/router/)                                │
│    - Store (src/stores/)                                   │
│    - Vue 组件 DOM + 逻辑 (src/views/ + src/components/)    │
│ 4. 主 Agent 跑 lint + typecheck，修复所有错误               │
│ 5. 主 Agent 确认 pnpm dev 正常，页面可访问                  │
├──────────────────────────── ↓ ──────────────────────────────┤
│ 6. 派发样式 Agent (Gemini 3.1 Pro)                         │
│    - 输入: 组件路径列表 + 设计上下文                         │
│    - 样式 Agent 读取 ui-ux-pro-max 设计系统                 │
│    - 样式 Agent 优化 Tailwind class / CSS Variables         │
│    - 输出: 美化后的组件 (仅改样式，不改逻辑)                 │
├──────────────────────────── ↓ ──────────────────────────────┤
│ 7. 主 Agent 验证样式改动无 lint 错误                        │
├──────────────────────────── ↓ ──────────────────────────────┤
│ 8. 派发测试 Agent (subagent: e2e-playwright-test)            │
│    - 输入: 页面 URL + 验收清单 (从 Requirements 提取)       │
│    - 测试 Agent 用 Playwright MCP 执行 E2E 测试             │
│    - 输出: ALL PASS / FAIL (写入 issue.md)                  │
├──────────────────────────── ↓ ──────────────────────────────┤
│ 9. 如果 FAIL → 主 Agent 修复 → 跳回步骤 5 (最多重试 3 次)  │
│ 10. 如果重试 3 次仍 FAIL → 记录 issue.md 🟡 → 继续下一 Task│
│ 11. 如果 PASS → Git 提交 (Angular 规范)                    │
│ 12. 标记 tasks.md 中对应 Task 为 [x]                       │
│ 13. 进入下一个 Task，循环                                   │
└────────────────────────────────────────────────────────────┘
```
