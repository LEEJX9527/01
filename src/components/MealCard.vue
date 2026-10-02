<script setup lang="ts">
import { computed } from 'vue'
import { sumItems, type FoodItem } from '../lib/nutrition.ts'

const props = defineProps<{ items: FoodItem[] }>()
const emit = defineEmits<{ update: [items: FoodItem[]] }>()
const total = computed(() => sumItems(props.items))

// 宏量营养素占比（按能量：蛋白/碳水 4 kcal/g，脂肪 9 kcal/g）
const macros = computed(() => {
  const p = total.value.protein * 4
  const f = total.value.fat * 9
  const c = total.value.carbs * 4
  const sum = p + f + c || 1
  return [
    { key: '蛋白质', g: total.value.protein, pct: (p / sum) * 100, color: 'var(--color-sage)' },
    { key: '碳水', g: total.value.carbs, pct: (c / sum) * 100, color: '#c9b37e' },
    { key: '脂肪', g: total.value.fat, pct: (f / sum) * 100, color: 'var(--color-clay)' },
  ]
})

// 修改克数时按比例缩放营养值
function setGrams(i: number, grams: number) {
  const old = props.items[i]
  if (!old.grams || !Number.isFinite(grams) || grams < 0) return
  const f = grams / old.grams
  const r = (n: number) => Math.round(n * f * 10) / 10
  const next = [...props.items]
  next[i] = { ...old, grams, kcal: Math.round(old.kcal * f), protein: r(old.protein), fat: r(old.fat), carbs: r(old.carbs) }
  emit('update', next)
}

function nudge(i: number, delta: number) {
  setGrams(i, Math.max(0, props.items[i].grams + delta))
}

function remove(i: number) {
  emit('update', props.items.filter((_, idx) => idx !== i))
}
</script>

<template>
  <div class="card p-5">
    <ul class="space-y-1">
      <li v-for="(it, i) in items" :key="it.name + i" class="group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-300 hover:bg-black/[0.025]">
        <span class="flex-1 truncate text-[0.95rem]">{{ it.name }}</span>

        <!-- 克数微调：± 按钮 + 可直接输入 -->
        <div class="flex items-center gap-0.5 rounded-full bg-paper px-1 py-0.5" style="box-shadow: var(--sunken)">
          <button class="quiet grid h-6 w-6 place-items-center rounded-full text-sm" :aria-label="`${it.name} 减少 10 克`" @click="nudge(i, -10)">−</button>
          <input
            :value="it.grams"
            type="number"
            min="0"
            :aria-label="`${it.name} 克数`"
            class="num w-11 bg-transparent text-center text-sm focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            @change="setGrams(i, Number(($event.target as HTMLInputElement).value))"
          />
          <button class="quiet grid h-6 w-6 place-items-center rounded-full text-sm" :aria-label="`${it.name} 增加 10 克`" @click="nudge(i, 10)">+</button>
        </div>
        <span class="text-xs text-muted">g</span>

        <span class="num w-16 text-right text-[0.95rem]">{{ it.kcal }}<span class="ml-0.5 text-xs text-muted">kcal</span></span>
        <button class="quiet grid h-7 w-7 place-items-center rounded-full text-xs opacity-0 group-hover:opacity-100 focus:opacity-100" :aria-label="`删除 ${it.name}`" @click="remove(i)">✕</button>
      </li>
    </ul>

    <div class="mt-4 border-t border-line pt-4">
      <div class="flex items-baseline justify-between">
        <span class="eyebrow">本餐合计</span>
        <span class="num text-xl font-light">{{ total.kcal }}<span class="ml-1 text-xs text-muted">kcal</span></span>
      </div>
      <!-- 宏量营养素比例条 -->
      <div class="mt-3 flex h-1.5 gap-1 overflow-hidden rounded-full" aria-hidden="true">
        <div v-for="m in macros" :key="m.key" class="h-full rounded-full transition-[flex-grow] duration-700" :style="{ flexGrow: m.pct || 0.001, background: m.color }" />
      </div>
      <dl class="mt-2.5 flex gap-5 text-xs text-muted">
        <div v-for="m in macros" :key="m.key" class="flex items-center gap-1.5">
          <span class="h-1.5 w-1.5 rounded-full" :style="{ background: m.color }" aria-hidden="true" />
          <dt>{{ m.key }}</dt>
          <dd class="num text-ink">{{ m.g }}g</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
