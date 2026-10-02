import type { FoodItem } from './nutrition.ts'

export interface AiSettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface AnalyzeResult {
  items: FoodItem[]
  note: string
}

const SYSTEM_PROMPT = `你是营养师助手。根据用户描述或食物照片，识别每种食物并估算重量与营养。
只输出 JSON，不要任何解释，格式：
{"items":[{"name":"食物名","grams":数字,"kcal":数字,"protein":数字,"fat":数字,"carbs":数字}],"note":"一句简短建议"}
protein/fat/carbs 单位为克，kcal 为千卡，数值对应该份量而非每100g。`

/** 直接调用 OpenAI 兼容的 Chat Completions 接口（浏览器直连与 Companion 共用） */
export async function analyzeWithAi(
  s: AiSettings,
  text: string,
  imageDataUrl?: string,
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  if (!s.baseUrl || !s.apiKey) throw new Error('请先在设置中填写 API 地址和密钥')

  const content: unknown[] = [{ type: 'text', text: text || '请识别图片中的食物' }]
  if (imageDataUrl) content.push({ type: 'image_url', image_url: { url: imageDataUrl } })

  const res = await fetch(`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({
      model: s.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  })
  const raw = await res.text()
  // 地址缺少 /v1 等情况下，部分服务商会返回 200 的网页而不是 JSON
  if (/^\s*</.test(raw)) {
    throw new Error(`接口返回了网页而不是 JSON（状态 ${res.status}），请检查 API 地址，通常需要以 /v1 结尾`)
  }
  if (!res.ok) throw new Error(`接口错误 ${res.status}: ${raw.slice(0, 200)}`)

  let data: { choices?: { message?: { content?: string } }[] }
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`接口返回内容无法解析为 JSON：${raw.slice(0, 100)}`)
  }
  return parseAiJson(data?.choices?.[0]?.message?.content ?? '')
}

/** 通过本地 Companion 调用，浏览器只持有 Companion 访问密钥 */
export async function analyzeWithCompanion(
  c: { url: string; accessKey: string },
  text: string,
  imageDataUrl?: string,
  signal?: AbortSignal,
): Promise<AnalyzeResult> {
  if (!c.url || !c.accessKey) throw new Error('请先在设置中填写 Companion 地址和连接密钥')
  const res = await fetch(`${c.url.replace(/\/+$/, '')}/api/analyze`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.accessKey}` },
    body: JSON.stringify({ text, image: imageDataUrl }),
  }).catch(() => {
    throw new Error(companionUnreachable())
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Companion 错误 ${res.status}`)
  return data as AnalyzeResult
}

// 浏览器无法区分“服务未启动”和“跨域被拒”，两种可能都提示
function companionUnreachable() {
  return `无法连接 Companion。请确认已运行 npm run companion -- start；如果已在运行，可能是当前网页来源 ${location.origin} 不在允许列表中，可执行 npm run companion -- origin add ${location.origin}`
}

/** 是否运行在 Tauri 桌面端 */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface DesktopProviderStatus {
  configured: boolean
  baseUrl: string
  model: string
  keyHint: string
}

// 动态导入，网页版不加载 Tauri API
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<T>(cmd, args)
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : (err as Error).message)
  }
}

/** 桌面端：由 Rust 后端调用接口，密钥不进入 WebView */
export const desktop = {
  analyze: (text: string, image?: string) => invoke<AnalyzeResult>('analyze_food', { text, image: image ?? null }),
  status: () => invoke<DesktopProviderStatus>('provider_status'),
  save: (baseUrl: string, model: string, apiKey?: string) =>
    invoke<DesktopProviderStatus>('save_provider', { baseUrl, model, apiKey: apiKey || null }),
}

/** 检查 Companion 连接状态 */
export async function companionStatus(c: { url: string; accessKey: string }): Promise<{ model: string }> {
  const res = await fetch(`${c.url.replace(/\/+$/, '')}/api/status`, {
    headers: { Authorization: `Bearer ${c.accessKey}` },
  }).catch(() => {
    throw new Error(companionUnreachable())
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Companion 错误 ${res.status}`)
  return data
}

/** 容错解析：兼容 ```json 代码块包裹与多余文本 */
export function parseAiJson(raw: string): AnalyzeResult {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('模型未返回有效 JSON')
  const obj = JSON.parse(match[0])
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0)
  const items: FoodItem[] = (Array.isArray(obj.items) ? obj.items : []).map((i: Record<string, unknown>) => ({
    name: String(i.name ?? '未知食物'),
    grams: num(i.grams),
    kcal: Math.round(num(i.kcal)),
    protein: num(i.protein),
    fat: num(i.fat),
    carbs: num(i.carbs),
  }))
  return { items, note: typeof obj.note === 'string' ? obj.note : '' }
}
