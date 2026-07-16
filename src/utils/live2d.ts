import type { Options, Oml2dMethods, Oml2dProperties } from 'oh-my-live2d'

const OML2D_VERSION = '0.19.3'
const OML2D_VERSION_CHECK_URL = 'https://unpkg.com/oh-my-live2d@latest/package.json'
const ICONFONT_SYMBOL_URL = 'https://at.alicdn.com/t/c/font_4899528_0o2rmtnxrhll.js'
const LIVE2D_MODEL_BASE = 'https://registry.npmmirror.com/oml2d-models/latest/files/models'
/** 首屏后再启动，避免与首页关键渲染抢主线程 */
const LIVE2D_BOOT_DELAY = 4500

type Live2dInstance = Oml2dProperties & Oml2dMethods

type Live2dWindow = Window &
  typeof globalThis & {
    __bilibiliLive2dBooted?: boolean
    __bilibiliLive2dIconfontBooted?: boolean
    __bilibiliLive2dPaused?: boolean
  }

/** 单模型启动，避免同时下载/初始化多个模型造成首现卡顿 */
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

let oml2dInstance: Live2dInstance | null = null
let pauseDepth = 0

const getClientWindow = () => {
  if (typeof window === 'undefined') return null
  return window as Live2dWindow
}

const getOmlRoot = (): HTMLElement | null => {
  return (
    document.getElementById('oml2d') ||
    document.querySelector<HTMLElement>('[id^="oml2d"]') ||
    document.querySelector<HTMLElement>('.oml2d')
  )
}

const applyHiddenStyle = (el: HTMLElement, hidden: boolean) => {
  if (hidden) {
    el.dataset.aiHidden = '1'
    el.style.setProperty('visibility', 'hidden')
    el.style.setProperty('pointer-events', 'none')
    el.style.setProperty('opacity', '0')
    return
  }
  if (el.dataset.aiHidden === '1') {
    el.style.removeProperty('visibility')
    el.style.removeProperty('pointer-events')
    el.style.removeProperty('opacity')
    delete el.dataset.aiHidden
  }
}

const setOmlDomHidden = (hidden: boolean) => {
  const root = getOmlRoot()
  if (root) {
    applyHiddenStyle(root, hidden)
    return
  }

  // 根节点可能尚未挂载，退而求其次隐藏常见容器
  document.querySelectorAll<HTMLElement>('[class*="oml2d"], #oml2d-stage, #oml2d').forEach((el) => {
    applyHiddenStyle(el, hidden)
  })
}

/**
 * AI Dialog 打开时暂停 Live2D：停 idle tips + 滑出舞台 + 隐藏 DOM，
 * 避免 Pixi 持续渲染与 Dialog 合成抢帧。
 */
export const setLive2dPaused = (paused: boolean) => {
  const clientWindow = getClientWindow()
  if (!clientWindow) return

  if (paused) {
    pauseDepth += 1
    if (pauseDepth > 1) return
  } else {
    pauseDepth = Math.max(0, pauseDepth - 1)
    if (pauseDepth > 0) return
  }

  clientWindow.__bilibiliLive2dPaused = paused
  setOmlDomHidden(paused)

  const inst = oml2dInstance
  if (!inst) return

  try {
    if (paused) {
      inst.stopTipsIdle?.()
      inst.clearTips?.()
      void inst.stageSlideOut?.()
    } else {
      void inst.stageSlideIn?.()
      inst.startTipsIdle?.()
    }
  } catch (error) {
    console.warn('[live2d] pause/resume failed', error)
  }
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

  const runOnIdle = () => {
    if (typeof clientWindow.requestIdleCallback === 'function') {
      clientWindow.requestIdleCallback(task, { timeout: 3000 })
      return
    }

    clientWindow.setTimeout(task, 1500)
  }

  const schedule = () => {
    clientWindow.setTimeout(runOnIdle, LIVE2D_BOOT_DELAY)
  }

  if (document.readyState === 'complete') {
    schedule()
    return
  }

  clientWindow.addEventListener('load', schedule, { once: true })
}

const loadLive2d = async () => {
  const clientWindow = getClientWindow()
  if (!clientWindow) return

  loadIconfontSymbol()
  const restoreFetch = guardOml2dVersionCheck()

  try {
    const { loadOml2d } = await import('oh-my-live2d')
    oml2dInstance = loadOml2d(live2dOptions) as Live2dInstance

    // 若 Dialog 已打开，立刻进入暂停态
    if (clientWindow.__bilibiliLive2dPaused) {
      setOmlDomHidden(true)
      try {
        oml2dInstance.stopTipsIdle?.()
        void oml2dInstance.stageSlideOut?.()
      } catch {
        // ignore
      }
    }
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
