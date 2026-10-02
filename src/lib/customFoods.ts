import { ref } from 'vue'
import type { FoodRef } from '../data/foods.ts'
import * as db from './db.ts'
import { setCustomFoods } from './foodLibrary.ts'

/** 自定义食物（响应式），变更后同步到食物库供识别、计划、搜索使用 */
export const customList = ref<FoodRef[]>([])

function sync(list: FoodRef[]) {
  customList.value = list
  setCustomFoods(list)
}

/** 启动或导入备份后调用 */
export async function loadCustomFoods() {
  sync(await db.listFoods())
}

/** 新增或更新；同名的旧条目会被替换 */
export async function saveCustomFood(f: FoodRef): Promise<FoodRef> {
  const old = customList.value.find((x) => x.id === f.id || x.name === f.name)
  const saved: FoodRef = { ...f, id: f.id ?? old?.id ?? db.uid(), source: f.source ?? 'custom' }
  if (old && old.id !== saved.id) await db.deleteFood(old.id!)
  await db.saveFood(saved)
  sync([...customList.value.filter((x) => x.id !== saved.id && x.id !== old?.id), saved])
  return saved
}

export async function removeCustomFood(id: string) {
  await db.deleteFood(id)
  sync(customList.value.filter((f) => f.id !== id))
}
