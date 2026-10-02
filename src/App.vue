<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import MealCard from './components/MealCard.vue'
import BreathRing from './components/BreathRing.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import { settings } from './lib/settings.ts'
import { parseLocal, sumItems, type FoodItem } from './lib/nutrition.ts'
import { analyzeWithAi, analyzeWithCompanion, desktop } from './lib/ai.ts'
import * as db from './lib/db.ts'

const today = () => new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD

const sessions = ref<db.Session[]>([])
const current = ref<db.Session | null>(null)
const messages = ref<db.Message[]>([])
const search = ref('')
const image = ref<string>()
const busy = ref(false)
const showSettings = ref(false)
const sidebarOpen = ref(false)
const listEl = ref<HTMLElement>()

const filtered = computed(() => sessions.value.filter((s) => s.title.includes(search.value) || s.date.includes(search.value)))
const dayItems = computed(() => messages.value.flatMap((m) => m.items ?? []))
const dayTotal = computed(() => sumItems(dayItems.value))
const modeLabel = computed(() => ({ local: '本地食物库', ai: 'AI 直连', companion: 'Companion', desktop: 'AI 识别' })[settings.mode])
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 5 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好'
})
const dateLabel = (d: string) => {
  if (d === today()) return '今天'
  const [, m, day] = d.split('-')
  return `${Number(m)}月${Number(day)}日`
}

async function refresh() {
  sessions.value = await db.listSessions()
}

async function newSession() {
  const s: db.Session = { id: db.uid(), title: `${today()} 饮食记录`, date: today(), draft: '', updatedAt: Date.now() }
  await db.saveSession(s)
  await refresh()
  await open(s)
}

async function open(s: db.Session) {
  current.value = s
  messages.value = await db.listMessages(s.id)
  sidebarOpen.value = false
  scrollDown()
}

// 行内重命名与二次确认删除（避免 prompt/confirm 原生弹窗打断节奏）
const editingId = ref<string>()
const editTitle = ref('')
const confirmId = ref<string>()

function startRename(s: db.Session) {
  editingId.value = s.id
  editTitle.value = s.title
  nextTick(() => document.getElementById(`rename-${s.id}`)?.focus())
}

async function commitRename(s: db.Session) {
  const title = editTitle.value.trim()
  editingId.value = undefined
  if (!title || title === s.title) return
  s.title = title
  await db.saveSession(s)
  await refresh()
}

async function remove(s: db.Session) {
  if (confirmId.value !== s.id) {
    confirmId.value = s.id
    setTimeout(() => confirmId.value === s.id && (confirmId.value = undefined), 3000)
    return
  }
  confirmId.value = undefined
  await db.deleteSession(s.id)
  await refresh()
  if (current.value?.id === s.id) sessions.value[0] ? await open(sessions.value[0]) : await newSession()
}

function scrollDown() {
  nextTick(() => listEl.value?.scrollTo({ top: listEl.value.scrollHeight, behavior: 'smooth' }))
}

// 草稿随会话保存
let draftTimer: number | undefined
watch(() => current.value?.draft, () => {
  clearTimeout(draftTimer)
  draftTimer = window.setTimeout(() => current.value && db.saveSession(current.value), 400)
})

function pickImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file) return
  // 压缩到最长边 1024px，降低存储与请求体积
  const img = new Image()
  img.onload = () => {
    const scale = Math.min(1, 1024 / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = img.width * scale
    c.height = img.height * scale
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    image.value = c.toDataURL('image/jpeg', 0.85)
    URL.revokeObjectURL(img.src)
  }
  img.src = URL.createObjectURL(file)
}

async function send(retryText?: string, retryImage?: string) {
  const s = current.value
  if (!s || busy.value) return
  const text = (retryText ?? s.draft).trim()
  const img = retryText !== undefined ? retryImage : image.value
  if (!text && !img) return

  busy.value = true
  // finally 保证无论哪一步抛错，发送按钮都会恢复
  try {
    if (retryText === undefined) {
      const userMsg: db.Message = { id: db.uid(), sessionId: s.id, role: 'user', text, image: img, createdAt: Date.now() }
      messages.value.push(userMsg)
      s.draft = ''
      image.value = undefined
      await db.saveMessage(userMsg)
    }
    scrollDown()
    const reply = await analyze(s.id, text, img)
    messages.value.push(reply)
    await db.saveMessage(reply)
    s.updatedAt = Date.now()
    await db.saveSession(s)
    await refresh()
  } catch (err) {
    console.error(err)
    messages.value.push({ id: db.uid(), sessionId: s.id, role: 'assistant', text: `保存失败：${(err as Error).message}`, error: true, createdAt: Date.now() })
  } finally {
    busy.value = false
    scrollDown()
  }
}

