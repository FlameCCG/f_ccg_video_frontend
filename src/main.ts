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

// 立即让 Vue 接管静态启动占位。初始异步路由的等待、超时与失败状态由 App.vue
// 统一收口；若在这里 await router.isReady()，任一分包加载异常都会让 index.html
// 的占位永久留在页面上，看起来像“随机卡死在骨架屏”。
app.mount('#app')
