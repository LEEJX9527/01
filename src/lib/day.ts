import type { FoodItem } from './nutrition.ts'

/** 汇总某一天所有记录里的食物（同一天可能有多条记录） */
export function itemsForDate(
  date: string,
  sessions: { id: string; date: string }[],
  messages: { sessionId: string; items?: FoodItem[] }[],
): FoodItem[] {
  const ids = new Set(sessions.filter((s) => s.date === date).map((s) => s.id))
  return messages.filter((m) => ids.has(m.sessionId)).flatMap((m) => m.items ?? [])
}
