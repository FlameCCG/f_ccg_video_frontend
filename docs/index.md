# Client 接口与联调

当前后端为 `../../f_ccg_video_back_ddd`。接口路径保持 `/v1/common/*`，业务成功以响应体 `code === 0` 为准。

接口说明统一维护在 [DDD 后端用户 API 文档](../../f_ccg_video_back_ddd/docs/openapi-md/user/index.md)，完整定义见 [OpenAPI](../../f_ccg_video_back_ddd/docs/openapi.yaml)。本目录不再保留重复的分模块文档。

开发时在 `f_ccg_video_back_ddd` 目录运行 `go run ./cmd/server -f config_dev.yaml`，在 client 目录运行 `pnpm dev`。后端依赖及配置见 [DDD 架构说明](../../f_ccg_video_back_ddd/docs/architecture.md)与 [配置示例](../../f_ccg_video_back_ddd/config.example.yaml)。

Vite 默认将 `/v1`、`/uploads` 转发到 `http://127.0.0.1:8080`，将 `/user_files`、`/images`、`/covers` 转发到 MinIO 桶 `http://127.0.0.1:9002/videos`（保留对象路径）。如 DDD 后端使用其他地址，在 `.env.development.local` 中设置 `VITE_DEV_PROXY_TARGET` 并重启 Vite；MinIO 代理可通过 `VITE_MEDIA_MINIO_TARGET` 调整。`VITE_API_BASE` 默认使用同源 `/v1`，直接连接后端时需配置后端 CORS。生产网关也需转发这些公开媒体前缀，或设置 `VITE_MEDIA_BASE` 指向媒体服务。

接口连通性可检查 `GET /v1/common/site/config`、`GET /v1/common/video/home?page=1&pageSize=20`、`GET /v1/common/video/partitions`、`GET /v1/common/banner/list` 和 `POST /v1/common/site/stat/touch`。需要同时检查 HTTP 状态及响应体业务码。

2026-10-18 核查时，本机 8080 端口没有后端服务监听；当前 DDD 路由源码已注册上述接口。历史 `issue.md` 中的 404/403 记录不能作为当前运行结论，真实登录与视频播放仍需启动后端及其依赖后联调。
