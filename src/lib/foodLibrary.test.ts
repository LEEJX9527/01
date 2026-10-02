import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { allFoods, searchFoods, setCustomFoods, findFoodByName } from './foodLibrary.ts'
import { parseLocal } from './nutrition.ts'
import { BUILTIN_FOODS } from '../data/foods.ts'

beforeEach(() => setCustomFoods([]))

test('内置补剂可被本地识别', () => {
  const r = parseLocal('一勺蛋白粉和5g肌酸')
  assert.deepEqual(r.unknown, [])
  assert.equal(r.items[0].name, '乳清蛋白粉')
  assert.equal(r.items[0].grams, 30)
  assert.equal(r.items[0].kcal, 117) // 390 × 0.3
  assert.equal(r.items[1].name, '肌酸')
})

test('内置库名称不重复', () => {
  const names = BUILTIN_FOODS.map((f) => f.name)
  assert.equal(new Set(names).size, names.length)
})

test('自定义食物参与识别与搜索', () => {
  setCustomFoods([{ id: 'c1', name: '康比特蛋白粉', aliases: ['康比特'], cat: 'supplement', source: 'custom', brand: 'CPT', kcal: 400, protein: 75, fat: 7, carbs: 10, serving: 35 }])
  assert.equal(parseLocal('一勺康比特').items[0].kcal, 140)
  assert.equal(searchFoods('cpt')[0].name, '康比特蛋白粉')
  assert.equal(findFoodByName('康比特蛋白粉')?.source, 'custom')
})

test('自定义同名食物覆盖内置', () => {
  setCustomFoods([{ id: 'c2', name: '乳清蛋白粉', aliases: ['蛋白粉'], cat: 'supplement', source: 'custom', kcal: 390, protein: 78, fat: 6, carbs: 8, serving: 30 }])
  const hits = allFoods().filter((f) => f.name === '乳清蛋白粉')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].source, 'custom')
  assert.equal(parseLocal('一勺蛋白粉').items[0].kcal, 117)
})
