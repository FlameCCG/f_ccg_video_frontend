import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { oml2d } from 'vite-plugin-oh-my-live2d'

const live2dModelBase = 'https://registry.npmmirror.com/oml2d-models/latest/files/models'

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
          path: `${live2dModelBase}/Pio/model.json`,
          scale: 0.4,
          position: [0, 50],
          stageStyle: {
            height: 300,
          },
        },
        {
          path: `${live2dModelBase}/shizuku/shizuku.model.json`,
          scale: 0.22,
          position: [0, 36],
          stageStyle: {
            height: 320,
          },
        },
        {
          path: `${live2dModelBase}/Senko_Normals/senko.model3.json`,
          scale: 0.12,
          position: [0, 50],
        },
      ],
      menus: {
        items: (defaultItems: unknown[]) => [
          {
            id: 'Chat',
            icon: 'icon-chat',
            title: '聊天',
            onClick: () => {
              ;(globalThis as unknown as EventTarget).dispatchEvent(new CustomEvent('oml2d:open-chat'))
            },
          },
          ...(defaultItems as { id: string; icon: string; title: string }[]).filter((i) => i.id !== 'About'),
        ],
      },
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
