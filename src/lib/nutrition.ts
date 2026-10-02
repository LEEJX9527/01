import type { FoodRef } from '../data/foods.ts'
import { allFoods } from './foodLibrary.ts'

export interface FoodItem {
  name: string
  grams: number
  kcal: number
  protein: number
  fat: number
  carbs: number
}

export interface Totals {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function scaleFood(ref: FoodRef, grams: number): FoodItem {
  const f = grams / 100
  return {
    name: ref.name,
    grams,
    kcal: Math.round(ref.kcal * f),
    protein: round1(ref.protein * f),
    fat: round1(ref.fat * f),
    carbs: round1(ref.carbs * f),
  }
}

export function sumItems(items: FoodItem[]): Totals {
  const t = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      fat: acc.fat + i.fat,
      carbs: acc.carbs + i.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  )
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), fat: round1(t.fat), carbs: round1(t.carbs) }
}

function findFood(text: string): FoodRef | undefined {
  // 优先匹配最长名称，避免“面包”抢先匹配“全麦面包”
  let best: { ref: FoodRef; len: number } | undefined
  for (const ref of allFoods()) {
    for (const n of [ref.name, ...(ref.aliases ?? [])]) {
      if (text.includes(n) && (!best || n.length > best.len)) best = { ref, len: n.length }
    }
  }
  return best?.ref
}

const CN_NUM: Record<string, number> = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

/** 解析数量：返回克数；无法识别重量时按份数 × 默认份量 */
export function parseGrams(segment: string, ref: FoodRef): number {
  const w = segment.match(/(\d+(?:\.\d+)?)\s*(kg|千克|公斤|g|克|ml|毫升|斤|两)/i)
  if (w) {
    const v = parseFloat(w[1])
    const unit = w[2].toLowerCase()
    if (unit === 'kg' || unit === '千克' || unit === '公斤') return v * 1000
    if (unit === '斤') return v * 500
    if (unit === '两') return v * 50
    return v
  }
  const count = segment.match(/(\d+(?:\.\d+)?|[半一两二三四五六七八九十])\s*[个碗份杯根片块盒瓶勺把]?/)
  if (count) {
    const n = /\d/.test(count[1]) ? parseFloat(count[1]) : CN_NUM[count[1]]
    if (n) return n * ref.serving
  }
  return ref.serving
}

/** 本地离线识别：按逗号/顿号/“和”拆分，逐段匹配食物库 */
export function parseLocal(text: string): { items: FoodItem[]; unknown: string[] } {
  const items: FoodItem[] = []
  const unknown: string[] = []
  for (const raw of text.split(/[,，、;；\n]|和|还有|加/)) {
    const seg = raw.trim()
    if (!seg) continue
    const ref = findFood(seg)
    if (ref) items.push(scaleFood(ref, parseGrams(seg, ref)))
    else unknown.push(seg)
  }
  return { items, unknown }
}

/** Mifflin-St Jeor 公式估算每日总能量消耗 */
export function estimateTDEE(p: { sex: 'male' | 'female'; age: number; height: number; weight: number; activity: number }): number {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'male' ? 5 : -161)
  return Math.round(bmr * p.activity)
}
