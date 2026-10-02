import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actualByMeal, computeTargets, createPlan, generateMeals, mealAt, MEALS, mealTarget, status } from './plan.ts'
import { sumItems } from './nutrition.ts'

test('目标热量与宏量营养素', () => {
  const t = computeTargets('lose', 2300, 70)
  assert.equal(t.kcal, 1900)
  assert.equal(t.protein, 126) // 70kg × 1.8
  assert.equal(t.fat, 53) // 1900 × 25% ÷ 9
  // 三大营养素能量之和约等于目标热量
  assert.ok(Math.abs(t.protein * 4 + t.fat * 9 + t.carbs * 4 - t.kcal) < 10)
})

test('减脂不低于 1200 kcal', () => {
  assert.equal(computeTargets('lose', 1400, 45).kcal, 1200)
})

test('四餐比例合计 100%', () => {
  assert.equal(MEALS.reduce((s, m) => s + m.share, 0).toFixed(2), '1.00')
})

test('自动菜单：每餐热量接近目标，同种子结果一致', () => {
  const t = computeTargets('maintain', 2000, 60)
  const a = generateMeals(t, 42)
  assert.deepEqual(a, generateMeals(t, 42))
  assert.notDeepEqual(a, generateMeals(t, 7))
  for (const { key } of MEALS) {
    const kcal = sumItems(a[key]).kcal
    const target = mealTarget(t, key)
    assert.ok(Math.abs(kcal - target) / target < 0.35, `${key}: ${kcal} vs ${target}`)
    assert.ok(a[key].every((i) => i.grams > 0 && i.grams % 5 === 0))
  }
  const all = Object.values(a).flat()
  const total = sumItems(all).kcal
  assert.ok(Math.abs(total - t.kcal) / t.kcal < 0.15, `total ${total} vs ${t.kcal}`)
  assert.equal(new Set(all.map((i) => i.name)).size, all.length, '同一天不重复')
})

test('createPlan 结构完整', () => {
  const p = createPlan('gain', 2400, 65, 1)
  assert.equal(p.targets.kcal, 2700)
  assert.deepEqual(Object.keys(p.meals), ['breakfast', 'lunch', 'dinner', 'snack'])
})

test('根据时间推断餐次', () => {
  const at = (h: number) => mealAt(new Date(2026, 9, 2, h, 30))
  assert.equal(at(7), 'breakfast')
  assert.equal(at(12), 'lunch')
  assert.equal(at(16), 'snack')
  assert.equal(at(19), 'dinner')
  assert.equal(at(23), 'snack')
})

test('按餐次汇总实际摄入与达标判断', () => {
  const f = (kcal: number) => ({ name: 'x', grams: 100, kcal, protein: 0, fat: 0, carbs: 0 })
  const r = actualByMeal([{ meal: 'lunch', items: [f(300), f(200)] }, { meal: 'lunch', items: [f(100)] }, { meal: 'breakfast', items: [f(400)] }])
  assert.equal(r.lunch.kcal, 600)
  assert.equal(r.breakfast.kcal, 400)
  assert.equal(r.dinner.kcal, 0)
  assert.equal(status(85, 100), 'under')
  assert.equal(status(105, 100), 'ok')
  assert.equal(status(120, 100), 'over')
})
