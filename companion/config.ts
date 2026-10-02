import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AiSettings } from '../src/lib/ai.ts'

export interface CompanionConfig {
  provider: AiSettings
  accessKey: string
  port: number
  allowedOrigins: string[]
}

export const CONFIG_PATH = process.env.CALORIE_COMPANION_CONFIG ?? join(homedir(), '.calorie-studio', 'companion.json')

export const newAccessKey = () => `cs_${randomBytes(24).toString('base64url')}`

export function defaultConfig(): CompanionConfig {
  return {
    provider: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
    accessKey: newAccessKey(),
    port: 8787,
    allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'],
  }
}

export function loadConfig(path = CONFIG_PATH): CompanionConfig {
  const saved = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const d = defaultConfig()
  const cfg: CompanionConfig = { ...d, ...saved, provider: { ...d.provider, ...saved.provider } }
  // 连接密钥首次生成后立即落盘，保证 status 显示的密钥与 start 使用的一致
  if (!saved.accessKey) saveConfig(cfg, path)
  return cfg
}

export function saveConfig(cfg: CompanionConfig, path = CONFIG_PATH) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  // Windows 上 chmod 只影响只读位，文件权限依赖用户目录 ACL
  try {
    chmodSync(path, 0o600)
  } catch {
    /* ignore */
  }
}

export const maskKey = (k: string) => (k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : k ? '****' : '(未设置)')
