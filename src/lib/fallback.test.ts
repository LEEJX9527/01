import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeLocalFirst } from './fallback.ts'

const ai = (calls: string[]) => async (t: string) => {
  calls.push(t)
  return { items: [{ name: '螺蛳粉', grams: 400, kcal: 560, protein: 18, fat: 22, carbs: 75 }], note: '' }
}

test('本地全部识别时不调用 AI', async () => {
  const calls: string[] = []
  const r = await analyzeLocalFirst('一碗米饭', ai(calls))
  assert.equal(calls.length, 0)
  assert.equal(r.items[0].name, '米饭')
  assert.equal(r.error, false)
})

test('只把未识别的部分交给 AI，并合并结果', async () => {
  const calls: string[] = []
  const r = await analyzeLocalFirst('一碗米饭，一碗螺蛳粉', ai(calls))
  assert.equal(calls.length, 1)
  assert.ok(!calls[0].includes('米饭'))
  assert.ok(calls[0].includes('螺蛳粉'))
  assert.deepEqual(r.items.map((i) => i.name), ['米饭', '螺蛳粉'])
  assert.deepEqual(r.aiNames, ['螺蛳粉'])
  assert.match(r.note, /AI 估算/)
})

test('未配置 AI 时保留原提示', async () => {
  const r = await analyzeLocalFirst('一碗螺蛳粉')
  assert.equal(r.error, true)
  assert.match(r.note, /未在食物库中找到/)
})

test('AI 失败时保留本地结果', async () => {
  const r = await analyzeLocalFirst('一碗米饭，一碗螺蛳粉', async () => {
    throw new Error('网络错误')
  })
  assert.deepEqual(r.items.map((i) => i.name), ['米饭'])
  assert.equal(r.error, false)
  assert.match(r.note, /AI 补充失败：网络错误/)
})
