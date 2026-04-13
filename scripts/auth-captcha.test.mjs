import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { compileFunction } from 'node:vm'
import test from 'node:test'
import { transformSync } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const require = createRequire(resolve(root, 'package.json'))
const vue = require('vue')
const { parse, compileScript } = require('vue/compiler-sfc')
const { descriptor } = parse(
  readFileSync(resolve(root, 'src/components/auth/AuthDialog.vue'), 'utf8')
)
const code = transformSync(compileScript(descriptor, { id: 'auth-captcha-test' }).content, {
  loader: 'ts',
  format: 'cjs',
  target: 'es2022',
}).code
const captchaErrors = { exports: {} }
compileFunction(
  transformSync(readFileSync(resolve(root, 'src/utils/captchaError.ts'), 'utf8'), {
    loader: 'ts',
    format: 'cjs',
  }).code,
  ['module', 'exports']
)(captchaErrors, captchaErrors.exports)

async function fixture(t, { loginGraphic = false, registerGraphic = false, type = 'none' } = {}) {
  const logins = []
  const errors = []
  const emitted = []
  let loginResult = true
  let loginFailure = new Error('图形验证码错误')
  let refreshes = 0
  let configRefreshes = 0
  const site = vue.reactive({
    isLoaded: true,
    isLoading: false,
    isLoginGraphicsCaptchaEnabled: loginGraphic,
    isRegisterGraphicsCaptchaEnabled: registerGraphic,
    refreshConfig: async () => {
      configRefreshes++
      return true
    },
  })
  const mocks = {
    '@/utils/captchaError': captchaErrors.exports,
    vue: { ...vue, onMounted() {}, onUnmounted() {} },
    'vue-sonner': { toast: { error: (message) => errors.push(message), success() {} } },
    '@/stores/site': { useSiteStore: () => site },
    '@/stores/auth': {
      useAuthStore: () => ({
        login: async (payload, options) => {
          logins.push(payload)
          if (!loginResult) options?.onError?.(loginFailure.message, loginFailure)
          return loginResult
        },
      }),
    },
    '@/composables/useCaptchaTypeQueue': {
      useCaptchaTypeQueue: () => ({ take: async () => type, warmup() {}, reset() {} }),
    },
  }
  const mod = { exports: {} }
  compileFunction(code, ['require', 'module', 'exports'])(
    (specifier) => mocks[specifier] ?? {},
    mod,
    mod.exports
  )
  const props = vue.reactive({ open: true, initialMode: 'login' })
  const scope = vue.effectScope()
  const state = scope.run(() =>
    mod.exports.default.setup(props, {
      expose() {},
      emit: (...args) => emitted.push(args),
    })
  )
  state.loginUsername.value = ' tester '
  state.loginPassword.value = 'password123'
  state.graphicsCaptchaRef.value = { loadCaptcha: async () => refreshes++, focus() {} }
  t.after(() => scope.stop())
  await Promise.resolve()
  return {
    state,
    site,
    props,
    logins,
    emitted,
    errors,
    setLoginResult: (value) => (loginResult = value),
    setLoginFailure: (error) => {
      loginResult = false
      loginFailure = error
    },
    setNextType: (value) => {
      type = value
    },
    refreshes: () => refreshes,
    configRefreshes: () => configRefreshes,
    fillCaptcha: () => {
      state.graphicsCaptchaValue.value = { captchaID: 'challenge', captchaCode: ' 42 ' }
    },
  }
}

test('login graphic switch controls required input independently of register', async (t) => {
  const f = await fixture(t, { loginGraphic: true })
  assert.equal(f.state.isLoginFormValid.value, false)
  await f.state.handleLoginClick()
  assert.equal(f.logins.length, 0)
  f.fillCaptcha()
  assert.equal(f.state.isLoginFormValid.value, true)
  f.site.isLoginGraphicsCaptchaEnabled = false
  f.site.isRegisterGraphicsCaptchaEnabled = true
  await vue.nextTick()
  assert.deepEqual(f.state.graphicsCaptchaValue.value, { captchaID: '', captchaCode: '' })
  assert.equal(f.state.isLoginFormValid.value, true)
  await f.state.handleLoginClick()
  assert.deepEqual(f.logins, [{ username: 'tester', password: 'password123' }])
})

for (const type of ['none', 'slide', 'click']) {
  test(`graphic credentials accompany ${type} login verification`, async (t) => {
    const f = await fixture(t, { loginGraphic: true, type })
    f.fillCaptcha()
    await f.state.handleLoginClick()
    const interactive =
      type === 'slide'
        ? { slideCaptchaToken: 'slide', slideCaptchaX: 20, slideCaptchaY: 30 }
        : type === 'click'
          ? { captchaToken: 'click', captchaDots: [{ index: 0, x: 20, y: 30 }] }
          : {}
    if (type !== 'none') {
      assert.equal(f.logins.length, 0)
      await f.state.handleCaptchaConfirm(interactive)
    }
    assert.deepEqual(f.logins, [
      {
        username: 'tester',
        password: 'password123',
        captchaID: 'challenge',
        captchaCode: '42',
        ...interactive,
      },
    ])
  })
}

