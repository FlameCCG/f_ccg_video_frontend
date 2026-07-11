import http from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 复用 keep-alive 连接，减轻 Windows 下页面并发打满时
// Vite http-proxy 偶发 ECONNRESET / 空 body 500 的问题。
const backendAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 64,
  maxFreeSockets: 16,
  scheduling: 'lifo',
})

const backendTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/v1': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        // 后端慢查询（如审核稿详情）时避免代理过早断开
        timeout: 60_000,
        proxyTimeout: 60_000,
        agent: backendAgent,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[vite proxy → ${backendTarget}]`, message)

            // 把“连不上后端”变成明确 JSON，而不是空 body 的 500 text/plain
            if (
              res &&
              'writeHead' in res &&
              typeof res.writeHead === 'function' &&
              !('headersSent' in res && res.headersSent)
            ) {
              const body = JSON.stringify({
                code: 1,
                data: {},
                msg: `开发代理无法连接后端(${backendTarget})，请确认后端已启动后刷新`,
              })
              res.writeHead(502, {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Vite-Proxy-Error': '1',
              })
              res.end(body)
            }
          })

          proxy.on('proxyReq', (proxyReq) => {
            // 避免上游 keep-alive 半开连接导致偶发失败
            proxyReq.setHeader('Connection', 'keep-alive')
          })
        },
      },
    },
  },
  dev: {
    sourcemap: {
      js: false,
      css: false,
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Split the heavy leaf libraries into their own chunks so they are
        // fetched only by the routes/features that need them and cache well.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
            if (id.includes('dashjs')) return 'dashjs'
            if (id.includes('highlight.js')) return 'highlight'
            if (id.includes('marked') || id.includes('dompurify')) return 'markdown'
            if (id.includes('artplayer')) return 'artplayer'
          }
        },
      },
    },
  },
})
