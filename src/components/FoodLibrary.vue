<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { FoodCategory, FoodRef } from '../data/foods.ts'
import { BUILTIN_FOODS } from '../data/foods.ts'
import { customList, removeCustomFood, saveCustomFood } from '../lib/customFoods.ts'
import { onlineToFood, type OnlineFood } from '../lib/off.ts'
import { searchOnline } from '../lib/onlineFoods.ts'
import { isDesktop } from '../lib/ai.ts'
import { settings } from '../lib/settings.ts'

const emit = defineEmits<{ close: [] }>()

const tab = ref<'mine' | 'online' | 'builtin'>('mine')
const tabs = [['mine', '我的食物'], ['online', '在线搜索'], ['builtin', '内置']] as const

const CATS: [FoodCategory, string][] = [
  ['supplement', '补剂'], ['protein', '蛋白质'], ['staple', '主食'], ['veg', '蔬菜'],
  ['fruit', '水果'], ['dairy', '奶类'], ['nut', '坚果'], ['treat', '零食'],
]
const catLabel = (c: FoodCategory) => CATS.find(([k]) => k === c)?.[1] ?? c

// —— 我的食物：新增 / 编辑表单 ——
const blank = (): FoodRef => ({ name: '', aliases: [], cat: 'supplement', source: 'custom', kcal: 0, protein: 0, fat: 0, carbs: 0, serving: 30 })
const form = reactive<FoodRef>(blank())
const aliasText = ref('')
const editing = ref(false)
const formMsg = ref('')
const confirmId = ref<string>()

function edit(f: FoodRef) {
  Object.assign(form, blank(), f)
  aliasText.value = (f.aliases ?? []).join('、')
  editing.value = true
  formMsg.value = ''
}

function startNew() {
  Object.assign(form, blank())
  delete form.id
  aliasText.value = ''
  editing.value = true
  formMsg.value = ''
}

const nums = ['kcal', 'protein', 'fat', 'carbs', 'serving'] as const
async function submit() {
  const name = form.name.trim()
  if (!name) return void (formMsg.value = '请填写名称')
  if (nums.some((k) => !Number.isFinite(form[k]) || form[k] < 0)) return void (formMsg.value = '营养数值不能为负')
  if (form.serving <= 0) return void (formMsg.value = '一份的克数需大于 0')
  if (form.protein + form.fat + form.carbs > 100) return void (formMsg.value = '每 100g 的三大营养素合计不能超过 100g')
  const aliases = aliasText.value.split(/[、,，\s]+/).map((s) => s.trim()).filter((s) => s && s !== name)
  await saveCustomFood({ ...form, name, aliases, brand: form.brand?.trim() || undefined })
  editing.value = false
}

async function remove(f: FoodRef) {
  if (confirmId.value !== f.id) return void (confirmId.value = f.id)
  await removeCustomFood(f.id!)
  confirmId.value = undefined
}

const mine = computed(() => [...customList.value].sort((a, b) => a.name.localeCompare(b.name, 'zh')))

// —— 在线搜索 ——
const q = ref('')
const results = ref<OnlineFood[]>([])
const searching = ref(false)
const searchMsg = ref('')
const servings = reactive<Record<string, number>>({})
const added = reactive(new Set<string>())
const canOnline = isDesktop || (settings.companionUrl && settings.companionKey)

async function doSearch() {
  const s = q.value.trim()
  if (!s || searching.value) return
  searching.value = true
  searchMsg.value = ''
  try {
    results.value = await searchOnline({ url: settings.companionUrl, accessKey: settings.companionKey }, s)
    for (const r of results.value) servings[r.code] ??= r.serving || 30
    if (!results.value.length) searchMsg.value = '没有找到带营养数据的结果，可以试试英文或品牌名'
  } catch (err) {
    results.value = []
    searchMsg.value = (err as Error).message
  } finally {
    searching.value = false
  }
}

async function addOnline(o: OnlineFood) {
  const serving = Number(servings[o.code]) > 0 ? Number(servings[o.code]) : 30
  await saveCustomFood(onlineToFood(o, serving))
  added.add(o.code)
}

// —— 内置 ——
const bq = ref('')
const builtin = computed(() => {
  const s = bq.value.trim()
  return s ? BUILTIN_FOODS.filter((f) => f.name.includes(s) || f.aliases?.some((a) => a.includes(s))) : BUILTIN_FOODS
})

