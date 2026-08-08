/// <reference types="vite/client" />
import 'axios'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_DEV_PROXY_TARGET?: string
  /** 媒体资源 host；留空 = 同源（走网关/代理）。 */
  readonly VITE_MEDIA_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 不弹出 toast */
    silent?: boolean
    /** 瞬时网络/代理失败已重试次数（内部使用） */
    _retryCount?: number
  }
}
