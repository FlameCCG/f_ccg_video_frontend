import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

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
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
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
