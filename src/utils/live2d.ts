import type { Options } from 'oh-my-live2d'

const OML2D_VERSION = '0.19.3'
const OML2D_VERSION_CHECK_URL = 'https://unpkg.com/oh-my-live2d@latest/package.json'
const ICONFONT_SYMBOL_URL = 'https://at.alicdn.com/t/c/font_4899528_0o2rmtnxrhll.js'
const LIVE2D_MODEL_BASE = 'https://registry.npmmirror.com/oml2d-models/latest/files/models'

type Live2dWindow = Window &
  typeof globalThis & {
    __bilibiliLive2dBooted?: boolean
    __bilibiliLive2dIconfontBooted?: boolean
  }

const live2dOptions: Options = {
  dockedPosition: 'right',
  primaryColor: '#f472b6',
  mobileDisplay: false,
  sayHello: false,
  models: [
    {
      path: `${LIVE2D_MODEL_BASE}/Pio/model.json`,
      scale: 0.4,
      position: [0, 50],
      stageStyle: {
        height: 300,
      },
    },
    {
      path: `${LIVE2D_MODEL_BASE}/shizuku/shizuku.model.json`,
      scale: 0.22,
      position: [0, 36],
      stageStyle: {
        height: 320,
      },
    },
    {
      path: `${LIVE2D_MODEL_BASE}/Senko_Normals/senko.model3.json`,
      scale: 0.12,
      position: [0, 50],
    },
  ],
  menus: {
    items: (defaultItems) => [
      {
        id: 'Chat',
        icon: 'icon-chat',
        title: '聊天',
        onClick: () => {
          window.dispatchEvent(new CustomEvent('oml2d:open-chat'))
        },
      },
      ...defaultItems.filter((item) => item.id !== 'About'),
    ],
  },
  tips: {
    idleTips: {
      wordTheDay: false,
      message: ['准备继续看点什么？', '需要聊天时点我就好。', '新的灵感也可以从一条弹幕开始。'],
      duration: 4200,
      interval: 12000,
    },
  },
}

const getClientWindow = () => {
  if (typeof window === 'undefined') return null
  return window as Live2dWindow
}

const loadIconfontSymbol = () => {
  const clientWindow = getClientWindow()
  if (!clientWindow || clientWindow.__bilibiliLive2dIconfontBooted) return

  clientWindow.__bilibiliLive2dIconfontBooted = true

  const script = document.createElement('script')
  script.src = ICONFONT_SYMBOL_URL
  script.async = true
  script.crossOrigin = 'anonymous'
  script.onerror = () => {
    clientWindow.__bilibiliLive2dIconfontBooted = false
  }
  document.head.append(script)
}

const getRequestUrl = (input: RequestInfo | URL) => {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

const guardOml2dVersionCheck = () => {
  const clientWindow = getClientWindow()
  if (!clientWindow) return () => {}

  const originalFetch = clientWindow.fetch.bind(clientWindow)
  const guardedFetch: typeof window.fetch = (input, init) => {
    if (getRequestUrl(input) === OML2D_VERSION_CHECK_URL) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: OML2D_VERSION }), {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      )
    }

    return originalFetch(input, init)
  }

  clientWindow.fetch = guardedFetch

  return () => {
    if (clientWindow.fetch === guardedFetch) {
      clientWindow.fetch = originalFetch
    }
  }
}

const scheduleAfterFirstPaint = (task: () => void) => {
  const clientWindow = getClientWindow()
  if (!clientWindow) return

  if (typeof clientWindow.requestIdleCallback === 'function') {
    clientWindow.requestIdleCallback(task, { timeout: 2500 })
    return
  }

  clientWindow.setTimeout(task, 1200)
}

const loadLive2d = async () => {
  const clientWindow = getClientWindow()
  if (!clientWindow) return

  loadIconfontSymbol()
  const restoreFetch = guardOml2dVersionCheck()

  try {
    const { loadOml2d } = await import('oh-my-live2d')
    loadOml2d(live2dOptions)
  } catch (error) {
    console.warn('[live2d] failed to initialize', error)
  } finally {
    clientWindow.setTimeout(restoreFetch, 0)
  }
}

export const initLive2d = () => {
  const clientWindow = getClientWindow()
  if (!clientWindow || clientWindow.__bilibiliLive2dBooted) return

  clientWindow.__bilibiliLive2dBooted = true
  scheduleAfterFirstPaint(() => {
    void loadLive2d()
  })
}
