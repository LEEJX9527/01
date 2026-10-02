<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { settings } from '../lib/settings.ts'
import { estimateTDEE } from '../lib/nutrition.ts'
import { exportAll, importAll } from '../lib/db.ts'
import { companionStatus, desktop, isDesktop, type DesktopProviderStatus } from '../lib/ai.ts'

const emit = defineEmits<{ close: []; imported: [] }>()
const profile = reactive({ sex: 'male' as 'male' | 'female', age: 28, height: 170, weight: 65, activity: 1.375 })
const msg = ref('')
const status = ref<{ ok: boolean; text: string }>()

// 桌面端 Provider 表单：密钥只写入，不回显
const dp = reactive({ baseUrl: '', model: '', apiKey: '' })
const dpStatus = ref<DesktopProviderStatus>()

const modes = isDesktop
  ? ([['local', '本地食物库', '离线，内置常见食物'], ['desktop', 'AI 识别', '密钥由桌面端安全保管']] as const)
  : ([['local', '本地食物库', '离线，内置常见食物'], ['companion', 'Companion', '密钥留在本机，推荐'], ['ai', '浏览器直连', '密钥存于浏览器']] as const)

onMounted(async () => {
  if (!isDesktop) return
  dpStatus.value = await desktop.status()
  dp.baseUrl = dpStatus.value.baseUrl || 'https://api.openai.com/v1'
  dp.model = dpStatus.value.model
})

async function saveDesktop() {
  try {
    dpStatus.value = await desktop.save(dp.baseUrl, dp.model, dp.apiKey)
    dp.apiKey = ''
    status.value = { ok: true, text: '已保存' }
  } catch (err) {
    status.value = { ok: false, text: (err as Error).message }
  }
}

async function testCompanion() {
  status.value = { ok: true, text: '连接中…' }
  try {
    const r = await companionStatus({ url: settings.companionUrl, accessKey: settings.companionKey })
    status.value = { ok: true, text: `已连接 · ${r.model}` }
  } catch (err) {
    status.value = { ok: false, text: (err as Error).message }
  }
}

