import { test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createCompanionServer } from './server.ts'
import { defaultConfig } from './config.ts'

const cfg = { ...defaultConfig(), provider: { baseUrl: 'https://example.invalid/v1', apiKey: 'sk-SECRET-PROVIDER-KEY', model: 'test-model' } }
const calls: { text: string; image?: string }[] = []
const searches: string[] = []
const server = createCompanionServer(
  () => cfg,
  async (_c, text, image) => {
    calls.push({ text, image })
    return { items: [{ name: '米饭', grams: 150, kcal: 174, protein: 3.9, fat: 0.5, carbs: 38.9 }], note: 'ok' }
  },
  async (q) => {
    searches.push(q)
    if (q === 'boom') throw new Error('上游失败')
    return [{ code: '1', product_name: 'Whey', nutriments: { 'energy-kcal_100g': 390 } }]
  },
)
let port = 0

before(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})
after(() => server.close())

// 使用 http.request 以便自定义 Host 头（fetch 不允许）
function call(opts: { method?: string; path?: string; headers?: Record<string, string>; body?: unknown }) {
  return new Promise<{ status: number; headers: Record<string, unknown>; json: any; raw: string }>((resolve, reject) => {
    const data = opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
    const req = request(
      { host: '127.0.0.1', port, method: opts.method ?? 'GET', path: opts.path ?? '/api/status', headers: { 'Content-Type': 'application/json', ...opts.headers } },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, json: raw ? JSON.parse(raw) : null, raw }))
      },
    )
    req.on('error', reject)
    req.end(data)
  })
}
const auth = { Authorization: `Bearer ${cfg.accessKey}` }

test('缺少或错误的连接密钥返回 401', async () => {
  assert.equal((await call({})).status, 401)
  assert.equal((await call({ headers: { Authorization: 'Bearer wrong' } })).status, 401)
})

test('status 不泄露 Provider 密钥', async () => {
  const r = await call({ headers: auth })
  assert.equal(r.status, 200)
  assert.equal(r.json.model, 'test-model')
  assert.equal(r.json.providerConfigured, true)
  assert.ok(!r.raw.includes('SECRET'))
})

test('白名单来源获得 CORS 头，其他来源被拒', async () => {
  const ok = await call({ method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })
  assert.equal(ok.status, 204)
  assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173')
  const bad = await call({ headers: { ...auth, Origin: 'https://evil.example' } })
  assert.equal(bad.status, 403)
})

test('非回环 Host 被拒（防 DNS 重绑定）', async () => {
  assert.equal((await call({ headers: { ...auth, Host: 'evil.example:8787' } })).status, 403)
})

test('analyze 正常转发', async () => {
  const r = await call({ method: 'POST', path: '/api/analyze', headers: auth, body: { text: '一碗米饭' } })
  assert.equal(r.status, 200)
  assert.equal(r.json.items[0].kcal, 174)
  assert.equal(calls.at(-1)?.text, '一碗米饭')
})

test('analyze 输入校验', async () => {
  const post = (body: unknown) => call({ method: 'POST', path: '/api/analyze', headers: auth, body })
  assert.equal((await post({ text: '  ' })).status, 400)
  assert.equal((await post({ image: 'https://evil.example/a.png' })).status, 400)
  assert.equal((await post('not json')).status, 400)
  assert.equal((await post({ image: 'data:image/jpeg;base64,AAAA' })).status, 200)
  const long = await post({ text: 'x'.repeat(5000) })
  assert.equal(long.status, 200)
  assert.equal(calls.at(-1)?.text.length, 2000)
})

test('未知路径 404', async () => {
  assert.equal((await call({ path: '/v1/chat/completions', method: 'POST', headers: auth, body: {} })).status, 404)
})

test('在线食物搜索：鉴权、参数校验、转发', async () => {
  const auth = { Authorization: `Bearer ${cfg.accessKey}` }
  assert.equal((await call({ path: '/api/foods?q=whey' })).status, 401)
  assert.equal((await call({ path: '/api/foods?q=%20', headers: auth })).status, 400)
  assert.equal((await call({ path: `/api/foods?q=${'a'.repeat(101)}`, headers: auth })).status, 400)

  const ok = await call({ path: '/api/foods?q=' + encodeURIComponent('蛋白粉'), headers: auth })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.hits[0].product_name, 'Whey')
  assert.equal(searches.at(-1), '蛋白粉')

  const bad = await call({ path: '/api/foods?q=boom', headers: auth })
  assert.equal(bad.status, 502)
  assert.match(bad.json.error, /上游失败/)
})
