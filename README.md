# Calorie Studio

本地优先的食物热量计算工具。用聊天的方式描述或拍照记录饮食，自动估算热量和蛋白质、脂肪、碳水。

技术栈：Vue 3 · TypeScript · Tailwind CSS v4 · Vite · Tauri v2（Rust）

## 识别方式

| 方式 | 说明 | API 密钥存放位置 |
|------|------|------------------|
| 本地食物库 | 离线，内置约 30 种常见食物 | 不需要 |
| 桌面端 AI 识别 | 由 Rust 后端调用 OpenAI 兼容接口，支持拍照 | `%APPDATA%\com.ljx.caloriestudio\provider.json` |
| Companion | 网页版通过本机服务调用接口 | `~/.calorie-studio/companion.json` |
| 浏览器直连 | 网页直接调用接口，仅限自用设备 | 浏览器 localStorage |

数据保存在本地 IndexedDB，可在设置中导出 JSON 备份（不含密钥）。

## 开发

需要 Node.js 22.6 及以上版本；桌面端还需要 Rust（stable-msvc）和 Visual Studio C++ 构建工具。

```bash
npm install
npm run dev              # 网页版开发服务器 http://localhost:5173
npm test                 # 单元测试
npm run desktop:dev      # 桌面端开发模式
npm run desktop:build    # 生成安装包，输出到 src-tauri/target/release/bundle/
```

如果本机代理没有开启，cargo 会下载失败，构建前先执行 `export CARGO_HTTP_PROXY=""`。

## Companion（网页版保护密钥）

```bash
npm run companion -- setup --base-url https://api.example.com/v1 --model 模型名 --api-key 密钥
npm run companion -- check    # 诊断接口和模型是否可用
npm run companion -- start    # 只监听 127.0.0.1:8787
npm run companion -- status   # 查看连接密钥，填入网页设置
```

网页如果不是从 5173 或 4173 端口打开的，需要先执行 `npm run companion -- origin add <网页地址>`。

## 目录结构

```
src/                前端（Vue）
  components/       呼吸环、餐食卡片、设置弹窗
  lib/              营养计算、AI 调用、IndexedDB 存储
  data/foods.ts     本地食物库
companion/          Node 本地后端，零运行时依赖
src-tauri/          桌面端 Rust 后端
```

## 说明

营养数据参考《中国食物成分表》近似值，AI 估算可能有误差，仅用于日常参考，不构成医疗或营养建议。
