import type { FoodRef } from '../data/foods.ts'

/**
 * Open Food Facts（开源食品数据库）搜索结果的标准化。
 * 桌面端由 Rust 后端、网页版由 Companion 请求 search.openfoodfacts.org，
 * 因为该接口不允许浏览器跨域直接调用。
 */
export interface OnlineFood {
  code: string
  name: string
  brand: string
  kcal: number
  protein: number
  fat: number
  carbs: number
  /** 包装上标注的一份克数，没有时为 0 */
  serving: number
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
const round1 = (n: number) => Math.round(n * 10) / 10

/** 解析 search.openfoodfacts.org 的 hits，丢弃没有热量数据的条目 */
export function normalizeOffHits(hits: unknown): OnlineFood[] {
  if (!Array.isArray(hits)) return []
  const out: OnlineFood[] = []
  for (const h of hits as Record<string, any>[]) {
    const n = h?.nutriments ?? {}
    // 部分条目只有 kJ，按 4.184 换算
    const kcal = num(n['energy-kcal_100g']) || num(n['energy_100g']) / 4.184
    const name = String(h?.product_name_zh || h?.product_name || '').trim()
    if (!name || !kcal) continue
    const brands = Array.isArray(h.brands) ? h.brands.join(', ') : String(h.brands ?? '')
    out.push({
      code: String(h.code ?? ''),
      name,
      brand: brands.trim(),
      kcal: Math.round(kcal),
      protein: round1(num(n.proteins_100g)),
      fat: round1(num(n.fat_100g)),
      carbs: round1(num(n.carbohydrates_100g)),
      serving: Math.round(num(h.serving_quantity)),
    })
  }
  return out
}

/** 在线结果转为自定义食物 */
export function onlineToFood(o: OnlineFood, serving = o.serving || 30): FoodRef {
  return {
    name: o.brand && !o.name.includes(o.brand) ? `${o.brand} ${o.name}` : o.name,
    brand: o.brand || undefined,
    cat: 'supplement',
    source: 'off',
    kcal: o.kcal,
    protein: o.protein,
    fat: o.fat,
    carbs: o.carbs,
    serving,
  }
}
