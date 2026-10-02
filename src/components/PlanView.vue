<script setup lang="ts">
import { computed, ref } from 'vue'
import { findFoodByName, searchFoods } from '../lib/foodLibrary.ts'
import { customList } from '../lib/customFoods.ts'
import { estimateTDEE, scaleFood, sumItems, type FoodItem, type Totals } from '../lib/nutrition.ts'
import { createPlan, generateMeals, GOALS, MEALS, mealTarget, status, type Goal, type MealKey } from '../lib/plan.ts'
import { planState } from '../lib/planStore.ts'
import { settings } from '../lib/settings.ts'
import MealCard from './MealCard.vue'

const props = defineProps<{ actual: Record<MealKey, Totals>; dayTotal: Totals }>()
const emit = defineEmits<{ logMeal: [meal: MealKey, items: FoodItem[]] }>()

const plan = computed(() => planState.plan)
const editingProfile = ref(!planState.plan)
const goal = ref<Goal>(planState.plan?.goal ?? 'maintain')
const tdee = computed(() => estimateTDEE(planState.profile))
const adding = ref<MealKey>()
const query = ref('')

const suggestions = computed(() => {
  const q = query.value.trim()
  void customList.value // 自定义食物变化时重新计算
  return (q ? searchFoods(q) : searchFoods('').filter((f) => f.cat !== 'treat')).slice(0, 8)
})

function build() {
  planState.plan = createPlan(goal.value, tdee.value, planState.profile.weight)
  // 计划目标同步为每日目标，呼吸环与之对齐
  settings.dailyGoal = planState.plan.targets.kcal
  editingProfile.value = false
}

function shuffle() {
  const p = planState.plan
  if (!p) return
  p.seed = (p.seed * 9301 + 49297) % 233280
  p.meals = generateMeals(p.targets, p.seed)
  p.updatedAt = Date.now()
}

function updateMeal(key: MealKey, items: FoodItem[]) {
  if (!planState.plan) return
  planState.plan.meals[key] = items
  planState.plan.updatedAt = Date.now()
}

function addFood(key: MealKey, name: string) {
  const ref = findFoodByName(name)
  if (!ref || !planState.plan) return
  planState.plan.meals[key] = [...planState.plan.meals[key], scaleFood(ref, ref.serving)]
  adding.value = undefined
  query.value = ''
}

const planned = (key: MealKey) => sumItems(plan.value?.meals[key] ?? [])

const macroRows = computed(() => {
  const t = plan.value?.targets
  if (!t) return []
  return [
    { label: '蛋白质', actual: props.dayTotal.protein, target: t.protein, color: 'var(--color-sage)' },
    { label: '碳水', actual: props.dayTotal.carbs, target: t.carbs, color: '#c9b37e' },
    { label: '脂肪', actual: props.dayTotal.fat, target: t.fat, color: 'var(--color-clay)' },
  ]
})

const statusText = { under: '还差', ok: '达标', over: '超出' } as const
</script>

