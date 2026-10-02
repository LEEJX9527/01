import { BUILTIN_FOODS, type FoodRef } from '../data/foods.ts'

/**
 * 食物库：内置 + 用户自定义。
 * 自定义食物同名时覆盖内置（用户按包装录入的数据更准确）。
 * 纯内存实现，持久化由 customFoods.ts 负责，方便单元测试。
 */
let custom: FoodRef[] = []
let merged: FoodRef[] = BUILTIN_FOODS

export function setCustomFoods(list: FoodRef[]) {
  custom = list
  const names = new Set(list.map((f) => f.name))
  merged = [...list, ...BUILTIN_FOODS.filter((f) => !names.has(f.name))]
}

export const allFoods = () => merged
export const customFoods = () => custom
export const findFoodByName = (name: string) => merged.find((f) => f.name === name)

/** 按名称、别名、品牌模糊搜索（忽略大小写） */
export function searchFoods(q: string): FoodRef[] {
  const s = q.trim().toLowerCase()
  if (!s) return merged
  return merged.filter(
    (f) =>
      f.name.toLowerCase().includes(s) ||
      (f.brand ?? '').toLowerCase().includes(s) ||
      (f.aliases ?? []).some((a) => a.toLowerCase().includes(s)),
  )
}
