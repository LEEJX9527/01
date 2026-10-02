import { openDB, type DBSchema } from 'idb'
import type { FoodItem } from './nutrition.ts'
import { toPlain } from './plain.ts'

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  text: string
  image?: string
  items?: FoodItem[]
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
}

const dbp = openDB<CalorieDB>('calorie-studio', 1, {
  upgrade(db) {
    db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
    db.createObjectStore('messages', { keyPath: 'id' }).createIndex('sessionId', 'sessionId')
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

/** 导出全部数据为 JSON（不含 API 密钥） */
export async function exportAll(): Promise<string> {
  const db = await dbp
  return JSON.stringify({ version: 1, sessions: await db.getAll('sessions'), messages: await db.getAll('messages') })
}

export async function importAll(json: string) {
  const data = JSON.parse(json)
  if (!Array.isArray(data.sessions) || !Array.isArray(data.messages)) throw new Error('备份文件格式不正确')
  const db = await dbp
  const tx = db.transaction(['sessions', 'messages'], 'readwrite')
  for (const s of data.sessions) await tx.objectStore('sessions').put(s)
  for (const m of data.messages) await tx.objectStore('messages').put(m)
  await tx.done
}
