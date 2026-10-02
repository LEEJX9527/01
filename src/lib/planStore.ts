import { reactive, watch } from 'vue'
import type { DietPlan } from './plan.ts'

export interface Profile {
  sex: 'male' | 'female'
  age: number
  height: number
  weight: number
  activity: number
}

export const PLAN_KEY = 'calorie-studio:plan'

interface PlanState {
  plan: DietPlan | null
  profile: Profile
}

const defaults: PlanState = { plan: null, profile: { sex: 'male', age: 28, height: 170, weight: 65, activity: 1.375 } }

function read(): PlanState {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}')
    return { ...defaults, ...saved, profile: { ...defaults.profile, ...saved.profile } }
  } catch {
    return structuredClone(defaults)
  }
}

export const planState = reactive<PlanState>(read())
watch(planState, (v) => localStorage.setItem(PLAN_KEY, JSON.stringify(v)), { deep: true })

/** 导入备份后重新读取 */
export function reloadPlan() {
  Object.assign(planState, read())
}
