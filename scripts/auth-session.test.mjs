import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { compileFunction } from 'node:vm'
import test from 'node:test'
import { transformSync } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'package.json'))
const axios = require('axios')
const vue = require('vue')
const pinia = require('pinia')
const token = (label, seconds = 3600, sid = 'device-1') =>
  'header.' +
  Buffer.from(
    JSON.stringify({ uid: '7', sid, jti: label, exp: Math.floor(Date.now() / 1000) + seconds })
  ).toString('base64url') +
  '.signature'
const oldAT = token('old', -60)
const newAT = token('new')
const response = (config, data) => ({ config, status: 200, statusText: 'OK', headers: {}, data })
const ok = (config, data) => response(config, { code: 0, data, msg: 'ok' })
const denied = (config) =>
  response(config, { code: 1, data: {}, msg: 'token invalid or account unavailable' })
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))

function fixture(t) {
  const values = new Map()
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  }
  globalThis.window = new EventTarget()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} })
  const cleanup = []
  const errors = []
  const mocks = {
    'vue-sonner': { toast: { error: (message) => errors.push(message), success() {} } },
    vue: { ...vue, onBeforeUnmount: (fn) => cleanup.push(fn) },
  }
  const cache = new Map()
  const load = (file) => {
    const absolute = resolve(root, file)
    if (cache.has(absolute)) return cache.get(absolute).exports
    const mod = { exports: {} }
    cache.set(absolute, mod)
    const code = transformSync(readFileSync(absolute, 'utf8'), {
      loader: 'ts',
      format: 'cjs',
      target: 'es2022',
      define: { 'import.meta.env.VITE_API_BASE': '""' },
    }).code
    const scopedRequire = (specifier) => {
      if (mocks[specifier]) return mocks[specifier]
      if (specifier.startsWith('@/')) return load('src/' + specifier.slice(2) + '.ts')
      if (specifier.startsWith('.')) return load(resolve(dirname(absolute), specifier) + '.ts')
      return require(specifier)
    }
    compileFunction(code, ['require', 'module', 'exports'])(scopedRequire, mod, mod.exports)
    return mod.exports
  }
  const session = load('src/utils/authSession.ts')
  session.setTokens(oldAT, 'rt-old')
  let refreshes = 0
  let protectedRequests = 0
  let expired = 0
  session.setSessionExpiredHandler(() => expired++)
  let handler = async (config) => {
    if (config.url.endsWith('/login/refresh')) {
      refreshes++
      await tick()
      return ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
    }
    protectedRequests++
    return config.headers.get('Authorization') === 'Bearer ' + newAT
      ? ok(config, { accepted: true })
      : denied(config)
  }
  axios.defaults.adapter = (config) => handler(config)
  const request = load('src/api/request.ts').default
  request.defaults.adapter = (config) => handler(config)
  const scope = vue.effectScope()
  t.after(() => {
    cleanup.forEach((fn) => fn())
    scope.stop()
  })
  return {
    session,
    request,
    load,
    mocks,
    errors,
    scope,
    useHandler(fn) {
      handler = fn
    },
    counts: () => ({ refreshes, protectedRequests, expired }),
  }
}

test('HTTP 200 authentication failures share one refresh and synchronize Pinia', async (t) => {
  const f = fixture(t)
  pinia.setActivePinia(pinia.createPinia())
  const auth = f.load('src/stores/auth.ts').useAuthStore()
  const result = await Promise.all([f.request.get('/a'), f.request.get('/b'), f.request.get('/c')])
  assert.ok(result.every((item) => item.accepted))
  assert.deepEqual(f.counts(), { refreshes: 1, protectedRequests: 6, expired: 0 })
  assert.equal(auth.accessToken, newAT)
  assert.equal(auth.refreshToken, 'rt-new')
  assert.equal(localStorage.getItem('refreshToken'), 'rt-new')
})

test('request errors preserve captcha types and specific messages', async (t) => {
  const f = fixture(t)
  for (const [type, message] of [
    ['graphic', '图形验证码错误或已过期，请重新填写'],
    ['slide', '滑块验证码错误，请重新验证'],
    ['click', '文字点选验证码已过期，请重新验证'],
  ]) {
    f.useHandler(async (config) =>
      response(config, {
        code: 1,
        msg: message,
        data: { captchaType: type, captchaReason: 'invalid' },
      })
    )
    await assert.rejects(f.request.post('/common/user/login/pwd', {}), (error) => {
      assert.equal(error.message, message)
      assert.equal(error.data.captchaType, type)
      return true
    })
    assert.equal(f.errors.at(-1), message)
  }
  assert.equal(f.errors.length, 3)
})

