import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLocal, estimateTDEE, sumItems } from './nutrition.ts'
import { parseAiJson, analyzeWithAi } from './ai.ts'

test('按克数解析', () => {
  const { items } = parseLocal('200g米饭')
  assert.equal(items[0].name, '米饭')
  assert.equal(items[0].kcal, 232)
})

test('按份数和中文数字解析，拆分多种食物', () => {
  const { items, unknown } = parseLocal('两个鸡蛋、一碗米饭和半根香蕉，一份火星菜')
  assert.deepEqual(items.map((i) => [i.name, i.grams]), [['鸡蛋', 100], ['米饭', 150], ['香蕉', 60]])
  assert.deepEqual(unknown, ['一份火星菜'])
})

test('最长名称优先与斤两单位', () => {
  const { items } = parseLocal('全麦面包1两')
  assert.equal(items[0].name, '全麦面包')
  assert.equal(items[0].grams, 50)
})

test('合计', () => {
  const t = sumItems(parseLocal('100g鸡胸肉,100g米饭').items)
  assert.equal(t.kcal, 249)
  assert.equal(t.protein, 27.2)
})

test('TDEE 估算', () => {
  assert.equal(estimateTDEE({ sex: 'male', age: 30, height: 175, weight: 70, activity: 1.2 }), 1979)
})

test('AI 返回容错解析', () => {
  const r = parseAiJson('```json\n{"items":[{"name":"拉面","grams":"400","kcal":520.4,"protein":20,"fat":-1,"carbs":80}],"note":"注意钠"}\n```')
  assert.deepEqual(r.items[0], { name: '拉面', grams: 400, kcal: 520, protein: 20, fat: 0, carbs: 80 })
  assert.equal(r.note, '注意钠')
  assert.throws(() => parseAiJson('抱歉'))
})

test('接口返回 HTML 时给出地址提示', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><html></html>', { status: 200 }))
  await assert.rejects(analyzeWithAi({ baseUrl: 'https://x.example', apiKey: 'k', model: 'm' }, '米饭'), /\/v1/)
})

test('接口返回正常 JSON', async (t) => {
  const body = { choices: [{ message: { content: '{"items":[{"name":"米饭","grams":150,"kcal":174}],"note":""}' } }] }
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(body), { status: 200 }))
  const r = await analyzeWithAi({ baseUrl: 'https://x.example/v1', apiKey: 'k', model: 'm' }, '米饭')
  assert.equal(r.items[0].kcal, 174)
})
