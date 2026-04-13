import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// 仅替换鉴权/通用请求依赖；被测 SSE 解析器来自生产 TypeScript 文件。
const source = await readFile(new URL('../src/api/ai.ts', import.meta.url), 'utf8')
const isolated = source
  .replace(/^import request from '\.\/request'\r?\n/, 'const request = {}\n')
  .replace(
    /import \{[^}]*\} from '@\/utils\/authSession'\r?\n/,
    `
    const API_BASE = '/v1'
    const ensureAccessToken = () => Promise.resolve('unit-test-token')
    const refreshAccessToken = () => Promise.resolve('unit-test-token')
    const isAuthenticationError = () => false
  `
  )
assert.notEqual(isolated, source, 'request dependency was not isolated')
const compiled = ts.transpileModule(isolated, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText
const { fetchAiChatStream } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`)

const sse = (value) => `data: ${JSON.stringify(value)}\n\n`

const responseFromFragments = (text) => {
  const bytes = new TextEncoder().encode(text)
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += 7) {
          controller.enqueue(bytes.slice(offset, offset + 7))
        }
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
}

const consume = async (t, response) => {
  t.mock.method(globalThis, 'fetch', () => Promise.resolve(response))
  const state = { text: '', calls: [], errors: [], completed: 0, order: [] }
  await fetchAiChatStream(
    { input: 'hello' },
    (text) => {
      state.text += text
      state.order.push('text')
    },
    () => {},
    () => {
      state.completed += 1
      state.order.push('done')
    },
    (error) => state.errors.push(error.message),
    undefined,
    (event) => {
      assert.equal(state.completed, 0, 'tool event prematurely completed the reply')
      state.calls.push(event)
      state.order.push(event.status)
    }
  )
  return state
}

test('tool lifecycle survives fragmented UTF-8 SSE and does not finish the reply', async (t) => {
  const text =
    sse({
      type: 'response.tool.started',
      callId: 'call_1',
      name: 'search_videos',
      query: 'Go 教程',
    }) +
    sse({
      type: 'response.tool.completed',
      callId: 'call_1',
      name: 'search_videos',
      resultCount: 2,
    }) +
    sse({ type: 'response.output_text.delta', delta: '找到教程。' }) +
    sse({ type: 'response.completed' }) +
    'data: [DONE]\n\n'
  const state = await consume(t, responseFromFragments(text))
  assert.deepEqual(state.order, ['running', 'completed', 'text', 'done'])
  assert.equal(state.calls[0].query, 'Go 教程')
  assert.equal(state.calls[1].resultCount, 2)
  assert.equal(state.text, '找到教程。')
  assert.equal(state.completed, 1)
  assert.deepEqual(state.errors, [])
})

test('tool failure is reported separately while the model may still answer', async (t) => {
  const state = await consume(
    t,
    responseFromFragments(
      sse({
        type: 'response.tool.failed',
        callId: 'call_1',
        name: 'search_videos',
        message: '站内搜索暂时未能完成',
      }) +
        sse({ type: 'response.output_text.delta', delta: '稍后再试。' }) +
        sse({ type: 'response.completed' })
    )
  )
  assert.equal(state.calls[0].status, 'failed')
  assert.equal(state.text, '稍后再试。')
  assert.equal(state.completed, 1)
  assert.deepEqual(state.errors, [])
})

test('EOF after a tool started remains an interrupted response', async (t) => {
  const state = await consume(
    t,
    responseFromFragments(
      sse({ type: 'response.tool.started', callId: 'call_1', name: 'search_videos' })
    )
  )
  assert.equal(state.completed, 0)
  assert.equal(state.errors.length, 1)
})

test('HTTP 200 business error is still handled before SSE parsing', async (t) => {
  const state = await consume(
    t,
    new Response(JSON.stringify({ code: 1, msg: '请先登录' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  )
  assert.deepEqual(state.errors, ['请先登录'])
  assert.deepEqual(state.calls, [])
  assert.equal(state.completed, 0)
})