for (const method of ['get', 'post']) {
  for (const proxyHeader of [true, false]) {
    test(`${method.toUpperCase()} proxy failures preserve transport errors (header: ${proxyHeader})`, async (t) => {
      const f = fixture(t)
      const message = '开发代理无法连接后端，请确认后端已启动后刷新'
      let attempts = 0
      let transportError
      f.useHandler(async (config) => {
        attempts++
        transportError = new axios.AxiosError('Bad Gateway', 'ERR_BAD_RESPONSE', config, null, {
          ...response(config, { code: 1, msg: message, data: {} }),
          status: 502,
          headers: proxyHeader ? { 'x-vite-proxy-error': '1' } : {},
        })
        throw transportError
      })

      await assert.rejects(
        f.request({ method, url: '/media/upload', silent: proxyHeader }),
        (error) => {
          assert.equal(error, transportError)
          assert.equal(error.response.status, 502)
          assert.equal(error.message, message)
          return true
        }
      )
      assert.equal(attempts, method === 'get' ? 2 : 1)
      assert.deepEqual(f.errors, proxyHeader ? [] : [message])
    })
  }
}

test('non-2xx captcha business errors retain their recovery metadata', async (t) => {
  const f = fixture(t)
  const { ApiBusinessError } = f.load('src/api/request.ts')
  const message = '滑块验证码错误，请重新验证'
  const data = { captchaType: 'slide', captchaReason: 'invalid' }
  f.useHandler(async (config) => {
    throw new axios.AxiosError('Bad Request', 'ERR_BAD_REQUEST', config, null, {
      ...response(config, { code: 1, msg: message, data }),
      status: 400,
    })
  })

  await assert.rejects(f.request.post('/common/user/login/pwd', {}, { silent: true }), (error) => {
    assert.ok(error instanceof ApiBusinessError)
    assert.equal(error.message, message)
    assert.deepEqual(error.data, data)
    return true
  })
  assert.deepEqual(f.errors, [])
})

test('storage login and account changes replace the profile, but same-session rotation preserves it', async (t) => {
  const f = fixture(t)
  pinia.setActivePinia(pinia.createPinia())
  let profiles = 0
  let counts = 0
  f.mocks['@/api/user'] = { getCurrentUserInfo: async () => ({ id: ++profiles }) }
  f.mocks['./notification'] = {
    useNotificationStore: () => ({ clearAllCounts() {}, fetchCounts: async () => counts++ }),
  }
  f.session.clearTokens()
  const auth = f.load('src/stores/auth.ts').useAuthStore()
  const externalLogin = (at, rt) => {
    localStorage.setItem('accessToken', at)
    localStorage.setItem('refreshToken', rt)
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'accessToken' }))
  }
  externalLogin(newAT, 'rt-1')
  assert.equal(auth.user, null)
  await tick()
  assert.equal(auth.user.id, 1)
  externalLogin(token('rotated'), 'rt-2')
  assert.equal(auth.user.id, 1)
  await tick()
  assert.equal(profiles, 1)
  externalLogin(token('other-account', 3600, 'device-2'), 'rt-other')
  assert.equal(auth.user, null)
  await tick()
  assert.equal(auth.user.id, 2)
  assert.equal(counts, 2)
  f.session.clearTokens()
  assert.equal(auth.user, null)
})

test('a profile response from the previous account cannot overwrite the new account', async (t) => {
  const f = fixture(t)
  pinia.setActivePinia(pinia.createPinia())
  let resolveOld
  const oldProfile = new Promise((resolve) => {
    resolveOld = resolve
  })
  let requests = 0
  f.mocks['@/api/user'] = {
    getCurrentUserInfo: () => (++requests === 1 ? oldProfile : Promise.resolve({ id: 8 })),
  }
  f.mocks['./notification'] = {
    useNotificationStore: () => ({ clearAllCounts() {}, fetchCounts: async () => {} }),
  }
  const auth = f.load('src/stores/auth.ts').useAuthStore()
  const oldRequest = auth.fetchUserInfo()
  await tick()
  f.session.setTokens(token('other', 3600, 'new-device'), 'other-rt')
  await tick()
  assert.equal(auth.user.id, 8)
  resolveOld({ id: 7 })
  assert.equal(await oldRequest, false)
  assert.equal(auth.user.id, 8)
})