async function doExport() {
  const blob = new Blob([await exportAll()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `calorie-studio-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function doImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await importAll(await file.text())
    msg.value = '导入成功'
    emit('imported')
  } catch (err) {
    msg.value = `导入失败：${(err as Error).message}`
  }
}
</script>

<template>
  <div class="fixed inset-0 z-30 grid place-items-center bg-ink/15 p-4 backdrop-blur-[3px]" @click.self="emit('close')" @keydown.esc="emit('close')">
    <div role="dialog" aria-modal="true" aria-labelledby="settings-title" class="card max-h-[88vh] w-full max-w-md overflow-y-auto p-7">
      <div class="mb-7 flex items-center justify-between">
        <h2 id="settings-title" class="text-lg font-light tracking-wide">设置</h2>
        <button class="quiet grid h-8 w-8 place-items-center rounded-full" aria-label="关闭" @click="emit('close')">✕</button>
      </div>

      <section class="mb-8">
        <h3 class="eyebrow mb-3">识别方式</h3>
        <div class="grid gap-2" :class="modes.length === 2 ? 'grid-cols-2' : 'grid-cols-3'" role="radiogroup" aria-label="识别方式">
          <button
            v-for="[value, label, hint] in modes"
            :key="value"
            role="radio"
            :aria-checked="settings.mode === value"
            :class="['tactile rounded-2xl px-3 py-3 text-left', settings.mode === value && 'is-accent']"
            @click="settings.mode = value; status = undefined"
          >
            <div class="text-sm">{{ label }}</div>
            <div :class="['mt-0.5 text-[0.68rem]', settings.mode === value ? 'text-white/75' : 'text-muted']">{{ hint }}</div>
          </button>
        </div>
      </section>

      <Transition name="fade" mode="out-in">
        <section v-if="settings.mode === 'desktop'" key="desktop" class="mb-8 space-y-3">
          <h3 class="eyebrow">接口</h3>
          <label class="block space-y-1.5 text-xs text-muted">API 地址<input v-model.trim="dp.baseUrl" class="field" placeholder="https://api.openai.com/v1" /></label>
          <label class="block space-y-1.5 text-xs text-muted">模型<input v-model.trim="dp.model" class="field" placeholder="需支持图片识别" /></label>
          <label class="block space-y-1.5 text-xs text-muted">
            API 密钥<span v-if="dpStatus?.keyHint" class="num ml-2 text-faint">当前 {{ dpStatus.keyHint }}</span>
            <input v-model.trim="dp.apiKey" type="password" class="field" autocomplete="off" placeholder="留空则保持不变" />
          </label>
          <button class="tactile is-accent rounded-full px-5 py-2 text-sm" @click="saveDesktop">保存</button>
          <p class="text-[0.7rem] leading-relaxed text-faint">密钥保存在系统应用数据目录，由桌面端后台调用接口，界面层无法读取。</p>
        </section>

        <section v-else-if="settings.mode === 'companion'" key="companion" class="mb-8 space-y-3">
          <h3 class="eyebrow">Companion</h3>
          <label class="block space-y-1.5 text-xs text-muted">地址<input v-model.trim="settings.companionUrl" class="field" /></label>
          <label class="block space-y-1.5 text-xs text-muted">连接密钥<input v-model.trim="settings.companionKey" type="password" class="field" autocomplete="off" placeholder="cs_…" /></label>
          <button class="tactile rounded-full px-5 py-2 text-sm" @click="testCompanion">测试连接</button>
          <p class="text-[0.7rem] leading-relaxed text-faint">终端运行 <code>npm run companion -- start</code>，<code>status</code> 查看连接密钥。</p>
        </section>

        <section v-else-if="settings.mode === 'ai'" key="ai" class="mb-8 space-y-3">
          <h3 class="eyebrow">接口</h3>
          <label class="block space-y-1.5 text-xs text-muted">API 地址<input v-model.trim="settings.baseUrl" class="field" placeholder="https://api.openai.com/v1" /></label>
          <label class="block space-y-1.5 text-xs text-muted">API 密钥<input v-model.trim="settings.apiKey" type="password" class="field" autocomplete="off" /></label>
          <label class="block space-y-1.5 text-xs text-muted">模型<input v-model.trim="settings.model" class="field" /></label>
          <p class="text-[0.7rem] leading-relaxed text-clay">密钥保存在浏览器中，请勿在公共设备上使用。</p>
        </section>
      </Transition>
      <p v-if="status && settings.mode !== 'local'" :class="['-mt-5 mb-8 text-xs', status.ok ? 'text-sage' : 'text-clay']" role="status">{{ status.text }}</p>

      <section class="mb-8 space-y-3">
        <h3 class="eyebrow">每日目标</h3>
        <div class="flex items-center gap-3">
          <input v-model.number="settings.dailyGoal" type="number" min="800" step="50" class="field num flex-1" aria-label="每日热量目标（千卡）" />
          <span class="text-xs text-muted">kcal</span>
        </div>
        <details class="group rounded-2xl p-4" style="box-shadow: var(--sunken)">
          <summary class="cursor-pointer list-none text-sm text-muted transition-colors hover:text-ink">
            <span class="mr-1 inline-block transition-transform duration-300 group-open:rotate-90">›</span> 根据身体数据估算
          </summary>
          <div class="mt-4 grid grid-cols-2 gap-3 text-xs text-muted">
            <label class="space-y-1.5">性别<select v-model="profile.sex" class="field"><option value="male">男</option><option value="female">女</option></select></label>
            <label class="space-y-1.5">年龄<input v-model.number="profile.age" type="number" class="field num" /></label>
            <label class="space-y-1.5">身高 cm<input v-model.number="profile.height" type="number" class="field num" /></label>
            <label class="space-y-1.5">体重 kg<input v-model.number="profile.weight" type="number" class="field num" /></label>
            <label class="col-span-2 space-y-1.5">活动水平
              <select v-model.number="profile.activity" class="field">
                <option :value="1.2">久坐</option><option :value="1.375">轻度运动</option>
                <option :value="1.55">中度运动</option><option :value="1.725">高强度运动</option>
              </select>
            </label>
          </div>
          <button class="tactile is-accent mt-4 rounded-full px-5 py-2 text-sm" @click="settings.dailyGoal = estimateTDEE(profile)">
            应用 <span class="num">{{ estimateTDEE(profile) }}</span> kcal
          </button>
        </details>
      </section>

      <section class="space-y-3">
        <h3 class="eyebrow">数据</h3>
        <div class="flex gap-2">
          <button class="tactile rounded-full px-5 py-2 text-sm" @click="doExport">导出备份</button>
          <label class="tactile cursor-pointer rounded-full px-5 py-2 text-sm">导入<input type="file" accept=".json" class="sr-only" @change="doImport" /></label>
        </div>
        <p v-if="msg" class="text-xs text-muted" role="status">{{ msg }}</p>
        <p class="text-[0.7rem] text-faint">备份不包含 API 密钥。</p>
      </section>
    </div>
  </div>
</template>
