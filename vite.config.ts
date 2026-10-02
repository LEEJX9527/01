import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// 端口固定，与 Companion 默认允许来源（5173 / 4173）保持一致；
// 被占用时直接报错，而不是悄悄换到 5174、5175 导致跨域被拒
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