const per100 = (f: { kcal: number; protein: number; fat: number; carbs: number }) =>
  `${f.kcal} kcal · 蛋白 ${f.protein} · 脂肪 ${f.fat} · 碳水 ${f.carbs}`
</script>

<template>
  <div class="fixed inset-0 z-30 grid place-items-center bg-ink/15 p-4 backdrop-blur-[3px]" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div role="dialog" aria-modal="true" aria-labelledby="lib-title" class="card flex max-h-[88vh] w-full max-w-lg flex-col p-7">
      <div class="mb-5 flex items-center justify-between">
        <h2 id="lib-title" class="text-lg font-light tracking-wide">食物库</h2>
        <button class="quiet grid h-8 w-8 place-items-center rounded-full" aria-label="关闭" @click="emit('close')">✕</button>
      </div>

      <div class="mb-5 grid grid-cols-3 gap-1 rounded-full p-1" style="box-shadow: var(--sunken)" role="tablist" aria-label="食物库分类">
        <button
          v-for="[k, label] in tabs"
          :key="k"
          role="tab"
          :aria-selected="tab === k"
          :class="['rounded-full py-1.5 text-xs transition-all duration-300', tab === k ? 'bg-surface text-ink' : 'text-muted']"
          :style="tab === k ? 'box-shadow: var(--raised-sm)' : ''"
          @click="tab = k"
        >
          {{ label }}
        </button>
      </div>

      <div class="-mx-2 min-h-0 flex-1 overflow-y-auto px-2">
        <!-- 我的食物 -->
        <section v-if="tab === 'mine'" class="space-y-3">
          <form v-if="editing" class="space-y-3 rounded-2xl p-4" style="box-shadow: var(--sunken)" @submit.prevent="submit">
            <div class="grid grid-cols-2 gap-3 text-xs text-muted">
              <label class="col-span-2 space-y-1.5">名称<input v-model="form.name" class="field" placeholder="如：康比特乳清蛋白" maxlength="40" /></label>
              <label class="space-y-1.5">品牌<input v-model="form.brand" class="field" placeholder="可选" maxlength="40" /></label>
              <label class="space-y-1.5">分类
                <select v-model="form.cat" class="field"><option v-for="[k, l] in CATS" :key="k" :value="k">{{ l }}</option></select>
              </label>
              <label class="col-span-2 space-y-1.5">别名<input v-model="aliasText" class="field" placeholder="用顿号或逗号分隔，识别时也会匹配" /></label>
            </div>
            <p class="eyebrow pt-1">每 100g</p>
            <div class="grid grid-cols-4 gap-2 text-xs text-muted">
              <label class="space-y-1.5">热量 kcal<input v-model.number="form.kcal" type="number" min="0" step="any" class="field num" /></label>
              <label class="space-y-1.5">蛋白质 g<input v-model.number="form.protein" type="number" min="0" step="any" class="field num" /></label>
              <label class="space-y-1.5">脂肪 g<input v-model.number="form.fat" type="number" min="0" step="any" class="field num" /></label>
              <label class="space-y-1.5">碳水 g<input v-model.number="form.carbs" type="number" min="0" step="any" class="field num" /></label>
            </div>
            <label class="block space-y-1.5 text-xs text-muted">一份的克数（“一勺”“一根”时使用）<input v-model.number="form.serving" type="number" min="1" class="field num" /></label>
            <p v-if="formMsg" class="text-xs text-clay" role="alert">{{ formMsg }}</p>
            <div class="flex gap-2">
              <button type="submit" class="tactile is-accent rounded-full px-5 py-2 text-sm">保存</button>
              <button type="button" class="quiet rounded-full px-4 py-2 text-sm" @click="editing = false">取消</button>
            </div>
          </form>
          <button v-else class="tactile flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm" @click="startNew">
            <span class="text-base leading-none text-sage">＋</span> 按包装录入
          </button>

          <p v-if="!mine.length && !editing" class="py-6 text-center text-xs leading-loose text-faint">
            还没有自定义食物<br />按包装上的营养成分表录入，或从「在线搜索」添加
          </p>
          <ul class="space-y-1">
            <li v-for="f in mine" :key="f.id" class="group flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-black/[0.025]">
              <button class="min-w-0 flex-1 text-left" @click="edit(f)">
                <div class="truncate text-sm">
                  {{ f.name }}
                  <span class="ml-1 text-[0.65rem] text-faint">{{ catLabel(f.cat) }}{{ f.source === 'off' ? ' · 在线' : '' }}</span>
                </div>
                <div class="num mt-0.5 truncate text-[0.68rem] text-muted">{{ per100(f) }} · 一份 {{ f.serving }}g</div>
              </button>
              <button
                :class="['grid h-7 place-items-center rounded-full text-xs transition-all duration-300', confirmId === f.id ? 'w-14 bg-clay-soft text-clay' : 'quiet w-7 opacity-0 group-hover:opacity-100 focus:opacity-100']"
                :aria-label="confirmId === f.id ? `确认删除 ${f.name}` : `删除 ${f.name}`"
                @click="remove(f)"
              >{{ confirmId === f.id ? '确认' : '✕' }}</button>
            </li>
          </ul>
        </section>

        <!-- 在线搜索：Open Food Facts -->
        <section v-else-if="tab === 'online'" class="space-y-3">
          <p v-if="!canOnline" class="rounded-2xl p-4 text-xs leading-relaxed text-muted" style="box-shadow: var(--sunken)">
            浏览器无法直接访问 Open Food Facts（跨域限制）。请使用桌面版，或在设置中配置 Companion 后再搜索。
          </p>
          <template v-else>
            <form class="flex gap-2" role="search" @submit.prevent="doSearch">
              <input v-model="q" class="field flex-1" placeholder="品牌或产品名，如 Optimum Whey、肌肉科技" maxlength="100" aria-label="在线搜索食物" />
              <button type="submit" class="tactile is-accent rounded-full px-5 text-sm" :disabled="searching || !q.trim()">{{ searching ? '搜索中' : '搜索' }}</button>
            </form>
            <p class="text-[0.68rem] leading-relaxed text-faint">数据来自 Open Food Facts 开源数据库，由用户上传，添加前请对照包装核对。英文和品牌名命中率更高。</p>
          </template>

          <div v-if="searching" class="flex items-center gap-1.5 px-2 py-2" role="status" aria-label="搜索中">
            <span v-for="i in 3" :key="i" class="dot h-1.5 w-1.5 rounded-full bg-sage" />
          </div>
          <p v-else-if="searchMsg" class="px-1 text-xs text-muted" role="status">{{ searchMsg }}</p>

          <ul class="space-y-1">
            <li v-for="o in results" :key="o.code" class="flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-black/[0.025]">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm">{{ o.name }}<span v-if="o.brand" class="ml-1.5 text-[0.68rem] text-faint">{{ o.brand }}</span></div>
                <div class="num mt-0.5 truncate text-[0.68rem] text-muted">每 100g · {{ per100(o) }}</div>
              </div>
              <label class="flex items-center gap-1 text-[0.68rem] text-muted">
                一份
                <input v-model.number="servings[o.code]" type="number" min="1" class="num w-12 rounded-full bg-paper px-2 py-1 text-center text-xs focus:outline-none" style="box-shadow: var(--sunken)" :aria-label="`${o.name} 一份克数`" />
                g
              </label>
              <button
                :class="['rounded-full px-3 py-1.5 text-xs', added.has(o.code) ? 'text-sage' : 'tactile']"
                :disabled="added.has(o.code)"
                @click="addOnline(o)"
              >{{ added.has(o.code) ? '已添加' : '添加' }}</button>
            </li>
          </ul>
        </section>

        <!-- 内置 -->
        <section v-else class="space-y-3">
          <input v-model="bq" class="field" placeholder="筛选" aria-label="筛选内置食物" />
          <ul class="space-y-0.5">
            <li v-for="f in builtin" :key="f.name" class="rounded-2xl px-3 py-2">
              <div class="text-sm">{{ f.name }}<span class="ml-1.5 text-[0.65rem] text-faint">{{ catLabel(f.cat) }}</span></div>
              <div class="num mt-0.5 text-[0.68rem] text-muted">{{ per100(f) }} · 一份 {{ f.serving }}g</div>
            </li>
          </ul>
          <p class="text-center text-[0.68rem] text-faint">内置数据为近似值，不可修改。同名的自定义食物会优先使用。</p>
        </section>
      </div>
    </div>
  </div>
</template>