/** 识别食物，错误转为带 error 标记的回复（可重试） */
async function analyze(sessionId: string, text: string, img?: string): Promise<db.Message> {
  const reply: db.Message = { id: db.uid(), sessionId, role: 'assistant', text: '', createdAt: Date.now() }
  try {
    if (settings.mode !== 'local') {
      const r =
        settings.mode === 'desktop'
          ? await desktop.analyze(text, img)
          : settings.mode === 'companion'
            ? await analyzeWithCompanion({ url: settings.companionUrl, accessKey: settings.companionKey }, text, img)
            : await analyzeWithAi(settings, text, img)
      reply.items = r.items
      reply.text = r.note || (r.items.length ? '' : '没有识别到食物')
    } else {
      if (img && !text) throw new Error('本地模式无法识别图片，请在设置中切换到 AI 识别，或用文字描述')
      const r = parseLocal(text)
      reply.items = r.items
      reply.text = r.unknown.length ? `未在食物库中找到：${r.unknown.join('、')}` : ''
      if (!r.items.length) reply.error = true
    }
  } catch (err) {
    reply.text = (err as Error).message
    reply.error = true
  }
  return reply
}

async function retry(m: db.Message) {
  const idx = messages.value.indexOf(m)
  const prev = messages.value.slice(0, idx).reverse().find((x) => x.role === 'user')
  if (!prev) return
  messages.value.splice(idx, 1)
  await db.deleteMessage(m.id)
  await send(prev.text, prev.image)
}

async function updateItems(m: db.Message, items: FoodItem[]) {
  m.items = items
  await db.saveMessage(m)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    send()
  }
}

