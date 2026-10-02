import type { AnalyzeResult } from './ai.ts'
import { parseLocal, type FoodItem } from './nutrition.ts'

export interface FallbackResult {
  items: FoodItem[]
  note: string
  /** 没有识别出任何食物 */
  error: boolean
  /** 由 AI 补充识别的食物名，用于界面标注 */
  aiNames: string[]
}

/**
 * 本地食物库优先；识别不到的片段交给 AI 补充。
 * analyzer 为空表示未配置 AI 或已关闭补充。
 */
export async function analyzeLocalFirst(text: string, analyzer?: (text: string) => Promise<AnalyzeResult>): Promise<FallbackResult> {
  const local = parseLocal(text)
  const done = (items: FoodItem[], note: string, aiNames: string[] = []) => ({ items, note, error: !items.length, aiNames })
  if (!local.unknown.length) return done(local.items, '')

  const missing = local.unknown.join('、')
  if (!analyzer) return done(local.items, `未在食物库中找到：${missing}`)
  try {
    const ai = await analyzer(missing)
    const aiNames = ai.items.map((i) => i.name)
    const note = [aiNames.length ? `${aiNames.join('、')} 由 AI 估算` : `AI 也没有识别出：${missing}`, ai.note].filter(Boolean).join('。')
    return done([...local.items, ...ai.items], note, aiNames)
  } catch (err) {
    return done(local.items, `未在食物库中找到：${missing}（AI 补充失败：${(err as Error).message}）`)
  }
}
