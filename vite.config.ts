import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 端口固定，与 Companion 默认允许来源（5173 / 4173）保持一致；
// 被占用时直接报错，而不是悄悄换到 5174、5175 导致跨域被拒
// 相对路径：GitHub Pages 项目页在 /01/ 子路径下，绝对路径会 404；
// 桌面端 Tauri 从 tauri://localhost/ 根加载 index.html，相对路径同样成立
export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