onMounted(async () => {
  await refresh()
  const todays = sessions.value.find((s) => s.date === today())
  todays ? await open(todays) : await newSession()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <!-- 侧边栏 -->
    <Transition name="fade">
      <div v-if="sidebarOpen" class="fixed inset-0 z-10 bg-ink/10 md:hidden" @click="sidebarOpen = false" />
    </Transition>
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-20 flex w-72 flex-col bg-paper px-5 pt-8 pb-5 transition-transform duration-500 md:static md:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
      style="transition-timing-function: var(--ease-out)"
    >
      <div class="mb-8 flex items-center gap-2.5 px-2">
        <span class="breathe h-2.5 w-2.5 rounded-full bg-sage" aria-hidden="true" />
        <span class="text-[0.95rem] tracking-wide">Calorie Studio</span>
      </div>

      <button class="tactile mb-4 flex items-center justify-center gap-2 rounded-2xl py-3 text-sm" @click="newSession">
        <span class="text-base leading-none text-sage">＋</span> 新记录
      </button>
      <input v-model="search" class="field mb-5" placeholder="搜索" aria-label="搜索记录" />

      <nav class="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1" aria-label="记录列表">
        <TransitionGroup name="fade">
          <div
            v-for="s in filtered"
            :key="s.id"
            :class="[
              'group flex items-center gap-1 rounded-2xl pr-1 transition-all duration-300',
              s.id === current?.id ? 'bg-surface' : 'hover:bg-black/[0.025]',
            ]"
            :style="s.id === current?.id ? 'box-shadow: var(--raised)' : ''"
          >
            <input
              v-if="editingId === s.id"
              :id="`rename-${s.id}`"
              v-model="editTitle"
              class="field my-1 ml-1 py-1.5"
              aria-label="新名称"
              @keydown.enter="commitRename(s)"
              @keydown.esc="editingId = undefined"
              @blur="commitRename(s)"
            />
            <button v-else class="min-w-0 flex-1 px-4 py-3 text-left" @click="open(s)" @dblclick="startRename(s)">
              <div :class="['truncate text-sm', s.id === current?.id ? 'text-ink' : 'text-muted']">{{ s.title }}</div>
              <div class="mt-0.5 text-[0.68rem] text-faint">{{ dateLabel(s.date) }}</div>
            </button>
            <template v-if="editingId !== s.id">
              <button class="quiet grid h-7 w-7 place-items-center rounded-full text-xs opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label="重命名" @click="startRename(s)">✎</button>
              <button
                :class="['grid h-7 place-items-center rounded-full text-xs transition-all duration-300', confirmId === s.id ? 'w-14 bg-clay-soft text-clay' : 'quiet w-7 opacity-0 group-hover:opacity-100 focus:opacity-100']"
                :aria-label="confirmId === s.id ? '确认删除' : '删除'"
                @click="remove(s)"
              >{{ confirmId === s.id ? '确认' : '✕' }}</button>
            </template>
          </div>
        </TransitionGroup>
      </nav>

      <button class="quiet mt-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm" @click="showSettings = true">
        <span aria-hidden="true">⚙</span> 设置
        <span class="ml-auto text-[0.68rem] text-faint">{{ modeLabel }}</span>
      </button>
    </aside>

    <main class="relative flex min-w-0 flex-1 flex-col bg-surface md:my-3 md:mr-3 md:rounded-[28px]" style="box-shadow: var(--raised)">
      <header class="flex items-center gap-3 px-6 pt-6 md:px-10">
        <button class="quiet grid h-9 w-9 place-items-center rounded-full md:hidden" aria-label="打开记录列表" @click="sidebarOpen = true">☰</button>
        <div class="min-w-0 flex-1">
          <p class="eyebrow">{{ greeting }}</p>
          <h1 class="mt-1 truncate text-xl font-light tracking-wide">{{ current?.title }}</h1>
        </div>
      </header>

      <div ref="listEl" class="flex-1 overflow-y-auto px-6 pb-8 md:px-10" aria-live="polite">
        <!-- 当日概览：呼吸环 + 宏量 -->
        <section class="rise mx-auto my-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-12 gap-y-6">
          <BreathRing :value="dayTotal.kcal" :goal="settings.dailyGoal" />
          <dl class="grid grid-cols-3 gap-8 sm:grid-cols-1 sm:gap-4">
            <div v-for="[k, v] in [['蛋白质', dayTotal.protein], ['碳水', dayTotal.carbs], ['脂肪', dayTotal.fat]]" :key="k">
              <dt class="eyebrow">{{ k }}</dt>
              <dd class="num mt-0.5 text-lg font-light">{{ v }}<span class="ml-0.5 text-xs text-muted">g</span></dd>
            </div>
          </dl>
        </section>

        <div class="mx-auto max-w-2xl space-y-5">
          <p v-if="!messages.length" class="rise py-6 text-center text-sm leading-loose text-faint" style="animation-delay: 160ms">
            慢慢来，告诉我你吃了什么<br />
            <span class="text-xs">“一碗米饭、150g 鸡胸肉和一个苹果”</span>
          </p>

          <div v-for="m in messages" :key="m.id" :class="['rise flex', m.role === 'user' ? 'justify-end' : 'justify-start']">
            <div v-if="m.role === 'user'" class="max-w-[78%] space-y-2 rounded-[22px] rounded-br-md bg-sage-soft px-5 py-3 text-[0.95rem]">
              <img v-if="m.image" :src="m.image" alt="上传的食物照片" class="max-h-60 rounded-2xl" />
              <p v-if="m.text" class="whitespace-pre-wrap">{{ m.text }}</p>
            </div>
            <div v-else class="w-full space-y-2.5">
              <MealCard v-if="m.items?.length" :items="m.items" @update="updateItems(m, $event)" />
              <p v-if="m.text" :class="['px-2 text-sm leading-relaxed', m.error ? 'text-clay' : 'text-muted']">{{ m.text }}</p>
              <button v-if="m.error" class="tactile rounded-full px-4 py-1.5 text-xs" @click="retry(m)">重试</button>
            </div>
          </div>

          <!-- 识别中：三点呼吸 -->
          <div v-if="busy" class="rise flex items-center gap-1.5 px-2 py-2" role="status" aria-label="分析中">
            <span v-for="i in 3" :key="i" class="dot h-1.5 w-1.5 rounded-full bg-sage" />
          </div>
        </div>
      </div>

      <!-- 输入区：悬浮的触感胶囊 -->
      <footer v-if="current" class="px-6 pb-6 md:px-10">
        <div class="mx-auto max-w-2xl">
          <Transition name="sheet">
            <div v-if="image" class="relative mb-3 inline-block">
              <img :src="image" alt="待发送的图片" class="h-20 rounded-2xl" style="box-shadow: var(--raised)" />
              <button class="tactile absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full text-[0.65rem]" aria-label="移除图片" @click="image = undefined">✕</button>
            </div>
          </Transition>
          <div :class="['flex items-end gap-2 rounded-[26px] bg-paper p-2 transition-shadow duration-500', busy && 'breathe-soft']" style="box-shadow: var(--sunken)">
            <label class="quiet grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full" title="上传食物照片">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              <span class="sr-only">上传食物照片</span>
              <input type="file" accept="image/*" capture="environment" class="sr-only" @change="pickImage" />
            </label>
            <textarea
              v-model="current.draft"
              rows="1"
              class="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[0.95rem] placeholder:text-faint focus:outline-none [field-sizing:content]"
              placeholder="今天吃了什么？"
              aria-label="输入食物描述，Enter 发送，Shift+Enter 换行"
              @keydown="onKey"
            />
            <button class="tactile is-accent grid h-10 w-10 shrink-0 place-items-center rounded-full" :disabled="busy || (!current.draft.trim() && !image)" aria-label="发送" @click="send()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
        </div>
      </footer>
    </main>

    <Transition name="sheet">
      <SettingsDialog v-if="showSettings" @close="showSettings = false" @imported="refresh" />
    </Transition>
  </div>
</template>
