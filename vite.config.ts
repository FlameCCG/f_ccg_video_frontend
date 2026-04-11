import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { oml2d } from 'vite-plugin-oh-my-live2d'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    oml2d({
      dockedPosition: 'right',
      primaryColor: '#f472b6',
      mobileDisplay: false,
      models: [
        {
          path: '/live2d-models/cat-black/model.json',
          scale: 0.15,
          position: [0, 20],
          stageStyle: {
            height: 350,
          },
        },
        {
          path: '/live2d-models/Pio/model.json',
          scale: 0.4,
          position: [0, 50],
          stageStyle: {
            height: 300,
          },
        },
      ],
      tips: {
        idleTips: {
          wordTheDay: true,
        },
      },
    }),
  ],
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
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/videos': {
        target: 'http://localhost:9000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
})
