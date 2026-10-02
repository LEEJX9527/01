import { reactive, watch } from 'vue'
import { isDesktop, type AiSettings } from './ai.ts'

export interface Settings extends AiSettings {
  /**
   * local: 本地食物库；ai: 浏览器直连接口；companion: 经本地 Companion 调用；
   * desktop: 桌面端由 Rust 后端调用，密钥不进 WebView
   */
  mode: 'local' | 'ai' | 'companion' | 'desktop'
  companionUrl: string
  companionKey: string
  dailyGoal: number
}

const KEY = 'calorie-studio:settings'
const defaults: Settings = {
  mode: isDesktop ? 'desktop' : 'local',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  companionUrl: 'http://127.0.0.1:8787',
  companionKey: '',
  dailyGoal: 2000,
}

// 设置仅保存在 localStorage，不进入备份文件
export const settings = reactive<Settings>({ ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') })
// 网页与桌面端可用的模式不同，切换环境时回落到默认
if (isDesktop ? settings.mode === 'ai' || settings.mode === 'companion' : settings.mode === 'desktop') settings.mode = defaults.mode
watch(settings, (v) => localStorage.setItem(KEY, JSON.stringify(v)), { deep: true })
