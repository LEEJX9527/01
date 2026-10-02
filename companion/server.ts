import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { analyzeWithAi, type AnalyzeResult } from '../src/lib/ai.ts'
import type { CompanionConfig } from './config.ts'

const MAX_BODY = 8 * 1024 * 1024 // 压缩后的图片通常 < 1MB，留足余量
const MAX_TEXT = 2000
const RATE_LIMIT = 30 // 每分钟请求数

type Analyzer = (cfg: CompanionConfig, text: string, image?: string) => Promise<AnalyzeResult>
const defaultAnalyzer: Analyzer = (cfg, text, image) =>
  analyzeWithAi(cfg.provider, text, image, AbortSignal.timeout(60_000))

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, '请求体过大')
    chunks.push(chunk)
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (v && typeof v === 'object') return v
  } catch {
    /* fallthrough */
  }
  throw new HttpError(400, '请求体不是有效 JSON')
}

export function createCompanionServer(getConfig: () => CompanionConfig, analyze: Analyzer = defaultAnalyzer): Server {
  const hits: number[] = []

  return createServer(async (req, res: ServerResponse) => {
    const cfg = getConfig()
    const origin = req.headers.origin
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }

    try {
      // 防 DNS 重绑定：只接受回环地址的 Host
      const host = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) throw new HttpError(403, 'Host 不被允许')

      // CORS：仅放行白名单来源
      if (origin) {
        if (!cfg.allowedOrigins.includes(origin)) throw new HttpError(403, `来源 ${origin} 不在白名单中`)
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Vary', 'Origin')
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      }
      if (req.method === 'OPTIONS') return void res.writeHead(204).end()

      const auth = req.headers.authorization ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!token || !safeEqual(token, cfg.accessKey)) throw new HttpError(401, '连接密钥无效')

      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return send(200, { ok: true, model: cfg.provider.model, providerConfigured: Boolean(cfg.provider.apiKey) })
      }

      if (req.method === 'POST' && url.pathname === '/api/analyze') {
        const now = Date.now()
        while (hits.length && now - hits[0] > 60_000) hits.shift()
        if (hits.length >= RATE_LIMIT) throw new HttpError(429, '请求过于频繁，请稍后再试')
        hits.push(now)

        const body = await readJson(req)
        const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : ''
        const image = body.image
        // 只接受内联 data URL，避免把任意外部 URL 转发给上游
        if (image !== undefined && image !== null && (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(image))) {
          throw new HttpError(400, '图片必须是 base64 data URL')
        }
        if (!text.trim() && !image) throw new HttpError(400, '请提供文字描述或图片')
        if (!cfg.provider.apiKey) throw new HttpError(503, 'Companion 尚未配置 Provider 密钥，请运行 setup')

        try {
          return send(200, await analyze(cfg, text, (image as string) || undefined))
        } catch (err) {
          // 上游错误信息可能包含请求细节，只透传简短描述
          throw new HttpError(502, (err as Error).message.slice(0, 300))
        }
      }

      throw new HttpError(404, '接口不存在')
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      send(status, { error: err instanceof HttpError ? err.message : '服务器内部错误' })
      if (status === 500) console.error(err)
    }
  })
}