<template>
  <div class="mx-auto max-w-2xl space-y-6 pb-4">
    <!-- 第一步：身体数据与目标 -->
    <Transition name="sheet" mode="out-in">
      <section v-if="editingProfile" key="form" class="card rise space-y-6 p-6">
        <div>
          <h2 class="text-lg font-light tracking-wide">制定饮食计划</h2>
          <p class="mt-1 text-xs text-muted">根据身体数据估算每日消耗，再按目标分配到四餐。</p>
        </div>

        <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="目标">
          <button
            v-for="(g, key) in GOALS"
            :key="key"
            role="radio"
            :aria-checked="goal === key"
            :class="['tactile rounded-2xl px-3 py-3 text-left', goal === key && 'is-accent']"
            @click="goal = key"
          >
            <div class="text-sm">{{ g.label }}</div>
            <div :class="['mt-0.5 text-[0.65rem] leading-snug', goal === key ? 'text-white/75' : 'text-muted']">{{ g.hint }}</div>
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs text-muted sm:grid-cols-4">
          <label class="space-y-1.5">性别
            <select v-model="planState.profile.sex" class="field"><option value="male">男</option><option value="female">女</option></select>
          </label>
          <label class="space-y-1.5">年龄<input v-model.number="planState.profile.age" type="number" min="10" max="100" class="field num" /></label>
          <label class="space-y-1.5">身高 cm<input v-model.number="planState.profile.height" type="number" min="100" max="230" class="field num" /></label>
          <label class="space-y-1.5">体重 kg<input v-model.number="planState.profile.weight" type="number" min="30" max="250" class="field num" /></label>
          <label class="col-span-2 space-y-1.5 sm:col-span-4">活动水平
            <select v-model.number="planState.profile.activity" class="field">
              <option :value="1.2">久坐（办公室工作，几乎不运动）</option>
              <option :value="1.375">轻度（每周运动 1–3 次）</option>
              <option :value="1.55">中度（每周运动 3–5 次）</option>
              <option :value="1.725">高强度（每周运动 6–7 次）</option>
            </select>
          </label>
        </div>

        <div class="flex items-center justify-between gap-4 border-t border-line pt-5">
          <p class="text-xs text-muted">每日消耗约 <span class="num text-ink">{{ tdee }}</span> kcal</p>
          <div class="flex gap-2">
            <button v-if="plan" class="quiet rounded-full px-4 py-2 text-sm" @click="editingProfile = false">取消</button>
            <button class="tactile is-accent rounded-full px-5 py-2 text-sm" @click="build">{{ plan ? '重新生成' : '生成计划' }}</button>
          </div>
        </div>
      </section>

      <!-- 第二步：计划概览 -->
      <section v-else-if="plan" key="summary" class="card rise p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">{{ GOALS[plan.goal].label }}计划</p>
            <p class="num mt-1 text-[1.9rem] leading-none font-light">{{ plan.targets.kcal }}<span class="ml-1 text-xs text-muted">kcal / 天</span></p>
          </div>
          <button class="quiet rounded-full px-3 py-1.5 text-xs" @click="editingProfile = true">调整</button>
        </div>
        <div class="mt-6 space-y-3.5">
          <div v-for="m in macroRows" :key="m.label">
            <div class="mb-1.5 flex justify-between text-xs">
              <span class="text-muted">{{ m.label }}</span>
              <span class="num"><span class="text-ink">{{ m.actual }}</span><span class="text-faint"> / {{ m.target }} g</span></span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-black/[0.05]">
              <div class="h-full rounded-full transition-[width] duration-1000" :style="{ width: Math.min(100, (m.actual / (m.target || 1)) * 100) + '%', background: m.color, transitionTimingFunction: 'var(--ease-spring)' }" />
            </div>
          </div>
        </div>
      </section>
    </Transition>

    <!-- 第三步：四餐菜单 -->
    <template v-if="plan && !editingProfile">
      <div class="flex items-center justify-between px-1">
        <h3 class="eyebrow">今日菜单</h3>
        <button class="tactile flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs" @click="shuffle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" /></svg>
          换一批
        </button>
      </div>

      <section v-for="(m, i) in MEALS" :key="m.key" class="rise space-y-2.5" :style="{ animationDelay: i * 80 + 'ms' }">
        <div class="flex items-baseline justify-between px-2">
          <h4 class="text-[0.95rem]">{{ m.label }}</h4>
          <div class="flex items-center gap-3 text-xs">
            <span class="num text-muted">计划 {{ planned(m.key).kcal }} · 目标 {{ mealTarget(plan.targets, m.key) }}</span>
            <!-- 实际摄入状态 -->
            <span
              v-if="actual[m.key].kcal"
              :class="[
                'num rounded-full px-2.5 py-0.5',
                { under: 'bg-black/[0.04] text-muted', ok: 'bg-sage-soft text-sage-deep', over: 'bg-clay-soft text-clay' }[status(actual[m.key].kcal, mealTarget(plan.targets, m.key))],
              ]"
            >
              已吃 {{ actual[m.key].kcal }} · {{ statusText[status(actual[m.key].kcal, mealTarget(plan.targets, m.key))] }}
            </span>
          </div>
        </div>

        <MealCard v-if="plan.meals[m.key].length" :items="plan.meals[m.key]" @update="updateMeal(m.key, $event)" />

        <div class="flex flex-wrap items-center gap-2 px-1">
          <button class="tactile is-accent rounded-full px-4 py-1.5 text-xs" :disabled="!plan.meals[m.key].length" @click="emit('logMeal', m.key, plan.meals[m.key])">
            按计划记录
          </button>
          <button class="quiet rounded-full px-3 py-1.5 text-xs" :aria-expanded="adding === m.key" @click="adding = adding === m.key ? undefined : m.key; query = ''">＋ 添加食物</button>
        </div>

        <Transition name="sheet">
          <div v-if="adding === m.key" class="space-y-2.5 rounded-2xl p-3" style="box-shadow: var(--sunken)">
            <input v-model="query" class="field bg-surface" placeholder="搜索食物库" :aria-label="`为${m.label}搜索食物`" />
            <div class="flex flex-wrap gap-1.5">
              <button v-for="f in suggestions" :key="f.name" class="tactile rounded-full px-3 py-1 text-xs" @click="addFood(m.key, f.name)">
                {{ f.name }} <span class="num text-faint">{{ Math.round((f.kcal * f.serving) / 100) }}</span>
              </button>
              <p v-if="!suggestions.length" class="px-1 text-xs text-faint">食物库里没有找到</p>
            </div>
          </div>
        </Transition>
      </section>

      <p class="px-2 text-[0.7rem] leading-relaxed text-faint">
        热量与营养估算基于 Mifflin-St Jeor 公式和常见食物成分，仅供日常参考，不构成医疗或营养建议。如有慢性病、孕期或特殊饮食需求，请咨询医生或注册营养师。
      </p>
    </template>
  </div>
</template>
