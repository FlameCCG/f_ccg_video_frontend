## [视频详情页] 推荐视频列表为空

- **页面**: `/video/1`
- **复现步骤**: 1. 打开 `http://localhost:3001/video/1` 2. 等待页面加载完成 3. 查看右侧推荐视频区域
- **预期结果**: 右侧显示推荐视频列表项
- **实际结果**: 右侧显示"暂无推荐视频"
- **API 异常**: `GET /common/video/recommend?videoId=1&size=20` 返回 200 OK，后端返回空列表（无推荐数据）
- **控制台错误**: 无 Error 级别日志
- **状态**: 🟡 待排查 (后端测试数据问题，前端已正确处理空状态并正确调用API)

## [视频详情页] 控制台存在 Router Error 日志

- **页面**: `/video/1`
- **复现步骤**: 1. 打开 `http://localhost:3001/video/1` 2. 等待页面加载完成 3. 检查浏览器控制台
- **预期结果**: 页面控制台无 Error 级别日志（忽略 WebSocket 连接异常）
- **实际结果**: 控制台出现多条 `Vue Router warn`，内容为 `No match found for location with path "/partition/*"`
- **截图**: `test-video-danmu-area.png`
- **API 异常**: 无，`GET /common/video/danmu/room/list?videoId=1&pageSize=5000` 已正常调用并返回 200
- **控制台错误**: `[Vue Router warn]: No match found for location with path "/partition/2"` 等多条同类错误
- **状态**: 🔴 未修复
