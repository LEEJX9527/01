import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { CONFIG_PATH, loadConfig, maskKey, newAccessKey, saveConfig } from './config.ts'
import { createCompanionServer } from './server.ts'

const [cmd = 'help', ...args] = process.argv.slice(2)

function isHttpUrl(s: string) {
  try {
    return ['http:', 'https:'].includes(new URL(s).protocol)
  } catch {
    return false
  }
}

/** 解析 --name value / --name=value 形式的参数 */
function flag(name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === `--${name}`) return args[i + 1]
    if (args[i].startsWith(`--${name}=`)) return args[i].slice(name.length + 3)
  }
}

/**
 * 逐行读取 stdin。readline/promises 的 question() 会丢弃提问前已到达的行，
 * 在 Git Bash(mintty) 等 stdin 为管道的环境下会卡住或直接退出，这里自行缓冲。
 */
function lineReader() {
  const rl = createInterface({ input: stdin })
  const queue: string[] = []
  const waiters: ((v: string | null) => void)[] = []
  let closed = false
  rl.on('line', (l) => (waiters.length ? waiters.shift()!(l) : queue.push(l)))
  rl.on('close', () => {
    closed = true
    while (waiters.length) waiters.shift()!(null)
  })
  return {
    ask(q: string): Promise<string | null> {
      stdout.write(q)
      if (queue.length) return Promise.resolve(queue.shift()!)
      if (closed) return Promise.resolve(null)
      return new Promise((r) => waiters.push(r))
    },
    close: () => rl.close(),
  }
}

async function setup() {
  const cfg = loadConfig()
  const fBase = flag('base-url')
  const fModel = flag('model')
  const fKey = flag('api-key') ?? process.env.CALORIE_PROVIDER_API_KEY

  if (fBase || fModel || fKey) {
    // 非交互模式
    if (fBase) cfg.provider.baseUrl = fBase
    if (fModel) cfg.provider.model = fModel
    if (fKey) cfg.provider.apiKey = fKey
  } else {
    const rl = lineReader()
    const ask = async (q: string, def: string) => {
      const v = await rl.ask(`${q} [${def}]: `)
      if (v === null) throw new Error('输入已结束')
      return v.trim() || def
    }
    try {
      // 地址无效时重新提问，避免把密钥等内容误填进地址
      for (;;) {
        const url = await ask('API 地址（以 http:// 或 https:// 开头）', isHttpUrl(cfg.provider.baseUrl) ? cfg.provider.baseUrl : 'https://api.openai.com/v1')
        if (isHttpUrl(url)) {
          cfg.provider.baseUrl = url
          break
        }
        console.log('  地址格式不对，请输入类似 https://api.openai.com/v1 的地址（密钥在后面第三步填写）')
      }
      cfg.provider.model = await ask('模型', cfg.provider.model)
      const key = (await ask('API 密钥（回车保持不变）', maskKey(cfg.provider.apiKey))).trim()
      if (key && key !== maskKey(cfg.provider.apiKey)) cfg.provider.apiKey = key
    } catch {
      console.error('\n未完成输入，配置未保存。也可以用参数方式：\n  npm run companion -- setup --base-url <地址> --model <模型> --api-key <密钥>')
      process.exitCode = 1
      return
    } finally {
      rl.close()
    }
  }

  if (!isHttpUrl(cfg.provider.baseUrl)) {
    console.error('API 地址无效，需以 http:// 或 https:// 开头')
    process.exitCode = 1
    return
  }
  saveConfig(cfg)
  console.log(`\n已保存到 ${CONFIG_PATH}`)
  printStatus()
}

function printStatus() {
  const cfg = loadConfig()
  console.log(`配置文件:   ${CONFIG_PATH}`)
  console.log(`监听地址:   http://127.0.0.1:${cfg.port}`)
  // 地址无效时可能误填了密钥，不原样打印
  console.log(`Provider:   ${isHttpUrl(cfg.provider.baseUrl) ? cfg.provider.baseUrl : '⚠ 地址无效，请重新运行 setup'} (${cfg.provider.model})`)
  console.log(`API 密钥:   ${maskKey(cfg.provider.apiKey)}`)
  console.log(`允许来源:   ${cfg.allowedOrigins.join(', ')}`)
  console.log(`连接密钥:   ${cfg.accessKey}`)
  console.log('\n在网页「设置 → Companion」中粘贴连接密钥即可。')
}

