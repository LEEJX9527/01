import { FOODS, findFoodByName, type FoodCategory } from '../data/foods.ts'
import { scaleFood, sumItems, type FoodItem, type Totals } from './nutrition.ts'

export type Goal = 'lose' | 'maintain' | 'gain'
export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEALS: { key: MealKey; label: string; share: number; from: number; to: number }[] = [
  { key: 'breakfast', label: '早餐', share: 0.25, from: 5, to: 10 },
  { key: 'lunch', label: '午餐', share: 0.35, from: 10, to: 15 },
  { key: 'dinner', label: '晚餐', share: 0.3, from: 17, to: 21 },
  { key: 'snack', label: '加餐', share: 0.1, from: 0, to: 24 },
]

export const GOALS: Record<Goal, { label: string; delta: number; proteinPerKg: number; fatRatio: number; hint: string }> = {
  lose: { label: '减脂', delta: -400, proteinPerKg: 1.8, fatRatio: 0.25, hint: '每日约少 400 kcal，高蛋白保肌肉' },
  maintain: { label: '保持', delta: 0, proteinPerKg: 1.4, fatRatio: 0.28, hint: '摄入与消耗持平' },
  gain: { label: '增肌', delta: 300, proteinPerKg: 2.0, fatRatio: 0.25, hint: '每日约多 300 kcal，配合力量训练' },
}

export interface PlanTargets {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export interface DietPlan {
  goal: Goal
  weight: number
  tdee: number
  targets: PlanTargets
  /** 每餐计划的食物，可手动增删 */
  meals: Record<MealKey, FoodItem[]>
  /** 自动生成菜单时的随机种子，方便“换一批” */
  seed: number
  updatedAt: number
}

/** 最低摄入保护：低于此值不再继续扣减 */
const MIN_KCAL = 1200

export function computeTargets(goal: Goal, tdee: number, weight: number): PlanTargets {
  const g = GOALS[goal]
  const kcal = Math.round(Math.max(MIN_KCAL, tdee + g.delta) / 10) * 10
  const protein = Math.round(weight * g.proteinPerKg)
  const fat = Math.round((kcal * g.fatRatio) / 9)
  // 碳水补足剩余能量，不低于 0
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, fat, carbs }
}

export const mealTarget = (t: PlanTargets, meal: MealKey) => Math.round(t.kcal * MEALS.find((m) => m.key === meal)!.share)

/** 根据时间推断餐次 */
export function mealAt(date: Date): MealKey {
  const h = date.getHours()
  return MEALS.find((m) => m.key !== 'snack' && h >= m.from && h < m.to)?.key ?? 'snack'
}

// 简单可复现的伪随机（mulberry32）
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 每餐的搭配结构：类别 + 占本餐热量比例
const TEMPLATES: Record<MealKey, { cat: FoodCategory; share: number }[]> = {
  breakfast: [{ cat: 'staple', share: 0.45 }, { cat: 'protein', share: 0.3 }, { cat: 'dairy', share: 0.25 }],
  lunch: [{ cat: 'staple', share: 0.4 }, { cat: 'protein', share: 0.42 }, { cat: 'veg', share: 0.18 }],
  dinner: [{ cat: 'staple', share: 0.32 }, { cat: 'protein', share: 0.48 }, { cat: 'veg', share: 0.2 }],
  snack: [{ cat: 'fruit', share: 0.6 }, { cat: 'nut', share: 0.4 }],
}

/** 克数取整到 5g，并限制在合理份量范围内 */
const roundGrams = (g: number, serving: number) => Math.min(serving * 2.5, Math.max(serving * 0.3, Math.round(g / 5) * 5))

export function generateMeals(targets: PlanTargets, seed: number): Record<MealKey, FoodItem[]> {
  const rand = rng(seed)
  const used = new Set<string>()
  const meals = {} as Record<MealKey, FoodItem[]>
  for (const { key } of MEALS) {
    const budget = mealTarget(targets, key)
    meals[key] = TEMPLATES[key].map(({ cat, share }) => {
      // 同一天尽量不重复
      const pool = FOODS.filter((f) => f.cat === cat)
      const fresh = pool.filter((f) => !used.has(f.name))
      const list = fresh.length ? fresh : pool
      const ref = list[Math.floor(rand() * list.length)]
      used.add(ref.name)
      return scaleFood(ref, roundGrams(((budget * share) / ref.kcal) * 100, ref.serving))
    })
  }
  return meals
}

export function createPlan(goal: Goal, tdee: number, weight: number, seed = Date.now()): DietPlan {
  const targets = computeTargets(goal, tdee, weight)
  return { goal, weight, tdee, targets, meals: generateMeals(targets, seed), seed, updatedAt: Date.now() }
}

/** 按餐次汇总实际摄入 */
export function actualByMeal(entries: { meal: MealKey; items: FoodItem[] }[]): Record<MealKey, Totals> {
  const out = {} as Record<MealKey, Totals>
  for (const { key } of MEALS) out[key] = sumItems(entries.filter((e) => e.meal === key).flatMap((e) => e.items))
  return out
}

export type Status = 'under' | 'ok' | 'over'

/** ±10% 以内视为达标 */
export function status(actual: number, target: number): Status {
  if (!target) return 'ok'
  const r = actual / target
  return r < 0.9 ? 'under' : r > 1.1 ? 'over' : 'ok'
}

/** 把计划里的一餐转成可直接记录的食物（重新按库数据计算，防止旧数据漂移） */
export function mealToItems(items: FoodItem[]): FoodItem[] {
  return items.map((i) => {
    const ref = findFoodByName(i.name)
    return ref ? scaleFood(ref, i.grams) : { ...i }
  })
}
