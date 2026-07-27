import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import router from './router'
import 'vue-sonner/style.css'
// Tailwind 必须走纯 CSS 入口，否则 utility（flex/grid 等）不会生成
import './assets/styles/tailwind.css'
import './assets/styles/main.scss'

const app = createApp(App)

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

// 初始导航包含异步 layout / view。等待它解析完再挂载，避免 RouterView
// 先渲染一次空内容，露出 body 背景形成刷新时的“黑屏”。
await router.isReady()
app.mount('#app')