test('site loading remains active until all overlapping config requests finish', async (t) => {
  const f = fixture(t)
  pinia.setActivePinia(pinia.createPinia())
  const replies = []
  f.mocks['@/api/site'] = { getSiteConfig: () => new Promise((resolve) => replies.push(resolve)) }
  const site = f.load('src/stores/site.ts').useSiteStore()
  const first = site.fetchConfig()
  const second = site.refreshConfig(true)
  assert.equal(site.isLoading, true)
  replies[0]({ site: {} })
  await first
  assert.equal(site.isLoading, true)
  replies[1]({ site: {} })
  await second
  assert.equal(site.isLoading, false)
})

test('HTTP 401 is recovered and an authentication retry is bounded', async (t) => {
  const f = fixture(t)
  let calls = 0,
    refreshes = 0
  f.useHandler(async (config) => {
    if (config.url.endsWith('/login/refresh')) {
      refreshes++
      return ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
    }
    calls++
    throw new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
      ...denied(config),
      status: 401,
    })
  })
  await assert.rejects(f.request.get('/private'))
  assert.equal(calls, 2)
  assert.equal(refreshes, 1)
})

test('a delayed rejection for the old AT reuses the rotated pair', async (t) => {
  const f = fixture(t)
  let release
  const blocked = new Promise((resolve) => {
    release = resolve
  })
  let refreshes = 0
  f.useHandler(async (config) => {
    if (config.url.endsWith('/login/refresh')) {
      refreshes++
      return ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
    }
    if (config.url === '/slow' && config.headers.get('Authorization') === 'Bearer ' + oldAT) {
      await blocked
      return denied(config)
    }
    return config.headers.get('Authorization') === 'Bearer ' + newAT
      ? ok(config, true)
      : denied(config)
  })
  const slow = f.request.get('/slow')
  await f.request.get('/fast')
  release()
  assert.equal(await slow, true)
  assert.equal(refreshes, 1)
})

test('an invalid RT clears credentials once for all waiting callers', async (t) => {
  const f = fixture(t)
  f.useHandler(async (config) => {
    await tick()
    return response(config, { code: 1, msg: 'refreshToken无效', data: {} })
  })
  const results = await Promise.allSettled([f.session.refreshTokens(), f.session.refreshTokens()])
  assert.ok(results.every((result) => result.status === 'rejected'))
  assert.equal(f.session.getAccessToken(), null)
  assert.equal(f.session.getRefreshToken(), null)
  assert.equal(f.counts().expired, 1)
})

test('a temporary refresh failure preserves RT and allows a later retry', async (t) => {
  const f = fixture(t)
  f.useHandler(async () => {
    throw new Error('offline')
  })
  await assert.rejects(f.session.refreshTokens(), /offline/)
  assert.equal(f.session.getRefreshToken(), 'rt-old')
  assert.equal(f.counts().expired, 0)
  f.useHandler(async (config) => ok(config, { accessToken: newAT, refreshToken: 'rt-new' }))
  assert.equal((await f.session.refreshTokens()).accessToken, newAT)
})

test('logout or another login during refresh cannot restore or overwrite credentials', async (t) => {
  const f = fixture(t)
  let release
  f.useHandler(
    (config) =>
      new Promise((resolve) => {
        release = () => resolve(ok(config, { accessToken: newAT, refreshToken: 'rt-new' }))
      })
  )
  const pending = f.session.refreshTokens()
  await tick()
  f.session.clearTokens()
  release()
  await assert.rejects(pending, /登录状态已变化/)
  assert.equal(f.session.getAccessToken(), null)

  f.session.setTokens(oldAT, 'rt-old')
  const switching = f.session.refreshTokens()
  await tick()
  const anotherAccount = token('another', 3600, 'different-session')
  f.session.setTokens(anotherAccount, 'another-rt')
  release()
  await assert.rejects(switching, /登录状态已变化/)
  assert.equal(f.session.getAccessToken(), anotherAccount)
})