test('failed login refreshes the one-time graphic challenge and returns to the form', async (t) => {
  const f = await fixture(t, { loginGraphic: true, type: 'slide' })
  f.fillCaptcha()
  f.setLoginResult(false)
  await f.state.handleLoginClick()
  assert.equal(f.state.captchaOpen.value, true)
  await f.state.handleCaptchaConfirm({ slideCaptchaToken: 'slide' })
  assert.equal(f.refreshes(), 1)
  assert.equal(f.state.isLoginFormValid.value, false)
  assert.equal(f.state.captchaOpen.value, false)
  assert.deepEqual(f.errors, ['图形验证码错误'])
  assert.equal(f.state.graphicCaptchaError.value, '图形验证码错误')
})

test('graphic-only rejection leaves a specific inline error without opening a popup', async (t) => {
  const f = await fixture(t, { loginGraphic: true })
  f.fillCaptcha()
  f.setLoginResult(false)
  await f.state.handleLoginClick()
  await vue.nextTick()
  assert.equal(f.state.captchaOpen.value, false)
  assert.equal(f.state.graphicCaptchaError.value, '图形验证码错误')
  assert.equal(f.refreshes(), 1)
  assert.equal(f.state.graphicsCaptchaValue.value.captchaCode, '')
})

for (const type of ['slide', 'click']) {
  test(`${type} rejection preserves the graphic answer and switches challenges without closing`, async (t) => {
    const f = await fixture(t, { loginGraphic: true, type })
    const reason =
      type === 'slide' ? '滑块验证码错误，请重新验证' : '文字点选验证码已过期，请重新验证'
    f.fillCaptcha()
    f.setLoginFailure(Object.assign(new Error(reason), { data: { captchaType: type } }))
    const failures = []
    f.state.captchaDialogRef.value = { fail: (message) => failures.push(message) }
    await f.state.handleLoginClick()
    await f.state.handleCaptchaConfirm({})
    assert.equal(f.state.captchaOpen.value, true)
    assert.equal(f.refreshes(), 0)
    assert.equal(f.state.graphicsCaptchaValue.value.captchaCode, ' 42 ')
    assert.deepEqual(failures, [reason])
    const revision = f.state.captchaRevision.value
    f.setNextType(type === 'slide' ? 'click' : 'slide')
    await f.state.handleCaptchaRetry()
    assert.equal(f.state.captchaOpen.value, true)
    assert.equal(f.state.captchaRevision.value, revision + 1)
    assert.deepEqual(f.errors, [])
  })
}

test('structured graphic failure closes the popup and preserves account fields', async (t) => {
  const f = await fixture(t, { loginGraphic: true, type: 'click' })
  f.fillCaptcha()
  f.setLoginFailure(
    Object.assign(new Error('图形验证码错误，请重新填写'), { data: { captchaType: 'graphic' } })
  )
  await f.state.handleLoginClick()
  await f.state.handleCaptchaConfirm({})
  assert.equal(f.state.captchaOpen.value, false)
  assert.equal(f.refreshes(), 1)
  assert.equal(f.state.loginUsername.value, ' tester ')
  assert.equal(f.state.loginPassword.value, 'password123')
  assert.equal(f.state.graphicsCaptchaValue.value.captchaCode, '')
})

test('challenge preparation blocks submission of the outgoing challenge', async (t) => {
  const f = await fixture(t, { type: 'slide' })
  await f.state.handleLoginClick()
  f.state.isSelectingCaptcha.value = true
  await f.state.handleCaptchaConfirm({ slideCaptchaToken: 'old' })
  assert.equal(f.logins.length, 0)
})

test('canceling while the next challenge loads cannot reopen the popup', async (t) => {
  const f = await fixture(t, { type: 'slide' })
  await f.state.handleLoginClick()
  const revision = f.state.captchaRevision.value
  let resolveType
  f.setNextType(
    new Promise((resolve) => {
      resolveType = resolve
    })
  )
  const pending = f.state.handleCaptchaRetry()
  f.state.captchaOpen.value = false
  f.state.handleCaptchaCancel()
  resolveType('click')
  await pending
  assert.equal(f.state.captchaOpen.value, false)
  assert.equal(f.state.captchaRevision.value, revision)
  assert.equal(f.state.isSelectingCaptcha.value, false)
  assert.deepEqual(f.errors, [])
})

test('login waits for config and refreshes switches when reopening', async (t) => {
  const f = await fixture(t)
  f.state.isLoadingLoginConfig.value = true
  await f.state.handleLoginClick()
  assert.equal(f.logins.length, 0)
  f.state.isLoadingLoginConfig.value = false
  f.site.isLoaded = false
  assert.equal(f.state.isLoginFormValid.value, false)
  f.props.open = false
  await vue.nextTick()
  f.props.open = true
  await vue.nextTick()
  assert.equal(f.configRefreshes(), 2)
})

test('a failed initial config load can be retried without reopening the dialog', async (t) => {
  const f = await fixture(t)
  f.site.isLoaded = false
  f.site.refreshConfig = async () => false
  await f.state.loadLoginConfig()
  assert.equal(f.state.loginConfigFailed.value, true)
  assert.equal(f.state.isLoginFormValid.value, false)
  f.site.refreshConfig = async () => {
    f.site.isLoaded = true
    return true
  }
  await f.state.loadLoginConfig()
  assert.equal(f.state.loginConfigFailed.value, false)
  assert.equal(f.state.isLoginFormValid.value, true)
  await f.state.handleLoginClick()
  assert.equal(f.logins.length, 1)
})
