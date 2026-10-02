import { companionUnreachable, desktop, isDesktop } from './ai.ts'
import { normalizeOffHits, type OnlineFood } from './off.ts'

/**
 * 在线搜索 Open Food Facts。
 * 桌面端走 Rust 后端；网页版必须经 Companion 转发（该接口不允许浏览器跨域直连）。
 */
export async function searchOnline(c: { url: string; accessKey: string }, q: string): Promise<OnlineFood[]> {
  if (isDesktop) return normalizeOffHits(await desktop.searchFoods(q))

  if (!c.url || !c.accessKey) throw new Error('网页版在线搜索需要先在设置里连接 Companion，或使用桌面版')
  const u = new URL('/api/foods', c.url)
  u.searchParams.set('q', q)
  const res = await fetch(u, { headers: { Authorization: `Bearer ${c.accessKey}` } }).catch(() => {
    throw new Error(companionUnreachable())
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `在线搜索失败 ${res.status}`)
  return normalizeOffHits(body.hits)
}
