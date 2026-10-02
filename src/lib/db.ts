import { openDB, type DBSchema } from 'idb'
import type { FoodItem } from './nutrition.ts'
import type { FoodRef } from '../data/foods.ts'
import { toPlain } from './plain.ts'
import { PLAN_KEY } from './planStore.ts'
import type { MealKey } from './plan.ts'

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  text: string
  image?: string
  items?: FoodItem[]
  /** 所属餐次；旧数据没有该字段时按 createdAt 推断 */
  meal?: MealKey
  error?: boolean
  createdAt: number
}

export interface Session {
  id: string
  title: string
  date: string // YYYY-MM-DD
  draft: string
  updatedAt: number
}

interface CalorieDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { updatedAt: number } }
  messages: { key: string; value: Message; indexes: { sessionId: string } }
  foods: { key: string; value: FoodRef }
}

const dbp = openDB<CalorieDB>('calorie-studio', 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      db.createObjectStore('messages', { keyPath: 'id' }).createIndex('sessionId', 'sessionId')
    }
    // v2：自定义食物
    if (oldVersion < 2) db.createObjectStore('foods', { keyPath: 'id' })
  },
})

export const uid = () => crypto.randomUUID()

export async function listSessions(): Promise<Session[]> {
  return (await (await dbp).getAllFromIndex('sessions', 'updatedAt')).reverse()
}

export async function saveSession(s: Session) {
  await (await dbp).put('sessions', toPlain(s))
}

export async function deleteSession(id: string) {
  const db = await dbp
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  await tx.objectStore('sessions').delete(id)
  const idx = tx.objectStore('messages').index('sessionId')
  for (let cur = await idx.openCursor(id); cur; cur = await cur.continue()) await cur.delete()
  await tx.done
}

export async function listMessages(sessionId: string): Promise<Message[]> {
  const all = await (await dbp).getAllFromIndex('messages', 'sessionId', sessionId)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function saveMessage(m: Message) {
  await (await dbp).put('messages', toPlain(m))
}

export async function deleteMessage(id: string) {
  await (await dbp).delete('messages', id)
}

export async function listFoods(): Promise<FoodRef[]> {
  return (await dbp).getAll('foods')
}

export async function saveFood(f: FoodRef) {
  await (await dbp).put('foods', toPlain(f))
}

export async function deleteFood(id: string) {
  await (await dbp).delete('foods', id)
}

/** 导出全部数据为 JSON（不含 API 密钥） */
export async function exportAll(): Promise<string> {
  const db = await dbp
  const plan = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null')
  return JSON.stringify({
    version: 3,
    sessions: await db.getAll('sessions'),
    messages: await db.getAll('messages'),
    foods: await db.getAll('foods'),
    plan,
  })
}

export async function importAll(json: string) {
  const data = JSON.parse(json)
  if (!Array.isArray(data.sessions) || !Array.isArray(data.messages)) throw new Error('备份文件格式不正确')
  const db = await dbp
  const tx = db.transaction(['sessions', 'messages', 'foods'], 'readwrite')
  for (const s of data.sessions) await tx.objectStore('sessions').put(s)
  for (const m of data.messages) await tx.objectStore('messages').put(m)
  // v3 起包含自定义食物；旧备份没有该字段
  for (const f of Array.isArray(data.foods) ? data.foods : []) if (f?.id) await tx.objectStore('foods').put(f)
  await tx.done
  if (data.plan && typeof data.plan === 'object') localStorage.setItem(PLAN_KEY, JSON.stringify(data.plan))
}
