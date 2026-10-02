import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeOffHits, onlineToFood } from './off.ts'

test('标准化 Open Food Facts 结果', () => {
  const r = normalizeOffHits([
    { code: '1', product_name: 'Gold Standard Whey', brands: ['Optimum Nutrition'], serving_quantity: 31, nutriments: { 'energy-kcal_100g': 397, proteins_100g: 75, fat_100g: 4.33, carbohydrates_100g: 9.7 } },
    // 只有 kJ：1600 / 4.184 ≈ 382
    { code: '2', product_name_zh: '乳清蛋白', product_name: 'Whey', brands: 'X', nutriments: { energy_100g: 1600, proteins_100g: 80 } },
    // 无热量、无名称的条目被丢弃
    { code: '3', product_name: 'Empty', nutriments: {} },
    { code: '4', nutriments: { 'energy-kcal_100g': 100 } },
  ])
  assert.equal(r.length, 2)
  assert.deepEqual(r[0], { code: '1', name: 'Gold Standard Whey', brand: 'Optimum Nutrition', kcal: 397, protein: 75, fat: 4.3, carbs: 9.7, serving: 31 })
  assert.equal(r[1].name, '乳清蛋白')
  assert.equal(r[1].kcal, 382)
  assert.equal(r[1].fat, 0)
  assert.deepEqual(normalizeOffHits(null), [])
})

test('在线结果转为自定义食物', () => {
  const [o] = normalizeOffHits([{ code: '1', product_name: 'Whey Gold', brands: ['ON'], nutriments: { 'energy-kcal_100g': 397, proteins_100g: 75 } }])
  const f = onlineToFood(o)
  assert.equal(f.name, 'ON Whey Gold')
  assert.equal(f.source, 'off')
  assert.equal(f.serving, 30) // 没有份量时默认 30g
  assert.equal(onlineToFood({ ...o, name: 'ON Whey' }).name, 'ON Whey') // 名称已含品牌时不重复
})