test('queued browser-tab refreshes reuse the pair written by the lock holder', async (t) => {
  const f = fixture(t)
  let queue = Promise.resolve(),
    refreshes = 0
  navigator.locks = {
    request: (_name, run) => {
      const task = queue.then(run)
      queue = task.catch(() => {})
      return task
    },
  }
  f.useHandler(async (config) => {
    refreshes++
    await tick()
    return ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
  })
  const first = f.session.refreshTokens(oldAT)
  const code = transformSync(readFileSync(resolve(root, 'src/utils/authSession.ts'), 'utf8'), {
    loader: 'ts',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_BASE': '""' },
  }).code
  const mod = { exports: {} }
  compileFunction(code, ['require', 'module', 'exports'])(require, mod, mod.exports)
  await Promise.all([first, mod.exports.refreshTokens(oldAT)])
  assert.equal(refreshes, 1)
})

test('AI recovers a business authentication rejection before opening SSE', async (t) => {
  const f = fixture(t)
  f.session.setTokens(token('valid-but-rejected'), 'rt-old')
  let fetches = 0,
    errors = 0,
    completed = 0
  globalThis.fetch = async () => {
    fetches++
    return fetches === 1
      ? new Response(JSON.stringify({ code: 1, msg: 'token invalid or account unavailable' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response('data: {"type":"response.completed"}\n\ndata: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
  }
  await f.load('src/api/ai.ts').fetchAiChatStream(
    { input: 'hello' },
    () => {},
    () => {},
    () => completed++,
    () => errors++
  )
  assert.equal(fetches, 2)
  assert.equal(f.counts().refreshes, 1)
  assert.equal(completed, 1)
  assert.equal(errors, 0)
})

test('canceling AI while refreshing never starts generation', async (t) => {
  const f = fixture(t)
  const controller = new AbortController()
  let fetches = 0
  globalThis.fetch = () => {
    fetches++
    throw new Error('unexpected fetch')
  }
  const pending = f.load('src/api/ai.ts').fetchAiChatStream(
    { input: 'hello' },
    () => {},
    () => {},
    () => {},
    () => {},
    controller.signal
  )
  controller.abort()
  await pending
  assert.equal(fetches, 0)
})

test('WebSocket refreshes before connecting and recovers 1008 without replaying messages', async (t) => {
  const f = fixture(t)
  const connections = []
  const sent = []
  const businessMessages = []
  globalThis.WebSocket = class {
    static OPEN = 1
    readyState = 1
    constructor(url) {
      this.url = url
      connections.push(this)
    }
    close() {}
    send(data) {
      sent.push(data)
    }
  }
  const { useWebSocket } = f.load('src/composables/useWebSocket.ts')
  const socket = f.scope.run(() =>
    useWebSocket(() => '/ws?token=' + f.session.authTokens.value.accessToken, {
      auth: 'required',
      heartbeat: { interval: -1 },
      reconnect: { initialDelay: 1 },
      onMessage: (_connection, event) => businessMessages.push(event.data),
    })
  )
  await tick()
  await tick()
  assert.equal(connections.length, 1)
  assert.equal(connections[0].url, '/ws?token=' + newAT)
  socket.send({ type: 'send', text: 'only once' })
  const newer = token('second')
  f.useHandler(async (config) => ok(config, { accessToken: newer, refreshToken: 'rt-newer' }))
  connections[0].onclose({ code: 1008 })
  await tick()
  await tick()
  assert.equal(connections.length, 2)
  assert.equal(connections[1].url, '/ws?token=' + newer)
  const latest = token('third')
  f.useHandler(async (config) => ok(config, { accessToken: latest, refreshToken: 'rt-latest' }))
  connections[1].onmessage({
    data: JSON.stringify({ type: 'system', system: 'session expired, please sign in again' }),
  })
  assert.equal(
    businessMessages.length,
    1,
    'business layer must remove its rejected optimistic message'
  )
  await tick()
  await tick()
  assert.equal(connections[2].url, '/ws?token=' + latest)
  assert.equal(sent.length, 1, 'renewal must not replay business messages')
})

test('WebSocket temporary validation failure reconnects without forcing a refresh', async (t) => {
  const f = fixture(t)
  f.session.setTokens(newAT, 'rt-new')
  const connections = []
  globalThis.WebSocket = class {
    static OPEN = 1
    readyState = 1
    constructor(url) {
      this.url = url
      connections.push(this)
    }
    close() {}
    send() {}
  }
  f.scope.run(() =>
    f
      .load('src/composables/useWebSocket.ts')
      .useWebSocket(() => '/ws?token=' + f.session.authTokens.value.accessToken, {
        auth: 'required',
        heartbeat: { interval: -1 },
        reconnect: { initialDelay: 1 },
      })
  )
  await tick()
  connections[0].onclose({ code: 1013 })
  await tick()
  await tick()
  assert.equal(connections.length, 2)
  assert.equal(f.counts().refreshes, 0)
})

test('refresh business storage failures preserve credentials and can recover', async (t) => {
  const f = fixture(t)
  for (const msg of ['查询用户失败', '刷新令牌失败', 'unexpected service failure']) {
    f.useHandler(async (config) => response(config, { code: 1, msg, data: {} }))
    await assert.rejects(f.session.refreshTokens(), { message: msg })
    assert.equal(f.session.getRefreshToken(), 'rt-old')
    assert.equal(f.counts().expired, 0)
  }
  f.useHandler(async (config) => ok(config, { accessToken: newAT, refreshToken: 'rt-new' }))
  assert.equal((await f.session.refreshTokens()).refreshToken, 'rt-new')
})

test('banned refresh preserves the account reason in the terminal error', async (t) => {
  const f = fixture(t)
  f.useHandler(async (config) => response(config, { code: 1, msg: 'account is banned', data: {} }))
  await assert.rejects(f.session.refreshTokens(), {
    name: 'SessionExpiredError',
    message: 'account is banned',
  })
  assert.equal(f.session.getRefreshToken(), null)
  assert.equal(f.counts().expired, 1)
})

for (const http401 of [false, true]) {
  test(`HTTP ${http401 ? 401 : 200} auth recovery reports refresh errors once and respects silent`, async (t) => {
    const f = fixture(t)
    f.useHandler(async (config) => {
      if (config.url.endsWith('/login/refresh'))
        throw new axios.AxiosError('offline', 'ERR_NETWORK', config)
      if (http401)
        throw new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
          ...denied(config),
          status: 401,
        })
      return denied(config)
    })
    await assert.rejects(f.request.post('/like'))
    assert.equal(f.errors.length, 1)
    assert.match(f.errors[0], /网络/)
    assert.equal(f.session.getRefreshToken(), 'rt-old')
    await assert.rejects(f.request.post('/like', {}, { silent: true }))
    assert.equal(f.errors.length, 1)
  })
}

test('guest authentication opens login and reports it once', async (t) => {
  const f = fixture(t)
  f.session.clearTokens()
  let prompts = 0
  window.addEventListener('auth:login-required', () => prompts++)
  f.useHandler(async (config) => denied(config))
  await assert.rejects(f.request.post('/like'), /请先登录/)
  assert.equal(prompts, 1)
  assert.deepEqual(f.errors, ['请先登录'])
})

test('terminal session and replay failures have one feedback owner', async (t) => {
  const f = fixture(t)
  f.useHandler(async (config) => denied(config))
  await assert.rejects(f.request.post('/like'), { name: 'SessionExpiredError' })
  assert.equal(f.counts().expired, 1)
  assert.deepEqual(f.errors, [])
  f.session.setTokens(oldAT, 'rt-old')
  f.useHandler(async (config) =>
    config.url.endsWith('/login/refresh')
      ? ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
      : denied(config)
  )
  await assert.rejects(f.request.post('/like'), /登录状态验证失败/)
  assert.deepEqual(f.errors, ['登录状态验证失败，请重试'])
})

test('cancelling during renewal does not display a failure', async (t) => {
  const f = fixture(t)
  const controller = new AbortController()
  f.useHandler(async (config) => {
    if (config.url.endsWith('/login/refresh')) {
      controller.abort()
      return ok(config, { accessToken: newAT, refreshToken: 'rt-new' })
    }
    return denied(config)
  })
  await assert.rejects(f.request.post('/like', {}, { signal: controller.signal }), (error) =>
    axios.isCancel(error)
  )
  assert.deepEqual(f.errors, [])
})
