import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemsForDate } from './day.ts'
import { sumItems, type FoodItem } from './nutrition.ts'

const food = (name: string, kcal: number): FoodItem => ({ name, grams: 100, kcal, protein: 1, fat: 1, carbs: 1 })

test('同一天多条记录合并统计，其他日期不计入', () => {
  const sessions = [
    { id: 'a', date: '2026-10-02' },
    { id: 'b', date: '2026-10-02' },
    { id: 'c', date: '2026-10-01' },
  ]
  const messages = [
    { sessionId: 'a', items: [food('米饭', 174)] },
    { sessionId: 'a' }, // 用户消息没有 items
    { sessionId: 'b', items: [food('鸡蛋', 144), food('苹果', 106)] },
    { sessionId: 'c', items: [food('可乐', 142)] },
  ]
  const items = itemsForDate('2026-10-02', sessions, messages)
  assert.deepEqual(items.map((i) => i.name), ['米饭', '鸡蛋', '苹果'])
  assert.equal(sumItems(items).kcal, 424)
  assert.deepEqual(itemsForDate('2026-09-30', sessions, messages), [])
})