function start() {
  const cfg = loadConfig()
  if (!cfg.provider.apiKey) console.warn('⚠ 尚未配置 Provider 密钥，请先运行: npm run companion -- setup')
  // 每次请求重新读取配置，setup / rotate-key 后无需重启
  const server = createCompanionServer(() => loadConfig())
  server.listen(cfg.port, '127.0.0.1', () => {
    console.log(`Calorie Studio Companion 已启动: http://127.0.0.1:${cfg.port}`)
    console.log('按 Ctrl+C 停止')
  })
}

function rotateKey() {
  const cfg = loadConfig()
  cfg.accessKey = newAccessKey()
  saveConfig(cfg)
  console.log(`新的连接密钥: ${cfg.accessKey}\n旧密钥已失效，请在网页设置中更新。`)
}

function origin(action?: string, value?: string) {
  const cfg = loadConfig()
  if (action === 'add' && value) cfg.allowedOrigins = [...new Set([...cfg.allowedOrigins, value.replace(/\/+$/, '')])]
  else if (action === 'remove' && value) cfg.allowedOrigins = cfg.allowedOrigins.filter((o) => o !== value)
  else return console.log(cfg.allowedOrigins.join('\n'))
  saveConfig(cfg)
  console.log(`允许来源: ${cfg.allowedOrigins.join(', ')}`)
}

/** 诊断 Provider：列出可用模型，并用当前模型发送一条最小请求 */
async function check() {
  const { provider: p } = loadConfig()
  if (!isHttpUrl(p.baseUrl) || !p.apiKey) {
    console.error('请先运行 setup 配置 API 地址和密钥')
    process.exitCode = 1
    return
  }
  const base = p.baseUrl.replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` }
  // 只打印响应前 300 字符，响应中不会包含本地密钥
  const show = (s: string) => s.replace(/\s+/g, ' ').slice(0, 300)

  console.log(`[1/2] GET ${base}/models`)
  try {
    const res = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(20_000) })
    const raw = await res.text()
    let ids: string[] = []
    try {
      ids = (JSON.parse(raw).data ?? []).map((m: { id: string }) => m.id)
    } catch {
      /* 非 JSON */
    }
    if (ids.length) {
      console.log(`  状态 ${res.status}，共 ${ids.length} 个模型`)
      console.log(`  当前模型 ${p.model}: ${ids.includes(p.model) ? '✔ 在列表中' : '✖ 不在列表中'}`)
      console.log(`  可用模型: ${ids.slice(0, 40).join(', ')}${ids.length > 40 ? ' …' : ''}`)
    } else {
      console.log(`  状态 ${res.status}: ${show(raw)}`)
    }
  } catch (err) {
    console.log(`  请求失败: ${(err as Error).message}`)
  }

  console.log(`\n[2/2] POST ${base}/chat/completions  model=${p.model}`)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: '回复 ok' }] }),
    })
    console.log(`  状态 ${res.status}: ${show(await res.text())}`)
    if (res.ok) console.log('\n✔ Provider 可用')
  } catch (err) {
    console.log(`  请求失败: ${(err as Error).message}`)
  }
}

const commands: Record<string, () => unknown> = {
  setup,
  check,
  start,
  status: printStatus,
  'rotate-key': rotateKey,
  origin: () => origin(args[0], args[1]),
  help: () =>
    console.log(`用法: npm run companion -- <命令>

  setup               交互式配置 Provider（API 地址、模型、密钥）
  setup --base-url <地址> --model <模型> --api-key <密钥>
                      非交互配置（密钥也可用环境变量 CALORIE_PROVIDER_API_KEY）
  check               诊断 Provider：列出可用模型并发送测试请求
  start               启动服务（仅监听 127.0.0.1）
  status              查看配置与连接密钥
  rotate-key          重新生成连接密钥
  origin [add|remove] <url>  管理允许的网页来源`),
}

await (commands[cmd] ?? commands.help)()
