# AgentDev Lite 实施计划（Codex 执行手册）

> **使用说明**：本文档是给 Codex（或人工）执行的逐步任务清单。每个 task 都是一个独立的 codex 会话可以吃下的工作单元：包含要创建/修改的文件路径、完整代码、运行验证方式、git 提交命令。
>
> **任务粒度**：每个 step 目标 2-5 分钟。
>
> **执行方式**：从 Task 0.1 开始顺序执行，`- [ ]` 打钩。每个 Day 末尾有"Day 验收"清单，必须全部通过才能进入下一天。
>
> **参考文档**：[设计文档](../specs/2026-04-10-agentdev-lite-design.md)

**Goal：** 5.5 天做一个仿 AionUi 布局的浅色主题 Web Agent 应用，覆盖 Word/PPT/论文/任务规划/定时任务 5 个功能。

**Architecture：** 前后端分离但同目录（client/ + server/ + 根 package.json 聚合启动）。React+Vite+Tailwind 前端；Express+Node 后端；DeepSeek 做 LLM；docx + pptxgenjs 生成文件；node-cron 做定时任务；JSON 文件做持久化。

**Tech Stack：** React 18 · Vite 5 · Tailwind CSS · react-markdown · lucide-react · Express · node-fetch · docx · pptxgenjs · node-cron · DeepSeek API

---

## 前置条件

- Node 18+ 已安装（`node -v` 验证 ≥18）
- Git 已安装（`git --version` 验证）
- 一个有效的 **DeepSeek API Key**（https://platform.deepseek.com 申请）
- 工作目录：`D:\claude project\agentdev-lite\`

---

## 目录蓝图（最终状态）

```
agentdev-lite/
├── .git/                         (Task 0.1 创建)
├── .gitignore
├── package.json                  根：仅 concurrently
├── README.md
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── layout/{Layout,Sidebar,TopBar,MainArea,RightDrawer}.jsx
│       │   ├── chat/{ChatArea,MessageList,MessageBubble,InputBar,CommandPalette}.jsx
│       │   ├── cards/{WordCard,PptCard,PaperCard,PlanCard,ScheduleCard,FileCard}.jsx
│       │   └── common/{Button,Badge,Modal,Toast,Spinner,EmptyState}.jsx
│       ├── panels/{SettingsPanel,ArtifactsPanel}.jsx
│       ├── hooks/{useChat,useApi,useConfig,useCommand,useToast}.js
│       ├── lib/{api,commands}.js
│       └── styles/theme.css
├── server/
│   ├── package.json
│   ├── index.js
│   ├── routes/{chat,word,ppt,paper,plan,schedule,artifacts,config}.js
│   ├── services/{deepseek,docxGen,pptxGen,scheduler}.js
│   └── store.js
├── data/                         (gitignored) config.json + data.json
├── generated/                    (gitignored) docx/pptx/md 输出
└── docs/superpowers/{specs,plans}/*.md
```

---

# Day 0 · 周五晚 · Scaffold + 通用对话跑通

**目标**：起得来、能流式对话、能配 API Key。

---

## Task 0.1: 创建项目目录 + git init

**Files:**
- Create: `D:\claude project\agentdev-lite\.gitignore`
- Create: `D:\claude project\agentdev-lite\README.md`

- [ ] **Step 1**：创建目录并 git init

```bash
cd "D:/claude project"
mkdir -p agentdev-lite
cd agentdev-lite
git init
```

- [ ] **Step 2**：写 `.gitignore`

```
node_modules/
dist/
dist-electron/
out/
data/
generated/
*.log
.DS_Store
.env
.env.local
```

- [ ] **Step 3**：写 `README.md`（最小版，Day 5 会补齐）

```markdown
# AgentDev Lite

简易版 Agent 软件，仿 AionUi 布局，覆盖 Word/PPT/论文/任务规划/定时任务。

## 启动

```bash
npm run setup    # 只需首次
npm run dev      # 同时启前后端
```

前端 http://localhost:5173，后端 http://localhost:8787。

## 配置

打开右上角 ⚙ 设置面板，填入 DeepSeek API Key 保存。
```

- [ ] **Step 4**：首次提交

```bash
git add .gitignore README.md
git commit -m "chore: init project"
```

---

## Task 0.2: 根 package.json

**Files:**
- Create: `package.json`

- [ ] **Step 1**：写根 `package.json`

```json
{
  "name": "agentdev-lite",
  "version": "0.1.0",
  "private": true,
  "description": "Lightweight AionUi-style agent app",
  "scripts": {
    "setup": "npm install && npm --prefix client install && npm --prefix server install",
    "dev": "concurrently -n server,client -c cyan,magenta \"npm --prefix server run dev\" \"npm --prefix client run dev\""
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

- [ ] **Step 2**：安装

```bash
npm install
```

- [ ] **Step 3**：提交

```bash
git add package.json package-lock.json
git commit -m "chore: add root package.json with concurrently"
```

---

## Task 0.3: Server 骨架 + package.json

**Files:**
- Create: `server/package.json`
- Create: `server/index.js`

- [ ] **Step 1**：写 `server/package.json`

```json
{
  "name": "agentdev-lite-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch index.js",
    "start": "node index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "docx": "^8.5.0",
    "express": "^4.19.2",
    "node-cron": "^3.0.3",
    "node-fetch": "^3.3.2",
    "pptxgenjs": "^3.12.0"
  }
}
```

- [ ] **Step 2**：装依赖

```bash
cd server && npm install && cd ..
```

- [ ] **Step 3**：写最小 `server/index.js`（只挂 cors + json，Task 0.8 补全路由）

```javascript
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))

// 静态服务 generated 目录（只读）
app.use('/files', express.static(path.join(__dirname, '..', 'generated')))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' })
})

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`)
})
```

- [ ] **Step 4**：跑一下

```bash
cd server && npm run dev
```

打开 http://localhost:8787/api/health 应该返回 `{"ok":true,"version":"0.1.0"}`。Ctrl+C 停。

- [ ] **Step 5**：提交

```bash
cd ..
git add server/package.json server/package-lock.json server/index.js
git commit -m "feat(server): scaffold express server with health endpoint"
```

---

## Task 0.4: Server - store.js（持久化层）

**Files:**
- Create: `server/store.js`

- [ ] **Step 1**：写 `server/store.js`

```javascript
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const GENERATED_DIR = path.join(__dirname, '..', 'generated')
const CONFIG_PATH = path.join(DATA_DIR, 'config.json')
const DATA_PATH = path.join(DATA_DIR, 'data.json')

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  temperature: 0.7
}

const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  scheduledTasks: []
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true })
}

function readJson(p, fallback) {
  ensureDirs()
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(fallback, null, 2), 'utf-8')
    return fallback
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch (e) {
    console.error('[store] parse error, using fallback:', p, e.message)
    return fallback
  }
}

function writeJson(p, obj) {
  ensureDirs()
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8')
}

export const store = {
  genId: (prefix = '') => prefix + crypto.randomUUID(),

  GENERATED_DIR,

  getConfig() {
    return readJson(CONFIG_PATH, DEFAULT_CONFIG)
  },
  setConfig(patch) {
    const cur = this.getConfig()
    const next = { ...cur, ...patch }
    writeJson(CONFIG_PATH, next)
    return next
  },
  getMaskedConfig() {
    const c = this.getConfig()
    const k = c.apiKey || ''
    return {
      ...c,
      apiKey: k.length > 10 ? `${k.slice(0, 6)}***${k.slice(-4)}` : (k ? '***' : '')
    }
  },

  getData() {
    return readJson(DATA_PATH, DEFAULT_DATA)
  },
  saveData(data) {
    writeJson(DATA_PATH, data)
  },

  // 会话操作
  upsertConversation(conv) {
    const data = this.getData()
    const i = data.conversations.findIndex(c => c.id === conv.id)
    if (i === -1) data.conversations.unshift(conv)
    else data.conversations[i] = conv
    this.saveData(data)
    return conv
  },
  getConversation(id) {
    return this.getData().conversations.find(c => c.id === id)
  },
  listConversations() {
    return this.getData().conversations
  },

  // 产物操作
  addArtifact(artifact) {
    const data = this.getData()
    data.artifacts.unshift(artifact)
    this.saveData(data)
    return artifact
  },
  listArtifacts() {
    return this.getData().artifacts
  },

  // 定时任务操作
  listScheduledTasks() {
    return this.getData().scheduledTasks
  },
  upsertScheduledTask(task) {
    const data = this.getData()
    const i = data.scheduledTasks.findIndex(t => t.id === task.id)
    if (i === -1) data.scheduledTasks.push(task)
    else data.scheduledTasks[i] = task
    this.saveData(data)
    return task
  },
  removeScheduledTask(id) {
    const data = this.getData()
    data.scheduledTasks = data.scheduledTasks.filter(t => t.id !== id)
    this.saveData(data)
  },
  appendTaskHistory(taskId, entry) {
    const data = this.getData()
    const t = data.scheduledTasks.find(t => t.id === taskId)
    if (!t) return
    t.history = t.history || []
    t.history.unshift(entry)
    if (t.history.length > 20) t.history.length = 20
    t.lastRun = entry.runAt
    this.saveData(data)
  }
}
```

- [ ] **Step 2**：提交

```bash
git add server/store.js
git commit -m "feat(server): add JSON-file persistence store"
```

---

## Task 0.5: Server - services/deepseek.js（LLM 客户端）

**Files:**
- Create: `server/services/deepseek.js`

- [ ] **Step 1**：写 DeepSeek 客户端

```javascript
import fetch from 'node-fetch'
import { store } from '../store.js'

export class DeepSeekError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

function mapErrorCode(status) {
  if (status === 401 || status === 403) return 'DEEPSEEK_AUTH'
  if (status === 429) return 'DEEPSEEK_RATE_LIMIT'
  if (status >= 500) return 'DEEPSEEK_SERVER'
  return 'DEEPSEEK_UNKNOWN'
}

/** 非流式调用，返回字符串 content */
export async function chat({ messages, json = false, temperature = 0.7 }) {
  const config = store.getConfig()
  if (!config.apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', 'API Key 未配置')

  const body = {
    model: config.model || 'deepseek-chat',
    messages,
    temperature,
    stream: false,
    ...(json && { response_format: { type: 'json_object' } })
  }

  let resp
  try {
    resp = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    })
  } catch (e) {
    if (e.name === 'AbortError' || e.name === 'TimeoutError') {
      throw new DeepSeekError('DEEPSEEK_TIMEOUT', '模型响应超时（60秒）')
    }
    throw new DeepSeekError('DEEPSEEK_NETWORK', `网络错误: ${e.message}`)
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }

  const data = await resp.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** 流式调用，返回 async iterator，每个元素是一个 delta 字符串 */
export async function* chatStream({ messages, temperature = 0.7 }) {
  const config = store.getConfig()
  if (!config.apiKey) throw new DeepSeekError('DEEPSEEK_AUTH', 'API Key 未配置')

  const body = {
    model: config.model || 'deepseek-chat',
    messages,
    temperature,
    stream: true
  }

  const resp = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new DeepSeekError(mapErrorCode(resp.status), `DeepSeek ${resp.status}: ${text.slice(0, 200)}`, resp.status)
  }

  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore partial parse
      }
    }
  }
}

/** 强解析 JSON，容忍 ```json wrapper */
export function parseJsonStrict(raw) {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')
  return JSON.parse(cleaned.slice(start, end + 1))
}

/** 调用 LLM 返回 JSON，失败自动重试一次 */
export async function chatJson(messages, opts = {}) {
  try {
    const raw = await chat({ messages, json: true, ...opts })
    return parseJsonStrict(raw)
  } catch (e) {
    if (e instanceof DeepSeekError) throw e
    // JSON parse 失败才重试
    const retry = await chat({
      messages: [
        ...messages,
        { role: 'user', content: '上次输出不是合法 JSON，请只输出一个 JSON 对象，不要 markdown 代码块，不要任何其他文字。' }
      ],
      json: true,
      ...opts
    })
    return parseJsonStrict(retry)
  }
}
```

- [ ] **Step 2**：提交

```bash
git add server/services/deepseek.js
git commit -m "feat(server): add DeepSeek LLM client with streaming and JSON robust parsing"
```

---

## Task 0.6: Server - routes/config.js

**Files:**
- Create: `server/routes/config.js`

- [ ] **Step 1**：写配置路由

```javascript
import express from 'express'
import { store } from '../store.js'

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ ok: true, config: store.getMaskedConfig() })
})

router.post('/', (req, res) => {
  const { apiKey, baseUrl, model, temperature } = req.body || {}
  const patch = {}
  if (typeof apiKey === 'string' && apiKey && !apiKey.includes('***')) patch.apiKey = apiKey.trim()
  if (typeof baseUrl === 'string' && baseUrl) patch.baseUrl = baseUrl.trim()
  if (typeof model === 'string' && model) patch.model = model.trim()
  if (typeof temperature === 'number') patch.temperature = temperature
  const next = store.setConfig(patch)
  res.json({ ok: true, config: { ...next, apiKey: next.apiKey ? '***' : '' } })
})

export default router
```

- [ ] **Step 2**：提交

```bash
git add server/routes/config.js
git commit -m "feat(server): add /api/config GET/POST with key masking"
```

---

## Task 0.7: Server - routes/chat.js（流式 SSE）

**Files:**
- Create: `server/routes/chat.js`

- [ ] **Step 1**：写流式聊天路由

```javascript
import express from 'express'
import { chatStream, DeepSeekError } from '../services/deepseek.js'

const router = express.Router()

const SYSTEM_PROMPT = `你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。`

router.post('/', async (req, res) => {
  const { messages = [] } = req.body || {}

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    const fullMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ]
    for await (const delta of chatStream({ messages: fullMessages })) {
      send({ delta })
    }
    send({ done: true })
  } catch (e) {
    const payload = e instanceof DeepSeekError
      ? { error: { code: e.code, message: e.message } }
      : { error: { code: 'INTERNAL', message: e.message || '未知错误' } }
    send(payload)
  } finally {
    res.end()
  }
})

export default router
```

- [ ] **Step 2**：提交

```bash
git add server/routes/chat.js
git commit -m "feat(server): add /api/chat streaming SSE endpoint"
```

---

## Task 0.8: Server - index.js 挂路由

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1**：替换 `server/index.js` 全文

```javascript
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import chatRouter from './routes/chat.js'
import configRouter from './routes/config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 8787

app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.use('/files', express.static(path.join(__dirname, '..', 'generated')))
app.use('/api/chat', chatRouter)
app.use('/api/config', configRouter)

app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '0.1.0' })
})

// 全局错误兜底
app.use((err, req, res, next) => {
  console.error('[error]', err)
  res.status(500).json({
    ok: false,
    error: { code: err.code || 'INTERNAL', message: err.message || '内部错误' }
  })
})

app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`)
})
```

- [ ] **Step 2**：测试服务启动

```bash
cd server && npm run dev
```

打开 http://localhost:8787/api/health，应返回 `{"ok":true,"version":"0.1.0"}`。Ctrl+C 停。

- [ ] **Step 3**：提交

```bash
cd ..
git add server/index.js
git commit -m "feat(server): mount chat and config routes, global error handler"
```

---

## Task 0.9: Client 骨架 + Vite 初始化

**Files:**
- Create: `client/package.json`
- Create: `client/index.html`
- Create: `client/vite.config.js`

- [ ] **Step 1**：写 `client/package.json`

```json
{
  "name": "agentdev-lite-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "lucide-react": "^0.378.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "vite": "^5.2.13"
  }
}
```

- [ ] **Step 2**：装依赖

```bash
cd client && npm install && cd ..
```

- [ ] **Step 3**：写 `client/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AgentDev Lite</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4**：写 `client/vite.config.js`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      },
      '/files': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
})
```

- [ ] **Step 5**：提交

```bash
git add client/package.json client/package-lock.json client/index.html client/vite.config.js
git commit -m "feat(client): scaffold vite + react client with api proxy"
```

---

## Task 0.10: Tailwind + PostCSS + theme.css

**Files:**
- Create: `client/tailwind.config.js`
- Create: `client/postcss.config.js`
- Create: `client/src/styles/theme.css`

- [ ] **Step 1**：`client/tailwind.config.js`

```javascript
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        border: 'var(--border)',
        'text-primary': 'var(--text-primary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)'
      }
    }
  },
  plugins: []
}
```

- [ ] **Step 2**：`client/postcss.config.js`

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 3**：`client/src/styles/theme.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fb;
  --bg-tertiary: #eef2f7;
  --border: #e2e8f0;
  --text-primary: #0f172a;
  --text-muted: #64748b;
  --accent: #3b82f6;
  --accent-grad: linear-gradient(135deg, #3b82f6, #8b5cf6);
  --success: #059669;
  --error: #dc2626;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06);
}

html, body, #root {
  height: 100%;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

* {
  box-sizing: border-box;
}

button {
  font-family: inherit;
}

/* 滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
```

- [ ] **Step 4**：提交

```bash
git add client/tailwind.config.js client/postcss.config.js client/src/styles/theme.css
git commit -m "feat(client): add tailwind config and light theme CSS variables"
```

---

## Task 0.11: main.jsx + App.jsx 最小渲染

**Files:**
- Create: `client/src/main.jsx`
- Create: `client/src/App.jsx`

- [ ] **Step 1**：`client/src/main.jsx`

```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 2**：`client/src/App.jsx`（先放占位）

```javascript
import Layout from './components/layout/Layout.jsx'

export default function App() {
  return <Layout />
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/main.jsx client/src/App.jsx
git commit -m "feat(client): add react entrypoint and App root"
```

---

## Task 0.12: lib/api.js（fetch 封装）

**Files:**
- Create: `client/src/lib/api.js`

- [ ] **Step 1**：

```javascript
export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

async function request(method, url, body) {
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || json.ok === false) {
    const err = json.error || { code: 'HTTP', message: `HTTP ${resp.status}` }
    throw new ApiError(err.code, err.message)
  }
  return json
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  del: (url) => request('DELETE', url),
  patch: (url, body) => request('PATCH', url, body),

  /** SSE 流式，回调式。返回 abort 函数 */
  async stream(url, body, onDelta, onDone, onError) {
    const ctrl = new AbortController()
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal
      })
      if (!resp.ok) {
        onError?.(new ApiError('HTTP', `HTTP ${resp.status}`))
        return () => ctrl.abort()
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          try {
            const obj = JSON.parse(t.slice(5).trim())
            if (obj.delta) onDelta?.(obj.delta)
            else if (obj.done) onDone?.()
            else if (obj.error) onError?.(new ApiError(obj.error.code, obj.error.message))
          } catch {}
        }
      }
      onDone?.()
    } catch (e) {
      if (e.name !== 'AbortError') onError?.(e)
    }
    return () => ctrl.abort()
  }
}
```

- [ ] **Step 2**：提交

```bash
git add client/src/lib/api.js
git commit -m "feat(client): add api lib with SSE streaming support"
```

---

## Task 0.13: Layout + Sidebar + MainArea + TopBar 骨架

**Files:**
- Create: `client/src/components/layout/Layout.jsx`
- Create: `client/src/components/layout/Sidebar.jsx`
- Create: `client/src/components/layout/TopBar.jsx`
- Create: `client/src/components/layout/MainArea.jsx`

- [ ] **Step 1**：`Layout.jsx`

```javascript
import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import MainArea from './MainArea.jsx'
import RightDrawer from './RightDrawer.jsx'

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [drawer, setDrawer] = useState(null) // null | 'settings' | 'artifacts'

  return (
    <div className="flex h-full w-full bg-[color:var(--bg-primary)] text-[color:var(--text-primary)]">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} onOpenDrawer={setDrawer} />
      <MainArea onOpenDrawer={setDrawer} />
      <RightDrawer view={drawer} onClose={() => setDrawer(null)} />
    </div>
  )
}
```

- [ ] **Step 2**：`Sidebar.jsx`

```javascript
import { MessageSquare, FileText, Presentation, BookOpen, CalendarClock, Settings, FolderOpen, Plus, ChevronLeft, ChevronRight } from 'lucide-react'

const ASSISTANTS = [
  { id: 'general', name: '通用对话', icon: MessageSquare },
  { id: 'word', name: 'Word 助手', icon: FileText },
  { id: 'ppt', name: 'PPT 助手', icon: Presentation },
  { id: 'paper', name: '论文助手', icon: BookOpen },
  { id: 'schedule', name: '日程助手', icon: CalendarClock }
]

export default function Sidebar({ collapsed, onToggle, onOpenDrawer }) {
  const width = collapsed ? 'w-[60px]' : 'w-[260px]'
  return (
    <aside className={`${width} transition-all duration-200 bg-[color:var(--bg-secondary)] border-r border-[color:var(--border)] flex flex-col`}>
      <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
        {!collapsed && <span className="font-semibold text-base">AgentDev Lite</span>}
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="toggle sidebar"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className="p-3">
        <button className="w-full h-9 flex items-center justify-center gap-2 rounded-lg bg-[color:var(--accent)] text-white text-sm hover:opacity-90">
          <Plus size={16} />
          {!collapsed && <span>新对话</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {!collapsed && <div className="px-2 py-1 text-xs text-[color:var(--text-muted)]">助手</div>}
        {ASSISTANTS.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.id}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{a.name}</span>}
            </button>
          )
        })}
      </div>

      <div className="p-2 border-t border-[color:var(--border)] flex flex-col gap-1">
        <button
          onClick={() => onOpenDrawer('settings')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
        >
          <Settings size={16} />
          {!collapsed && <span>设置</span>}
        </button>
        <button
          onClick={() => onOpenDrawer('artifacts')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-[color:var(--bg-tertiary)]"
        >
          <FolderOpen size={16} />
          {!collapsed && <span>产物</span>}
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3**：`TopBar.jsx`

```javascript
import { Settings, FolderOpen } from 'lucide-react'

export default function TopBar({ title = '新对话', onOpenDrawer }) {
  return (
    <div className="h-14 px-6 flex items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--bg-primary)]">
      <div className="text-sm font-medium">{title}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onOpenDrawer('settings')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="settings"
        >
          <Settings size={16} />
        </button>
        <button
          onClick={() => onOpenDrawer('artifacts')}
          className="p-2 rounded hover:bg-[color:var(--bg-tertiary)]"
          aria-label="artifacts"
        >
          <FolderOpen size={16} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4**：`MainArea.jsx`（先占位，Task 0.15 补上 Chat）

```javascript
import TopBar from './TopBar.jsx'
import ChatArea from '../chat/ChatArea.jsx'

export default function MainArea({ onOpenDrawer }) {
  return (
    <main className="flex-1 flex flex-col min-w-0">
      <TopBar onOpenDrawer={onOpenDrawer} />
      <ChatArea />
    </main>
  )
}
```

- [ ] **Step 5**：提交

```bash
git add client/src/components/layout/
git commit -m "feat(client): add Layout/Sidebar/TopBar/MainArea skeleton"
```

---

## Task 0.14: RightDrawer + SettingsPanel

**Files:**
- Create: `client/src/components/layout/RightDrawer.jsx`
- Create: `client/src/panels/SettingsPanel.jsx`
- Create: `client/src/hooks/useConfig.js`

- [ ] **Step 1**：`useConfig.js`

```javascript
import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api.js'

export function useConfig() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/config')
      setConfig(r.config)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const save = useCallback(async (patch) => {
    const r = await api.post('/api/config', patch)
    setConfig(r.config)
    return r.config
  }, [])

  return { config, loading, error, refresh, save }
}
```

- [ ] **Step 2**：`SettingsPanel.jsx`

```javascript
import { useState, useEffect } from 'react'
import { useConfig } from '../hooks/useConfig.js'

export default function SettingsPanel() {
  const { config, save } = useConfig()
  const [form, setForm] = useState({ apiKey: '', baseUrl: '', model: '', temperature: 0.7 })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (config) {
      setForm({
        apiKey: '', // 不回填脱敏值
        baseUrl: config.baseUrl || 'https://api.deepseek.com',
        model: config.model || 'deepseek-chat',
        temperature: config.temperature ?? 0.7
      })
    }
  }, [config])

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const patch = { ...form }
      if (!patch.apiKey) delete patch.apiKey // 保留原值
      await save(patch)
      setMsg('已保存')
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setMsg('保存失败: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">模型配置</h2>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">DeepSeek API Key</label>
        <input
          type="password"
          value={form.apiKey}
          onChange={e => setForm({ ...form, apiKey: e.target.value })}
          placeholder={config?.apiKey || 'sk-...'}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] bg-[color:var(--bg-primary)] text-sm focus:outline-none focus:border-[color:var(--accent)]"
        />
        {config?.apiKey && <div className="text-xs text-[color:var(--text-muted)]">当前: {config.apiKey}</div>}
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">Base URL</label>
        <input
          type="text"
          value={form.baseUrl}
          onChange={e => setForm({ ...form, baseUrl: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">模型名</label>
        <select
          value={form.model}
          onChange={e => setForm({ ...form, model: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-[color:var(--border)] text-sm"
        >
          <option value="deepseek-chat">deepseek-chat</option>
          <option value="deepseek-reasoner">deepseek-reasoner</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-[color:var(--text-muted)]">Temperature: {form.temperature}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={form.temperature}
          onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50"
      >
        {saving ? '保存中...' : '保存'}
      </button>
      {msg && <div className="text-xs text-[color:var(--text-muted)]">{msg}</div>}
    </div>
  )
}
```

- [ ] **Step 3**：`RightDrawer.jsx`

```javascript
import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'

export default function RightDrawer({ view, onClose }) {
  if (!view) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-10" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[360px] bg-[color:var(--bg-primary)] border-l border-[color:var(--border)] z-20 shadow-xl overflow-y-auto">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)]">
          <span className="font-medium">{view === 'settings' ? '设置' : '产物'}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]">
            <X size={16} />
          </button>
        </div>
        {view === 'settings' && <SettingsPanel />}
        {view === 'artifacts' && <div className="p-6 text-sm text-[color:var(--text-muted)]">（Task 1.8 实现）</div>}
      </aside>
    </>
  )
}
```

- [ ] **Step 4**：提交

```bash
git add client/src/components/layout/RightDrawer.jsx client/src/panels/SettingsPanel.jsx client/src/hooks/useConfig.js
git commit -m "feat(client): add right drawer with settings panel and config hook"
```

---

## Task 0.15: useChat hook + ChatArea + MessageBubble + InputBar

**Files:**
- Create: `client/src/hooks/useChat.js`
- Create: `client/src/components/chat/MessageBubble.jsx`
- Create: `client/src/components/chat/MessageList.jsx`
- Create: `client/src/components/chat/InputBar.jsx`
- Create: `client/src/components/chat/ChatArea.jsx`

- [ ] **Step 1**：`useChat.js`

```javascript
import { useReducer, useCallback, useRef } from 'react'
import { api } from '../lib/api.js'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

const initialState = {
  messages: [], // {id, role: 'user'|'assistant'|'system'|'card', content, streaming?, cardType?, cardData?, cardState?}
  streaming: false
}

function reducer(state, action) {
  switch (action.type) {
    case 'ADD': return { ...state, messages: [...state.messages, action.msg] }
    case 'APPEND_DELTA': {
      const messages = state.messages.map(m =>
        m.id === action.id ? { ...m, content: (m.content || '') + action.delta, streaming: true } : m
      )
      return { ...state, messages, streaming: true }
    }
    case 'FINISH': {
      const messages = state.messages.map(m => m.id === action.id ? { ...m, streaming: false } : m)
      return { ...state, messages, streaming: false }
    }
    case 'UPDATE_CARD': {
      const messages = state.messages.map(m =>
        m.id === action.id ? { ...m, cardState: action.cardState, cardData: action.cardData ?? m.cardData } : m
      )
      return { ...state, messages }
    }
    case 'CLEAR': return initialState
    default: return state
  }
}

export function useChat() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const abortRef = useRef(null)

  const sendUserMessage = useCallback(async (text) => {
    const userMsg = { id: uid(), role: 'user', content: text }
    dispatch({ type: 'ADD', msg: userMsg })

    const asstId = uid()
    dispatch({ type: 'ADD', msg: { id: asstId, role: 'assistant', content: '', streaming: true } })

    // 取当前所有非 card 消息作为上下文
    const history = [...state.messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    abortRef.current = await api.stream(
      '/api/chat',
      { messages: history },
      (delta) => dispatch({ type: 'APPEND_DELTA', id: asstId, delta }),
      () => dispatch({ type: 'FINISH', id: asstId }),
      (err) => {
        dispatch({ type: 'APPEND_DELTA', id: asstId, delta: `\n\n[错误] ${err.message}` })
        dispatch({ type: 'FINISH', id: asstId })
      }
    )
  }, [state.messages])

  const addCard = useCallback((cardType, initialData = {}) => {
    const id = uid()
    dispatch({
      type: 'ADD',
      msg: { id, role: 'card', cardType, cardData: initialData, cardState: 'form' }
    })
    return id
  }, [])

  const updateCard = useCallback((id, cardState, cardData) => {
    dispatch({ type: 'UPDATE_CARD', id, cardState, cardData })
  }, [])

  const addFileCard = useCallback((artifact) => {
    dispatch({
      type: 'ADD',
      msg: { id: uid(), role: 'card', cardType: 'file', cardData: artifact, cardState: 'done' }
    })
  }, [])

  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), [])

  return { ...state, sendUserMessage, addCard, updateCard, addFileCard, clear }
}
```

- [ ] **Step 2**：`MessageBubble.jsx`（Day 3 会加 Markdown 渲染，现在先纯文本）

```javascript
export default function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-[color:var(--accent)] text-white rounded-br-sm'
            : 'bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
        }`}
      >
        {content}
        {streaming && <span className="inline-block w-1 h-4 bg-current ml-1 animate-pulse align-middle" />}
      </div>
    </div>
  )
}
```

- [ ] **Step 3**：`MessageList.jsx`

```javascript
import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'

export default function MessageList({ messages }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm">
          输入消息开始对话。输入 "/" 触发命令面板。
        </div>
      )}
      {messages.map(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          return <MessageBubble key={m.id} role={m.role} content={m.content} streaming={m.streaming} />
        }
        // cards 在 Day 1-4 补
        return <div key={m.id} className="text-xs text-[color:var(--text-muted)] my-2">[card: {m.cardType}]</div>
      })}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 4**：`InputBar.jsx`（Task 1.4 会加 CommandPalette）

```javascript
import { useState } from 'react'
import { Send } from 'lucide-react'

export default function InputBar({ onSend, disabled }) {
  const [text, setText] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const v = text.trim()
    if (!v || disabled) return
    onSend(v)
    setText('')
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-xl px-3 py-2 focus-within:border-[color:var(--accent)]">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder='发送消息，或输入 "/" 触发命令...'
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm max-h-40 py-1"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="h-8 w-8 flex items-center justify-center rounded-lg bg-[color:var(--accent)] text-white disabled:opacity-40"
          aria-label="send"
        >
          <Send size={14} />
        </button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5**：`ChatArea.jsx`

```javascript
import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea() {
  const { messages, streaming, sendUserMessage } = useChat()

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList messages={messages} />
      <InputBar onSend={sendUserMessage} disabled={streaming} />
    </div>
  )
}
```

- [ ] **Step 6**：提交

```bash
git add client/src/hooks/useChat.js client/src/components/chat/
git commit -m "feat(client): add chat area with streaming SSE and message bubbles"
```

---

## Task 0.16: Day 0 验收

- [ ] **Step 1**：启动

```bash
npm run dev
```

- [ ] **Step 2**：打开 http://localhost:5173 验证
  - [ ] 页面加载，侧边栏 + 主区 + 输入框可见
  - [ ] 侧边栏折叠按钮可用
  - [ ] 5 个助手项目显示
  - [ ] 点右上角 ⚙ 打开设置抽屉，填入 DeepSeek API Key 点保存
  - [ ] 关闭浏览器终端查看 `data/config.json` 有 `apiKey` 字段

- [ ] **Step 3**：在输入框发"你好"，验证：
  - [ ] AI 流式回复中文文本
  - [ ] 光标闪烁动画在流式中
  - [ ] 流式完成后光标消失

- [ ] **Step 4**：如果全部通过，打 Day 0 里程碑 tag

```bash
git tag day0-done
git commit --allow-empty -m "milestone: Day 0 scaffold + chat complete"
```

---

# Day 1 · 周六 · Word 功能 + 产物面板

**目标**：`/word` 命令能生成真实 .docx 并展示。

---

## Task 1.1: Server - services/docxGen.js

**Files:**
- Create: `server/services/docxGen.js`

- [ ] **Step 1**：

```javascript
import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx'
import fs from 'fs'
import path from 'path'
import { store } from '../store.js'

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array<{heading:string,content:string}>} opts.sections
 */
export async function generateDocx({ title, sections }) {
  const children = []

  // 文档标题
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: title, font: '宋体', size: 36, bold: true })]
  }))
  children.push(new Paragraph({ text: '' }))

  for (const s of sections) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: s.heading, font: '宋体', size: 28, bold: true })]
    }))
    const paras = String(s.content || '').split(/\n\n+/)
    for (const p of paras) {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p, font: 'Times New Roman', size: 24 })]
      }))
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({
    creator: 'AgentDev Lite',
    title,
    sections: [{ properties: {}, children }]
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `word_${timestamp()}_${sanitizeFilename(title)}.docx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  fs.writeFileSync(fullPath, buffer)

  return { filename, path: fullPath }
}
```

- [ ] **Step 2**：提交

```bash
git add server/services/docxGen.js
git commit -m "feat(server): add docx generator with Chinese font support"
```

---

## Task 1.2: Server - routes/word.js

**Files:**
- Create: `server/routes/word.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generateDocx } from '../services/docxGen.js'
import { store } from '../store.js'

const router = express.Router()

const STYLE_HINTS = {
  academic: '严谨学术风格，正式书面语，有数据和论证',
  business: '职场正式风格，结构清晰，结论前置',
  casual: '轻松通俗风格，口语化表达'
}

function buildSystemPrompt({ wordCount, style }) {
  return `你是 Word 文档助手。根据用户要求输出纯 JSON:
{"sections":[{"heading":"一级标题","content":"正文段落..."}]}
要求:
- 至少 ${wordCount} 字（±10%）
- 风格: ${STYLE_HINTS[style] || STYLE_HINTS.academic}
- content 用普通段落，不要 Markdown 语法
- 段落之间用 \\n\\n 分隔
- 5-8 个 section
- 不要输出 JSON 以外任何文字`
}

router.post('/', async (req, res) => {
  try {
    const { conversationId, title, outline, wordCount = 1500, style = 'academic' } = req.body || {}
    if (!title || !outline) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 title 或 outline' } })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ wordCount, style }) },
      { role: 'user', content: `文档标题: ${title}\n\n要求:\n${outline}` }
    ]

    const json = await chatJson(messages)
    if (!Array.isArray(json.sections) || json.sections.length === 0) {
      return res.status(502).json({ ok: false, error: { code: 'LLM_INVALID_JSON', message: '模型输出缺少 sections 数组' } })
    }

    const { filename, path: filePath } = await generateDocx({ title, sections: json.sections })

    const artifact = {
      id: store.genId('art-'),
      type: 'word',
      filename,
      path: filePath,
      title,
      conversationId: conversationId || null,
      createdAt: new Date().toISOString()
    }
    store.addArtifact(artifact)

    const preview = json.sections[0]?.content?.slice(0, 200) || ''

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, preview, sections: json.sections })
  } catch (e) {
    console.error('[word]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
```

- [ ] **Step 2**：在 `server/index.js` 挂载

```javascript
// 在 import 区加
import wordRouter from './routes/word.js'

// 在路由挂载区加
app.use('/api/word', wordRouter)
```

- [ ] **Step 3**：提交

```bash
git add server/routes/word.js server/index.js
git commit -m "feat(server): add /api/word endpoint generating docx via LLM"
```

---

## Task 1.3: Server - routes/artifacts.js + open-file

**Files:**
- Create: `server/routes/artifacts.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import path from 'path'
import { exec } from 'child_process'
import { store } from '../store.js'

const router = express.Router()

router.get('/', (req, res) => {
  res.json({ ok: true, items: store.listArtifacts() })
})

router.post('/open', (req, res) => {
  const { path: targetPath } = req.body || {}
  if (typeof targetPath !== 'string' || !targetPath) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 path' } })
  }
  const resolved = path.resolve(targetPath)
  const generatedRoot = path.resolve(store.GENERATED_DIR)
  if (!resolved.startsWith(generatedRoot)) {
    return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '路径越界' } })
  }

  // Windows 用 start "" "<path>"，注意转义
  const cmd = process.platform === 'win32'
    ? `start "" "${resolved}"`
    : process.platform === 'darwin'
      ? `open "${resolved}"`
      : `xdg-open "${resolved}"`

  exec(cmd, (err) => {
    if (err) {
      console.error('[open-file]', err)
      return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: err.message } })
    }
    res.json({ ok: true })
  })
})

export default router
```

- [ ] **Step 2**：在 `server/index.js` 挂载

```javascript
import artifactsRouter from './routes/artifacts.js'
// ...
app.use('/api/artifacts', artifactsRouter)
```

- [ ] **Step 3**：提交

```bash
git add server/routes/artifacts.js server/index.js
git commit -m "feat(server): add /api/artifacts list and open-file with path guard"
```

---

## Task 1.4: Client - lib/commands.js + useCommand hook + CommandPalette

**Files:**
- Create: `client/src/lib/commands.js`
- Create: `client/src/hooks/useCommand.js`
- Create: `client/src/components/chat/CommandPalette.jsx`

- [ ] **Step 1**：`commands.js`

```javascript
import { FileText, Presentation, BookOpen, CalendarClock, CalendarDays } from 'lucide-react'

export const COMMANDS = [
  { id: 'word', label: '/word', description: '生成 Word 文档', icon: FileText, cardType: 'word' },
  { id: 'ppt', label: '/ppt', description: '生成 PPT 演示文稿', icon: Presentation, cardType: 'ppt' },
  { id: 'paper', label: '/paper', description: '论文助手（大纲/摘要/章节/润色）', icon: BookOpen, cardType: 'paper' },
  { id: 'plan', label: '/plan', description: '任务规划（时间线 + 甘特图）', icon: CalendarDays, cardType: 'plan' },
  { id: 'schedule', label: '/schedule', description: '定时任务', icon: CalendarClock, cardType: 'schedule' }
]

export function matchCommands(input) {
  if (!input.startsWith('/')) return []
  const q = input.slice(1).toLowerCase()
  return COMMANDS.filter(c => c.id.startsWith(q))
}
```

- [ ] **Step 2**：`useCommand.js`

```javascript
import { useState, useCallback } from 'react'
import { matchCommands } from '../lib/commands.js'

export function useCommand() {
  const [active, setActive] = useState(false)
  const [matches, setMatches] = useState([])
  const [index, setIndex] = useState(0)

  const update = useCallback((text) => {
    if (text.startsWith('/')) {
      const m = matchCommands(text)
      setActive(m.length > 0)
      setMatches(m)
      setIndex(0)
    } else {
      setActive(false)
      setMatches([])
    }
  }, [])

  const close = useCallback(() => {
    setActive(false)
    setMatches([])
  }, [])

  const next = useCallback(() => setIndex(i => (i + 1) % Math.max(1, matches.length)), [matches.length])
  const prev = useCallback(() => setIndex(i => (i - 1 + matches.length) % Math.max(1, matches.length)), [matches.length])

  return { active, matches, index, setIndex, update, close, next, prev }
}
```

- [ ] **Step 3**：`CommandPalette.jsx`

```javascript
export default function CommandPalette({ matches, index, onSelect, onHover }) {
  if (!matches.length) return null
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-lg shadow-lg overflow-hidden">
      {matches.map((c, i) => {
        const Icon = c.icon
        return (
          <button
            key={c.id}
            type="button"
            onMouseEnter={() => onHover?.(i)}
            onClick={() => onSelect(c)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${i === index ? 'bg-[color:var(--bg-tertiary)]' : 'hover:bg-[color:var(--bg-tertiary)]'}`}
          >
            <Icon size={16} className="text-[color:var(--accent)]" />
            <div className="flex-1">
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-[color:var(--text-muted)]">{c.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4**：修改 `InputBar.jsx` 以支持命令面板

```javascript
import { useState } from 'react'
import { Send } from 'lucide-react'
import CommandPalette from './CommandPalette.jsx'
import { useCommand } from '../../hooks/useCommand.js'

export default function InputBar({ onSend, onCommand, disabled }) {
  const [text, setText] = useState('')
  const cmd = useCommand()

  function handleChange(e) {
    const v = e.target.value
    setText(v)
    cmd.update(v)
  }

  function selectCommand(c) {
    onCommand?.(c)
    setText('')
    cmd.close()
  }

  function handleSubmit(e) {
    e.preventDefault()
    const v = text.trim()
    if (!v || disabled) return
    if (cmd.active && cmd.matches[cmd.index]) {
      selectCommand(cmd.matches[cmd.index])
      return
    }
    onSend(v)
    setText('')
  }

  function handleKey(e) {
    if (cmd.active) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmd.next(); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmd.prev(); return }
      if (e.key === 'Escape') { e.preventDefault(); cmd.close(); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative border-t border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-6 py-4">
      <div className="relative">
        <CommandPalette
          matches={cmd.active ? cmd.matches : []}
          index={cmd.index}
          onHover={cmd.setIndex}
          onSelect={selectCommand}
        />
        <div className="flex items-end gap-3 bg-[color:var(--bg-primary)] border border-[color:var(--border)] rounded-xl px-3 py-2 focus-within:border-[color:var(--accent)]">
          <textarea
            value={text}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder='发送消息，或输入 "/" 触发命令...'
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-sm max-h-40 py-1"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-[color:var(--accent)] text-white disabled:opacity-40"
            aria-label="send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 5**：提交

```bash
git add client/src/lib/commands.js client/src/hooks/useCommand.js client/src/components/chat/CommandPalette.jsx client/src/components/chat/InputBar.jsx
git commit -m "feat(client): add slash command palette with keyboard navigation"
```

---

## Task 1.5: Client - WordCard 三态组件

**Files:**
- Create: `client/src/components/cards/WordCard.jsx`

- [ ] **Step 1**：

```javascript
import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { api } from '../../lib/api.js'

export default function WordCard({ msg, onUpdate, onFileGenerated }) {
  const { id, cardState, cardData } = msg
  const [form, setForm] = useState({
    title: cardData?.title || '',
    outline: cardData?.outline || '',
    wordCount: cardData?.wordCount || 1500,
    style: cardData?.style || 'academic'
  })
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!form.title.trim() || !form.outline.trim()) {
      setError('请填写标题和要求')
      return
    }
    setError('')
    onUpdate(id, 'loading', form)
    try {
      const r = await api.post('/api/word', { ...form })
      onUpdate(id, 'done', { ...form, result: r })
      onFileGenerated?.({
        id: r.artifactId,
        type: 'word',
        filename: r.filename,
        path: r.path,
        title: form.title,
        createdAt: new Date().toISOString()
      })
    } catch (e) {
      onUpdate(id, 'form', form)
      setError(e.message || '生成失败')
    }
  }

  if (cardState === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          正在生成 Word 文档，约需 10-30 秒...
        </div>
      </Card>
    )
  }

  if (cardState === 'done') {
    const r = cardData.result
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-[color:var(--accent)]" />
          <span className="font-medium text-sm">Word 文档已生成</span>
        </div>
        <div className="text-xs text-[color:var(--text-muted)] mb-2">标题：{cardData.title}</div>
        <div className="text-xs bg-[color:var(--bg-tertiary)] rounded p-2 text-[color:var(--text-muted)] line-clamp-3">
          {r.preview}...
        </div>
      </Card>
    )
  }

  // form
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <FileText size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">生成 Word 文档</span>
      </div>
      <div className="space-y-3">
        <Field label="标题">
          <input
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="例如：软件工程实验报告"
            className="input"
          />
        </Field>
        <Field label="内容要求">
          <textarea
            value={form.outline}
            onChange={e => setForm({ ...form, outline: e.target.value })}
            rows={3}
            placeholder="描述需要涵盖的要点..."
            className="input resize-none"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="字数">
            <input
              type="number"
              value={form.wordCount}
              onChange={e => setForm({ ...form, wordCount: parseInt(e.target.value) || 1500 })}
              className="input"
            />
          </Field>
          <Field label="风格">
            <select
              value={form.style}
              onChange={e => setForm({ ...form, style: e.target.value })}
              className="input"
            >
              <option value="academic">学术</option>
              <option value="business">职场</option>
              <option value="casual">轻松</option>
            </select>
          </Field>
        </div>
        {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}
        <button
          onClick={handleGenerate}
          className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:opacity-90"
        >
          生成
        </button>
      </div>
      <style>{`
        .input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          background: var(--bg-primary);
          color: var(--text-primary);
          outline: none;
        }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </Card>
  )
}

function Card({ children }) {
  return (
    <div className="my-3 p-4 border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2**：提交

```bash
git add client/src/components/cards/WordCard.jsx
git commit -m "feat(client): add WordCard component with form/loading/done states"
```

---

## Task 1.6: Client - FileCard

**Files:**
- Create: `client/src/components/cards/FileCard.jsx`

- [ ] **Step 1**：

```javascript
import { FileText, Presentation, FileCode, ExternalLink } from 'lucide-react'
import { api } from '../../lib/api.js'

const ICONS = {
  word: FileText,
  ppt: Presentation,
  schedule: FileCode
}

export default function FileCard({ artifact }) {
  const Icon = ICONS[artifact.type] || FileText

  async function handleOpen() {
    try {
      await api.post('/api/artifacts/open', { path: artifact.path })
    } catch (e) {
      alert('打开失败: ' + e.message)
    }
  }

  return (
    <div
      onClick={handleOpen}
      className="my-3 max-w-[680px] cursor-pointer border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] p-3 flex items-center gap-3 shadow-sm hover:shadow-md hover:border-[color:var(--accent)] transition"
    >
      <div className="w-10 h-10 rounded-lg bg-[color:var(--bg-tertiary)] flex items-center justify-center">
        <Icon size={18} className="text-[color:var(--accent)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{artifact.filename}</div>
        <div className="text-xs text-[color:var(--text-muted)] truncate">{artifact.title}</div>
      </div>
      <ExternalLink size={14} className="text-[color:var(--text-muted)]" />
    </div>
  )
}
```

- [ ] **Step 2**：提交

```bash
git add client/src/components/cards/FileCard.jsx
git commit -m "feat(client): add FileCard for opening generated files"
```

---

## Task 1.7: Client - 集成 cards 到 MessageList + ChatArea

**Files:**
- Modify: `client/src/components/chat/MessageList.jsx`
- Modify: `client/src/components/chat/ChatArea.jsx`

- [ ] **Step 1**：更新 `MessageList.jsx`

```javascript
import { useEffect, useRef } from 'react'
import MessageBubble from './MessageBubble.jsx'
import WordCard from '../cards/WordCard.jsx'
import FileCard from '../cards/FileCard.jsx'

export default function MessageList({ messages, onUpdateCard, onFileGenerated }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-[color:var(--text-muted)] text-sm">
          输入消息开始对话。输入 "/" 触发命令面板。
        </div>
      )}
      {messages.map(m => {
        if (m.role === 'user' || m.role === 'assistant') {
          return <MessageBubble key={m.id} role={m.role} content={m.content} streaming={m.streaming} />
        }
        if (m.role === 'card') {
          if (m.cardType === 'word') {
            return <WordCard key={m.id} msg={m} onUpdate={onUpdateCard} onFileGenerated={onFileGenerated} />
          }
          if (m.cardType === 'file') {
            return <FileCard key={m.id} artifact={m.cardData} />
          }
          return <div key={m.id} className="text-xs text-[color:var(--text-muted)] my-2">[card: {m.cardType}]</div>
        }
        return null
      })}
      <div ref={endRef} />
    </div>
  )
}
```

- [ ] **Step 2**：更新 `ChatArea.jsx`

```javascript
import { useChat } from '../../hooks/useChat.js'
import MessageList from './MessageList.jsx'
import InputBar from './InputBar.jsx'

export default function ChatArea() {
  const { messages, streaming, sendUserMessage, addCard, updateCard, addFileCard } = useChat()

  function handleCommand(cmd) {
    addCard(cmd.cardType)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <MessageList
        messages={messages}
        onUpdateCard={updateCard}
        onFileGenerated={addFileCard}
      />
      <InputBar onSend={sendUserMessage} onCommand={handleCommand} disabled={streaming} />
    </div>
  )
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/components/chat/MessageList.jsx client/src/components/chat/ChatArea.jsx
git commit -m "feat(client): wire word card and file card into chat flow"
```

---

## Task 1.8: Client - ArtifactsPanel

**Files:**
- Create: `client/src/panels/ArtifactsPanel.jsx`
- Modify: `client/src/components/layout/RightDrawer.jsx`

- [ ] **Step 1**：`ArtifactsPanel.jsx`

```javascript
import { useEffect, useState, useCallback } from 'react'
import { FileText, Presentation, FileCode, RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'

const ICONS = { word: FileText, ppt: Presentation, schedule: FileCode }

export default function ArtifactsPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/artifacts')
      setItems(r.items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleOpen(a) {
    try {
      await api.post('/api/artifacts/open', { path: a.path })
    } catch (e) {
      alert('打开失败: ' + e.message)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">已生成文件</h2>
        <button onClick={load} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {items.length === 0 && (
        <div className="text-xs text-[color:var(--text-muted)] py-8 text-center">暂无文件</div>
      )}
      {items.map(a => {
        const Icon = ICONS[a.type] || FileText
        return (
          <button
            key={a.id}
            onClick={() => handleOpen(a)}
            className="w-full text-left p-3 border border-[color:var(--border)] rounded-lg hover:bg-[color:var(--bg-tertiary)] flex gap-3"
          >
            <Icon size={16} className="text-[color:var(--accent)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{a.title || a.filename}</div>
              <div className="text-xs text-[color:var(--text-muted)] truncate">{a.filename}</div>
              <div className="text-xs text-[color:var(--text-muted)]">{new Date(a.createdAt).toLocaleString('zh-CN')}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2**：更新 `RightDrawer.jsx` 挂上 ArtifactsPanel

```javascript
import { X } from 'lucide-react'
import SettingsPanel from '../../panels/SettingsPanel.jsx'
import ArtifactsPanel from '../../panels/ArtifactsPanel.jsx'

export default function RightDrawer({ view, onClose }) {
  if (!view) return null
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-10" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[360px] bg-[color:var(--bg-primary)] border-l border-[color:var(--border)] z-20 shadow-xl overflow-y-auto">
        <div className="h-14 px-4 flex items-center justify-between border-b border-[color:var(--border)] sticky top-0 bg-[color:var(--bg-primary)] z-10">
          <span className="font-medium">{view === 'settings' ? '设置' : '产物'}</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]">
            <X size={16} />
          </button>
        </div>
        {view === 'settings' && <SettingsPanel />}
        {view === 'artifacts' && <ArtifactsPanel />}
      </aside>
    </>
  )
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/panels/ArtifactsPanel.jsx client/src/components/layout/RightDrawer.jsx
git commit -m "feat(client): add artifacts panel listing generated files"
```

---

## Task 1.9: Day 1 验收

- [ ] **Step 1**：`npm run dev` 启动
- [ ] **Step 2**：验证
  - [ ] 输入 `/` 命令面板浮出 5 个选项
  - [ ] 选 `/word`，WordCard 表单插入消息流
  - [ ] 填"软件工程实验报告" + 要求 + 2000 字 + academic，点生成
  - [ ] Card 切到 loading 态，7-30 秒后切到 done 态
  - [ ] 消息流追加 FileCard
  - [ ] 点 FileCard 系统打开 Word 文档
  - [ ] Word 文档有标题、5-8 个段落、字数大致符合
  - [ ] 打开右侧产物面板，有刚生成的文件
  - [ ] 点产物面板里的项，再次打开文件

- [ ] **Step 3**：里程碑 tag

```bash
git tag day1-done
git commit --allow-empty -m "milestone: Day 1 word generation complete"
```

---

# Day 2 · 周日 · PPT 功能

**目标**：`/ppt` 命令真跑通。

---

## Task 2.1: Server - services/pptxGen.js

**Files:**
- Create: `server/services/pptxGen.js`

- [ ] **Step 1**：

```javascript
import PptxGenJS from 'pptxgenjs'
import path from 'path'
import { store } from '../store.js'

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array<{title:string,bullets:string[]}>} opts.slides
 */
export async function generatePptx({ title, slides }) {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.title = title
  pres.company = 'AgentDev Lite'

  // 封面页
  const cover = pres.addSlide()
  cover.background = { color: 'F6F8FB' }
  cover.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.4,
    fill: { type: 'solid', color: '3B82F6' },
    line: { color: '3B82F6', width: 0 }
  })
  cover.addText(slides[0]?.title || title, {
    x: 1, y: 2.2, w: 8, h: 1.5,
    fontSize: 36, bold: true, color: '0F172A', fontFace: '微软雅黑', align: 'center'
  })
  const coverSub = (slides[0]?.bullets || []).join(' · ')
  if (coverSub) {
    cover.addText(coverSub, {
      x: 1, y: 3.8, w: 8, h: 0.8,
      fontSize: 16, color: '64748B', fontFace: '微软雅黑', align: 'center'
    })
  }

  // 内容页
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i]
    const slide = pres.addSlide()
    slide.background = { color: 'FFFFFF' }

    // 顶部细条
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 0.15,
      fill: { type: 'solid', color: '3B82F6' },
      line: { color: '3B82F6', width: 0 }
    })

    slide.addText(s.title || '', {
      x: 0.5, y: 0.4, w: 9, h: 0.8,
      fontSize: 24, bold: true, color: '0F172A', fontFace: '微软雅黑'
    })

    const bullets = (s.bullets || []).map(b => ({ text: b, options: { bullet: { code: '25CF' } } }))
    slide.addText(bullets, {
      x: 0.7, y: 1.4, w: 8.6, h: 4.2,
      fontSize: 18, color: '0F172A', fontFace: '微软雅黑', paraSpaceAfter: 12
    })

    // 页码
    slide.addText(`${i} / ${slides.length - 1}`, {
      x: 9, y: 5.3, w: 0.8, h: 0.3,
      fontSize: 10, color: '94A3B8', fontFace: '微软雅黑', align: 'right'
    })
  }

  const filename = `ppt_${timestamp()}_${sanitizeFilename(title)}.pptx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  await pres.writeFile({ fileName: fullPath })

  return { filename, path: fullPath }
}
```

- [ ] **Step 2**：提交

```bash
git add server/services/pptxGen.js
git commit -m "feat(server): add pptx generator with cover and content slides"
```

---

## Task 2.2: Server - routes/ppt.js

**Files:**
- Create: `server/routes/ppt.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'
import { generatePptx } from '../services/pptxGen.js'
import { store } from '../store.js'

const router = express.Router()

function buildSystemPrompt({ slideCount }) {
  return `你是 PPT 助手。根据要求输出纯 JSON:
{"slides":[{"title":"页标题","bullets":["要点1","要点2"]}]}
要求:
- 恰好 ${slideCount} 页
- 第一页是封面（title 为主题，bullets 为副标题/作者/日期）
- 每页 bullets 3-5 条，每条不超过 25 字
- 最后一页是总结/致谢
- 不要输出 JSON 以外任何文字`
}

router.post('/', async (req, res) => {
  try {
    const { conversationId, title, topic, slideCount = 10, style = 'business' } = req.body || {}
    if (!title || !topic) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 title 或 topic' } })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ slideCount }) },
      { role: 'user', content: `主题: ${title}\n内容方向: ${topic}\n风格: ${style}` }
    ]

    const json = await chatJson(messages)
    if (!Array.isArray(json.slides) || json.slides.length === 0) {
      return res.status(502).json({ ok: false, error: { code: 'LLM_INVALID_JSON', message: '模型输出缺少 slides 数组' } })
    }

    const { filename, path: filePath } = await generatePptx({ title, slides: json.slides })

    const artifact = {
      id: store.genId('art-'),
      type: 'ppt',
      filename,
      path: filePath,
      title,
      conversationId: conversationId || null,
      createdAt: new Date().toISOString()
    }
    store.addArtifact(artifact)

    res.json({ ok: true, artifactId: artifact.id, filename, path: filePath, slides: json.slides })
  } catch (e) {
    console.error('[ppt]', e)
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
```

- [ ] **Step 2**：挂到 `server/index.js`

```javascript
import pptRouter from './routes/ppt.js'
app.use('/api/ppt', pptRouter)
```

- [ ] **Step 3**：提交

```bash
git add server/routes/ppt.js server/index.js
git commit -m "feat(server): add /api/ppt endpoint generating pptx via LLM"
```

---

## Task 2.3: Client - PptCard

**Files:**
- Create: `client/src/components/cards/PptCard.jsx`
- Modify: `client/src/components/chat/MessageList.jsx`

- [ ] **Step 1**：`PptCard.jsx`（结构和 WordCard 类似，可复制粘贴修改）

```javascript
import { useState } from 'react'
import { Presentation, Loader2 } from 'lucide-react'
import { api } from '../../lib/api.js'

export default function PptCard({ msg, onUpdate, onFileGenerated }) {
  const { id, cardState, cardData } = msg
  const [form, setForm] = useState({
    title: cardData?.title || '',
    topic: cardData?.topic || '',
    slideCount: cardData?.slideCount || 10,
    style: cardData?.style || 'business'
  })
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (!form.title.trim() || !form.topic.trim()) {
      setError('请填写标题和内容方向')
      return
    }
    setError('')
    onUpdate(id, 'loading', form)
    try {
      const r = await api.post('/api/ppt', { ...form })
      onUpdate(id, 'done', { ...form, result: r })
      onFileGenerated?.({
        id: r.artifactId, type: 'ppt', filename: r.filename, path: r.path,
        title: form.title, createdAt: new Date().toISOString()
      })
    } catch (e) {
      onUpdate(id, 'form', form)
      setError(e.message || '生成失败')
    }
  }

  if (cardState === 'loading') {
    return (
      <Card>
        <div className="flex items-center gap-3 text-sm text-[color:var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          正在生成 PPT，约需 15-40 秒...
        </div>
      </Card>
    )
  }

  if (cardState === 'done') {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Presentation size={16} className="text-[color:var(--accent)]" />
          <span className="font-medium text-sm">PPT 已生成</span>
        </div>
        <div className="text-xs text-[color:var(--text-muted)]">
          共 {cardData.result.slides?.length || 0} 页 · 主题：{cardData.title}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Presentation size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">生成 PPT</span>
      </div>
      <div className="space-y-3">
        <Field label="主题">
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：期中项目汇报" className="input" />
        </Field>
        <Field label="内容方向">
          <textarea value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} rows={3} placeholder="描述 PPT 想表达的内容..." className="input resize-none" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="页数">
            <input type="number" value={form.slideCount} onChange={e => setForm({ ...form, slideCount: parseInt(e.target.value) || 10 })} className="input" />
          </Field>
          <Field label="风格">
            <select value={form.style} onChange={e => setForm({ ...form, style: e.target.value })} className="input">
              <option value="business">商务</option>
              <option value="academic">学术</option>
              <option value="casual">轻松</option>
            </select>
          </Field>
        </div>
        {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}
        <button onClick={handleGenerate} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:opacity-90">
          生成
        </button>
      </div>
      <style>{`
        .input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary); outline: none; }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </Card>
  )
}

function Card({ children }) {
  return <div className="my-3 p-4 border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">{children}</div>
}

function Field({ label, children }) {
  return <div><div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>{children}</div>
}
```

- [ ] **Step 2**：在 `MessageList.jsx` 加 `ppt` 分支

```javascript
import PptCard from '../cards/PptCard.jsx'
// ...
if (m.cardType === 'ppt') {
  return <PptCard key={m.id} msg={m} onUpdate={onUpdateCard} onFileGenerated={onFileGenerated} />
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/components/cards/PptCard.jsx client/src/components/chat/MessageList.jsx
git commit -m "feat(client): add PptCard and wire into message list"
```

---

## Task 2.4: Day 2 验收

- [ ] **Step 1**：`/ppt` 生成 10 页 PPT
- [ ] **Step 2**：PowerPoint 打开无错位、封面有强调色条、每页 3-5 bullets
- [ ] **Step 3**：同一会话里 Word/PPT 穿插使用 3-4 次
- [ ] **Step 4**：产物面板两种类型都显示

```bash
git tag day2-done
git commit --allow-empty -m "milestone: Day 2 PPT generation complete - MVP core delivered"
```

**🎉 MVP 核心交付物达成。后续都是加分项，掉队也能交。**

---

# Day 3 · 周一 · 论文助手 + Markdown 渲染

---

## Task 3.1: Server - routes/paper.js

**Files:**
- Create: `server/routes/paper.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import { chat, chatStream, DeepSeekError } from '../services/deepseek.js'

const router = express.Router()

function buildMessages(mode, payload) {
  const { topic, section, wordCount = 800, context, text } = payload
  switch (mode) {
    case 'outline':
      return [
        { role: 'system', content: '你是论文写作助手。输出 Markdown 格式的章节大纲。' },
        { role: 'user', content: `为主题《${topic}》输出论文大纲，包含引言、相关工作、方法、实验、结论五节，每节给 2-3 个子节。用 Markdown 层级标题和列表。` }
      ]
    case 'abstract':
      return [
        { role: 'system', content: '你是论文摘要助手。用中文学术语气撰写。' },
        { role: 'user', content: `为题目《${topic}》写一段 200-300 字的中文学术摘要，包含研究背景、方法、主要发现、意义。输出纯文本不加 Markdown。` }
      ]
    case 'section':
      return [
        { role: 'system', content: '你是论文章节撰写助手。学术语气，引用用 [1][2] 形式。' },
        { role: 'user', content: `论文主题《${topic}》。${context ? `前文上下文:\n${context}\n\n` : ''}请为章节《${section}》撰写约 ${wordCount} 字的正文内容。输出 Markdown 格式。` }
      ]
    case 'polish':
      return [
        { role: 'system', content: '你是论文润色助手。' },
        { role: 'user', content: `润色以下中文学术文本：提升流畅度、统一术语、修正语病，不改变原意和核心内容。\n\n输出格式:\n# 润色后全文\n<润色后的完整文本>\n\n# 主要修改点\n- <修改点1>\n- <修改点2>\n- ...\n\n原文:\n${text}` }
      ]
    default:
      throw new Error('unknown mode')
  }
}

// 流式接口 (outline/abstract/section)
router.post('/stream', async (req, res) => {
  const { mode, ...payload } = req.body || {}
  if (!['outline', 'abstract', 'section'].includes(mode)) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'mode 不支持流式' } })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  try {
    const messages = buildMessages(mode, payload)
    for await (const delta of chatStream({ messages })) {
      send({ delta })
    }
    send({ done: true })
  } catch (e) {
    const payload2 = e instanceof DeepSeekError
      ? { error: { code: e.code, message: e.message } }
      : { error: { code: 'INTERNAL', message: e.message } }
    send(payload2)
  } finally {
    res.end()
  }
})

// 一次性接口 (polish)
router.post('/', async (req, res) => {
  try {
    const { mode, ...payload } = req.body || {}
    if (mode !== 'polish') {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '请使用 /api/paper/stream 接口' } })
    }
    const messages = buildMessages('polish', payload)
    const content = await chat({ messages })
    res.json({ ok: true, mode, content })
  } catch (e) {
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
```

- [ ] **Step 2**：挂到 `server/index.js`

```javascript
import paperRouter from './routes/paper.js'
app.use('/api/paper', paperRouter)
```

- [ ] **Step 3**：提交

```bash
git add server/routes/paper.js server/index.js
git commit -m "feat(server): add /api/paper with 4 modes (outline/abstract/section/polish)"
```

---

## Task 3.2: Client - PaperCard 4 模式

**Files:**
- Create: `client/src/components/cards/PaperCard.jsx`
- Modify: `client/src/components/chat/MessageList.jsx`

- [ ] **Step 1**：`PaperCard.jsx`

```javascript
import { useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../../lib/api.js'

const MODES = [
  { id: 'outline', label: '大纲' },
  { id: 'abstract', label: '摘要' },
  { id: 'section', label: '章节' },
  { id: 'polish', label: '润色' }
]

export default function PaperCard({ msg, onUpdate }) {
  const { id, cardState, cardData } = msg
  const [mode, setMode] = useState(cardData?.mode || 'outline')
  const [form, setForm] = useState({
    topic: '', section: '', wordCount: 800, context: '', text: ''
  })
  const [streaming, setStreaming] = useState(false)
  const [content, setContent] = useState(cardData?.content || '')
  const [error, setError] = useState('')

  async function handleRun() {
    setError('')
    setContent('')
    setStreaming(true)
    onUpdate(id, 'loading', { mode, form })
    try {
      if (mode === 'polish') {
        if (!form.text.trim()) { setError('请粘贴要润色的原文'); setStreaming(false); onUpdate(id, 'form'); return }
        const r = await api.post('/api/paper', { mode, text: form.text })
        setContent(r.content)
        onUpdate(id, 'done', { mode, form, content: r.content })
      } else {
        if (mode !== 'section' && !form.topic.trim()) { setError('请填写主题'); setStreaming(false); onUpdate(id, 'form'); return }
        if (mode === 'section' && (!form.topic || !form.section)) { setError('请填写主题和章节名'); setStreaming(false); onUpdate(id, 'form'); return }
        let full = ''
        await api.stream(
          '/api/paper/stream',
          { mode, ...form },
          (delta) => { full += delta; setContent(full) },
          () => { onUpdate(id, 'done', { mode, form, content: full }) },
          (err) => { setError(err.message); onUpdate(id, 'form') }
        )
      }
    } catch (e) {
      setError(e.message)
      onUpdate(id, 'form')
    } finally {
      setStreaming(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">论文助手</span>
      </div>

      <div className="flex gap-1 mb-3 border-b border-[color:var(--border)]">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 text-xs border-b-2 ${mode === m.id ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-transparent text-[color:var(--text-muted)]'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {(mode === 'outline' || mode === 'abstract' || mode === 'section') && (
          <Field label="主题">
            <input value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="例如：基于深度学习的情感分析研究" className="input" />
          </Field>
        )}
        {mode === 'section' && (
          <>
            <Field label="章节名">
              <input value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} placeholder="例如：相关工作" className="input" />
            </Field>
            <Field label="字数">
              <input type="number" value={form.wordCount} onChange={e => setForm({ ...form, wordCount: parseInt(e.target.value) || 800 })} className="input" />
            </Field>
            <Field label="上下文 (可选)">
              <textarea value={form.context} onChange={e => setForm({ ...form, context: e.target.value })} rows={2} className="input resize-none" />
            </Field>
          </>
        )}
        {mode === 'polish' && (
          <Field label="原文">
            <textarea value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} rows={6} placeholder="粘贴要润色的中文学术文本..." className="input resize-none" />
          </Field>
        )}

        {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}

        <button
          onClick={handleRun}
          disabled={streaming}
          className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {streaming ? <><Loader2 size={14} className="animate-spin" />生成中...</> : '生成'}
        </button>

        {content && (
          <div className="mt-3 p-3 bg-[color:var(--bg-secondary)] rounded-lg max-h-96 overflow-y-auto text-sm">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary); outline: none; }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </Card>
  )
}

function Card({ children }) {
  return <div className="my-3 p-4 border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">{children}</div>
}

function Field({ label, children }) {
  return <div><div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>{children}</div>
}
```

- [ ] **Step 2**：`MessageList.jsx` 加 `paper` 分支

```javascript
import PaperCard from '../cards/PaperCard.jsx'
// ...
if (m.cardType === 'paper') {
  return <PaperCard key={m.id} msg={m} onUpdate={onUpdateCard} />
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/components/cards/PaperCard.jsx client/src/components/chat/MessageList.jsx
git commit -m "feat(client): add PaperCard with 4 modes and streaming"
```

---

## Task 3.3: Client - MessageBubble 加 Markdown 渲染

**Files:**
- Modify: `client/src/components/chat/MessageBubble.jsx`

- [ ] **Step 1**：更新

```javascript
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function MessageBubble({ role, content, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm break-words ${
          isUser
            ? 'bg-[color:var(--accent)] text-white rounded-br-sm whitespace-pre-wrap'
            : 'bg-[color:var(--bg-secondary)] text-[color:var(--text-primary)] rounded-bl-sm border border-[color:var(--border)]'
        }`}
      >
        {isUser ? (
          <>
            {content}
            {streaming && <span className="inline-block w-1 h-4 bg-current ml-1 animate-pulse align-middle" />}
          </>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-pre:my-2 prose-headings:my-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
            {streaming && <span className="inline-block w-1 h-4 bg-current ml-1 animate-pulse align-middle" />}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2**：提交

```bash
git add client/src/components/chat/MessageBubble.jsx
git commit -m "feat(client): render markdown in assistant bubbles"
```

---

## Task 3.4: Day 3 验收

- [ ] **Step 1**：4 个模式都能跑
  - [ ] outline: 生成 Markdown 大纲，渲染成层级标题
  - [ ] abstract: 200-300 字纯文本摘要
  - [ ] section: 指定章节正文，~800 字
  - [ ] polish: 粘贴一段文字，返回"润色后全文 + 修改点"

- [ ] **Step 2**：普通对话里 AI 回复代码块、表格正确渲染

- [ ] **Step 3**：tag

```bash
git tag day3-done
git commit --allow-empty -m "milestone: Day 3 paper assistant + markdown complete"
```

---

# Day 4 · 周二 · 任务规划 + 定时任务 + 甘特图

---

## Task 4.1: Server - routes/plan.js

**Files:**
- Create: `server/routes/plan.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import { chatJson, DeepSeekError } from '../services/deepseek.js'

const router = express.Router()

function buildSystemPrompt({ startDate, deadline, granularity }) {
  return `你是任务规划助手。输出纯 JSON:
{"tasks":[{"id":"t1","title":"任务名","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","estHours":4,"category":"设计|开发|测试|文档|其他","dependsOn":[]}]}
要求:
- 5-12 个任务
- 每个任务时长 0.5-3 天
- startDate/endDate 在 ${startDate} 到 ${deadline} 之间
- category 只能是: 设计 / 开发 / 测试 / 文档 / 其他
- 合理安排依赖关系 (dependsOn 填前置任务 id)
- 粒度: ${granularity}
- 不要输出 JSON 以外任何文字`
}

router.post('/', async (req, res) => {
  try {
    const { goal, startDate, deadline, granularity = 'day' } = req.body || {}
    if (!goal || !startDate || !deadline) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 goal/startDate/deadline' } })
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ startDate, deadline, granularity }) },
      { role: 'user', content: `目标: ${goal}` }
    ]

    const json = await chatJson(messages)
    if (!Array.isArray(json.tasks)) {
      return res.status(502).json({ ok: false, error: { code: 'LLM_INVALID_JSON', message: '缺少 tasks 数组' } })
    }

    res.json({ ok: true, goal, startDate, endDate: deadline, tasks: json.tasks })
  } catch (e) {
    if (e instanceof DeepSeekError) {
      return res.status(502).json({ ok: false, error: { code: e.code, message: e.message } })
    }
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } })
  }
})

export default router
```

- [ ] **Step 2**：挂到 `server/index.js`

```javascript
import planRouter from './routes/plan.js'
app.use('/api/plan', planRouter)
```

- [ ] **Step 3**：提交

```bash
git add server/routes/plan.js server/index.js
git commit -m "feat(server): add /api/plan task decomposition endpoint"
```

---

## Task 4.2: Client - PlanCard 时间线视图

**Files:**
- Create: `client/src/components/cards/PlanCard.jsx`
- Create: `client/src/lib/dateUtils.js`

- [ ] **Step 1**：`dateUtils.js`

```javascript
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function diffDays(a, b) {
  const ms = parseDate(b) - parseDate(a)
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function datesInRange(start, end) {
  const result = []
  const startD = parseDate(start)
  const endD = parseDate(end)
  let cur = new Date(startD)
  while (cur <= endD) {
    result.push(formatDate(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

export function dayIndex(date, startDate) {
  return diffDays(startDate, date)
}
```

- [ ] **Step 2**：`PlanCard.jsx`

```javascript
import { useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { datesInRange, dayIndex, diffDays } from '../../lib/dateUtils.js'

const CATEGORY_COLORS = {
  '设计': { bg: '#dbeafe', text: '#1e40af' },
  '开发': { bg: '#dcfce7', text: '#166534' },
  '测试': { bg: '#fef3c7', text: '#92400e' },
  '文档': { bg: '#f3e8ff', text: '#6b21a8' },
  '其他': { bg: '#f1f5f9', text: '#334155' }
}

function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function plusDays(s, n) {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const pad = (x) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export default function PlanCard({ msg, onUpdate }) {
  const { id, cardState, cardData } = msg
  const [form, setForm] = useState({
    goal: cardData?.form?.goal || '',
    startDate: cardData?.form?.startDate || today(),
    deadline: cardData?.form?.deadline || plusDays(today(), 14),
    granularity: cardData?.form?.granularity || 'day'
  })
  const [view, setView] = useState(cardData?.view || 'timeline')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const result = cardData?.result

  async function handleGenerate() {
    if (!form.goal.trim()) { setError('请填写目标'); return }
    setError(''); setLoading(true)
    onUpdate(id, 'loading', { form })
    try {
      const r = await api.post('/api/plan', form)
      onUpdate(id, 'done', { form, result: r, view: 'timeline' })
    } catch (e) {
      setError(e.message); onUpdate(id, 'form', { form })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">任务规划</span>
      </div>

      {cardState !== 'done' && (
        <div className="space-y-3">
          <Field label="目标">
            <textarea value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} rows={2} placeholder="例如：两周内完成软件工程大作业" className="input resize-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="开始">
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input" />
            </Field>
            <Field label="截止">
              <input type="date" value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} className="input" />
            </Field>
          </div>
          <Field label="粒度">
            <select value={form.granularity} onChange={e => setForm({ ...form, granularity: e.target.value })} className="input">
              <option value="day">天</option>
              <option value="week">周</option>
              <option value="hour">小时</option>
            </select>
          </Field>
          {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}
          <button onClick={handleGenerate} disabled={loading} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={14} className="animate-spin" />规划中...</> : '生成规划'}
          </button>
        </div>
      )}

      {cardState === 'done' && result && (
        <>
          <div className="flex gap-1 mb-3 border-b border-[color:var(--border)]">
            <TabBtn active={view === 'timeline'} onClick={() => setView('timeline')}>时间线</TabBtn>
            <TabBtn active={view === 'gantt'} onClick={() => setView('gantt')}>甘特图</TabBtn>
          </div>
          {view === 'timeline' && <TimelineView result={result} />}
          {view === 'gantt' && <GanttView result={result} />}
        </>
      )}

      <style>{`
        .input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary); outline: none; }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </Card>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 text-xs border-b-2 ${active ? 'border-[color:var(--accent)] text-[color:var(--accent)]' : 'border-transparent text-[color:var(--text-muted)]'}`}>
      {children}
    </button>
  )
}

function TimelineView({ result }) {
  // 按开始日期分组
  const groups = {}
  for (const t of result.tasks) {
    if (!groups[t.startDate]) groups[t.startDate] = []
    groups[t.startDate].push(t)
  }
  const dates = Object.keys(groups).sort()
  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {dates.map(d => (
        <div key={d} className="flex gap-4">
          <div className="w-20 shrink-0 text-xs text-[color:var(--text-muted)] pt-1">{d}</div>
          <div className="flex-1 space-y-2">
            {groups[d].map(t => {
              const c = CATEGORY_COLORS[t.category] || CATEGORY_COLORS['其他']
              return (
                <div key={t.id} className="px-3 py-2 rounded border-l-4" style={{ background: c.bg, borderColor: c.text }}>
                  <div className="text-sm font-medium" style={{ color: c.text }}>{t.title}</div>
                  <div className="text-xs" style={{ color: c.text }}>~{t.estHours}h · {t.category} · {t.startDate} → {t.endDate}</div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function GanttView({ result }) {
  const dates = datesInRange(result.startDate, result.endDate)
  const totalDays = dates.length
  return (
    <div className="overflow-x-auto max-h-96">
      <div style={{ minWidth: Math.max(600, totalDays * 40) + 'px' }}>
        {/* 日期表头 */}
        <div className="grid border-b border-[color:var(--border)] pb-1 mb-2" style={{ gridTemplateColumns: `160px repeat(${totalDays}, 1fr)` }}>
          <div className="text-xs text-[color:var(--text-muted)]">任务</div>
          {dates.map(d => (
            <div key={d} className="text-[10px] text-center text-[color:var(--text-muted)]">{d.slice(5)}</div>
          ))}
        </div>
        {/* 任务行 */}
        {result.tasks.map(t => {
          const startIdx = dayIndex(t.startDate, result.startDate)
          const endIdx = dayIndex(t.endDate, result.startDate)
          const c = CATEGORY_COLORS[t.category] || CATEGORY_COLORS['其他']
          return (
            <div key={t.id} className="grid items-center py-1" style={{ gridTemplateColumns: `160px repeat(${totalDays}, 1fr)` }}>
              <div className="text-xs truncate pr-2" title={t.title}>{t.title}</div>
              <div
                className="h-6 rounded flex items-center justify-center text-[10px] font-medium"
                style={{
                  gridColumn: `${startIdx + 2} / ${endIdx + 3}`,
                  background: c.bg,
                  color: c.text
                }}
              >
                {t.estHours}h
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ children }) {
  return <div className="my-3 p-4 border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] shadow-sm max-w-[880px]">{children}</div>
}
function Field({ label, children }) {
  return <div><div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>{children}</div>
}
```

- [ ] **Step 3**：`MessageList.jsx` 加 `plan` 分支

```javascript
import PlanCard from '../cards/PlanCard.jsx'
// ...
if (m.cardType === 'plan') {
  return <PlanCard key={m.id} msg={m} onUpdate={onUpdateCard} />
}
```

- [ ] **Step 4**：提交

```bash
git add client/src/components/cards/PlanCard.jsx client/src/lib/dateUtils.js client/src/components/chat/MessageList.jsx
git commit -m "feat(client): add PlanCard with timeline and gantt views"
```

---

## Task 4.3: Server - services/scheduler.js

**Files:**
- Create: `server/services/scheduler.js`

- [ ] **Step 1**：

```javascript
import cron from 'node-cron'
import fs from 'fs'
import path from 'path'
import { store } from '../store.js'
import { chat, DeepSeekError } from './deepseek.js'

const jobs = new Map() // taskId → scheduled task

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function executeTask(task) {
  const runAt = new Date().toISOString()
  console.log(`[scheduler] running task ${task.id} (${task.name})`)
  try {
    const messages = [
      { role: 'system', content: '你是定时任务执行助手。根据以下指令生成结果，输出 Markdown 格式:' },
      { role: 'user', content: task.prompt }
    ]
    const content = await chat({ messages })

    const filename = `schedule_${task.id}_${timestamp()}.md`
    const fullPath = path.join(store.GENERATED_DIR, filename)
    fs.writeFileSync(fullPath, content, 'utf-8')

    const artifact = {
      id: store.genId('art-'),
      type: 'schedule',
      filename,
      path: fullPath,
      title: task.name,
      createdAt: runAt
    }
    store.addArtifact(artifact)

    store.appendTaskHistory(task.id, {
      runAt,
      status: 'success',
      artifactId: artifact.id,
      preview: content.slice(0, 200)
    })
  } catch (e) {
    console.error(`[scheduler] task ${task.id} failed:`, e.message)
    store.appendTaskHistory(task.id, {
      runAt,
      status: 'error',
      error: e.message
    })
  }
}

export const scheduler = {
  init() {
    const tasks = store.listScheduledTasks()
    for (const t of tasks) {
      if (t.enabled) this.schedule(t)
    }
    console.log(`[scheduler] initialized with ${jobs.size} active tasks`)
  },

  schedule(task) {
    this.unschedule(task.id)
    if (!task.enabled) return
    if (!cron.validate(task.cron)) {
      console.warn(`[scheduler] invalid cron for ${task.id}: ${task.cron}`)
      return
    }
    const job = cron.schedule(task.cron, () => executeTask(task), {
      timezone: 'Asia/Shanghai'
    })
    jobs.set(task.id, job)
  },

  unschedule(id) {
    const job = jobs.get(id)
    if (job) {
      job.stop()
      jobs.delete(id)
    }
  },

  async runNow(task) {
    await executeTask(task)
  },

  isValidCron(expr) {
    return cron.validate(expr)
  }
}
```

- [ ] **Step 2**：提交

```bash
git add server/services/scheduler.js
git commit -m "feat(server): add cron-based scheduler service"
```

---

## Task 4.4: Server - routes/schedule.js

**Files:**
- Create: `server/routes/schedule.js`

- [ ] **Step 1**：

```javascript
import express from 'express'
import { store } from '../store.js'
import { scheduler } from '../services/scheduler.js'

const router = express.Router()

const PRESETS = {
  'daily-8am': '0 8 * * *',
  'daily-9pm': '0 21 * * *',
  'weekly-mon': '0 8 * * 1',
  'weekly-fri': '0 17 * * 5',
  'monthly-1st': '0 8 1 * *',
  'test-every-minute': '* * * * *'
}

function resolveCron(expr) {
  return PRESETS[expr] || expr
}

router.get('/', (req, res) => {
  const tasks = store.listScheduledTasks().map(t => ({
    ...t,
    history: undefined,
    historyCount: (t.history || []).length
  }))
  res.json({ ok: true, tasks })
})

router.get('/:id', (req, res) => {
  const task = store.listScheduledTasks().find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } })
  res.json({ ok: true, task, history: task.history || [] })
})

router.post('/', (req, res) => {
  const { name, prompt, cron: cronExpr, enabled = true } = req.body || {}
  if (!name || !prompt || !cronExpr) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: '缺少 name/prompt/cron' } })
  }
  const resolved = resolveCron(cronExpr)
  if (!scheduler.isValidCron(resolved)) {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: `cron 表达式无效: ${resolved}` } })
  }
  const task = {
    id: store.genId('sch-'),
    name,
    prompt,
    cron: resolved,
    enabled,
    createdAt: new Date().toISOString(),
    lastRun: null,
    history: []
  }
  store.upsertScheduledTask(task)
  scheduler.schedule(task)
  res.json({ ok: true, task })
})

router.patch('/:id', (req, res) => {
  const task = store.listScheduledTasks().find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } })
  if (typeof req.body.enabled === 'boolean') task.enabled = req.body.enabled
  store.upsertScheduledTask(task)
  scheduler.schedule(task)
  res.json({ ok: true, task })
})

router.delete('/:id', (req, res) => {
  scheduler.unschedule(req.params.id)
  store.removeScheduledTask(req.params.id)
  res.json({ ok: true })
})

router.post('/:id/run', async (req, res) => {
  const task = store.listScheduledTasks().find(t => t.id === req.params.id)
  if (!task) return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '任务不存在' } })
  await scheduler.runNow(task)
  res.json({ ok: true })
})

export default router
```

- [ ] **Step 2**：挂到 `server/index.js` 并初始化 scheduler

```javascript
import scheduleRouter from './routes/schedule.js'
import { scheduler } from './services/scheduler.js'

app.use('/api/schedule', scheduleRouter)

// 在 app.listen 后调用
app.listen(PORT, () => {
  console.log(`[server] running on http://localhost:${PORT}`)
  scheduler.init()
})
```

- [ ] **Step 3**：提交

```bash
git add server/routes/schedule.js server/index.js
git commit -m "feat(server): add /api/schedule CRUD and scheduler init on boot"
```

---

## Task 4.5: Client - ScheduleCard

**Files:**
- Create: `client/src/components/cards/ScheduleCard.jsx`
- Modify: `client/src/components/chat/MessageList.jsx`

- [ ] **Step 1**：`ScheduleCard.jsx`

```javascript
import { useEffect, useState, useCallback } from 'react'
import { CalendarClock, Play, Trash2, Pause, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api.js'

const PRESETS = [
  { value: 'daily-8am', label: '每天 8 点' },
  { value: 'daily-9pm', label: '每天 21 点' },
  { value: 'weekly-mon', label: '每周一 8 点' },
  { value: 'weekly-fri', label: '每周五 17 点' },
  { value: 'monthly-1st', label: '每月 1 号 8 点' },
  { value: 'test-every-minute', label: '每分钟（测试用）' },
  { value: 'custom', label: '自定义 cron 表达式' }
]

export default function ScheduleCard() {
  const [tasks, setTasks] = useState([])
  const [form, setForm] = useState({ name: '', prompt: '', preset: 'daily-8am', customCron: '', enabled: true })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await api.get('/api/schedule')
      setTasks(r.tasks || [])
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCreate() {
    if (!form.name.trim() || !form.prompt.trim()) { setError('请填写名称和 prompt'); return }
    const cronExpr = form.preset === 'custom' ? form.customCron : form.preset
    if (!cronExpr) { setError('请选择或填写 cron 表达式'); return }
    setError(''); setLoading(true)
    try {
      await api.post('/api/schedule', { name: form.name, prompt: form.prompt, cron: cronExpr, enabled: form.enabled })
      setForm({ name: '', prompt: '', preset: 'daily-8am', customCron: '', enabled: true })
      load()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(id) {
    if (!confirm('确定删除这个定时任务吗？')) return
    try { await api.del(`/api/schedule/${id}`); load() } catch (e) { alert(e.message) }
  }

  async function handleToggle(task) {
    try { await api.patch(`/api/schedule/${task.id}`, { enabled: !task.enabled }); load() } catch (e) { alert(e.message) }
  }

  async function handleRunNow(task) {
    try { await api.post(`/api/schedule/${task.id}/run`); setTimeout(load, 500) } catch (e) { alert(e.message) }
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <CalendarClock size={16} className="text-[color:var(--accent)]" />
        <span className="font-medium text-sm">定时任务</span>
      </div>

      <div className="mb-4 bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
        ⚠ 后端进程关闭后定时任务不会触发
      </div>

      <div className="space-y-3 mb-4 pb-4 border-b border-[color:var(--border)]">
        <Field label="任务名称">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="例如：每日新闻摘要" className="input" />
        </Field>
        <Field label="Prompt">
          <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={3} placeholder="给 AI 的指令..." className="input resize-none" />
        </Field>
        <Field label="执行时机">
          <select value={form.preset} onChange={e => setForm({ ...form, preset: e.target.value })} className="input">
            {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        {form.preset === 'custom' && (
          <Field label="自定义 cron（5 字段）">
            <input value={form.customCron} onChange={e => setForm({ ...form, customCron: e.target.value })} placeholder="0 8 * * *" className="input" />
          </Field>
        )}
        {error && <div className="text-xs text-[color:var(--error)]">{error}</div>}
        <button onClick={handleCreate} disabled={loading} className="w-full h-9 rounded-md bg-[color:var(--accent)] text-white text-sm font-medium disabled:opacity-50">
          {loading ? '创建中...' : '创建任务'}
        </button>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[color:var(--text-muted)]">现有任务 ({tasks.length})</div>
        <button onClick={load} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tasks.length === 0 && <div className="text-xs text-[color:var(--text-muted)] text-center py-3">暂无任务</div>}
        {tasks.map(t => (
          <div key={t.id} className="p-3 border border-[color:var(--border)] rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium flex items-center gap-2">
                {t.name}
                {!t.enabled && <span className="text-[10px] text-[color:var(--text-muted)] border rounded px-1">已暂停</span>}
              </div>
              <div className="flex items-center gap-1">
                <IconBtn onClick={() => handleRunNow(t)} title="立即执行"><Play size={12} /></IconBtn>
                <IconBtn onClick={() => handleToggle(t)} title={t.enabled ? '暂停' : '启用'}><Pause size={12} /></IconBtn>
                <IconBtn onClick={() => handleDelete(t.id)} title="删除"><Trash2 size={12} /></IconBtn>
              </div>
            </div>
            <div className="text-xs text-[color:var(--text-muted)]">cron: {t.cron}</div>
            {t.lastRun && <div className="text-xs text-[color:var(--text-muted)]">最近运行: {new Date(t.lastRun).toLocaleString('zh-CN')}</div>}
            <div className="text-xs text-[color:var(--text-muted)]">执行次数: {t.historyCount || 0}</div>
          </div>
        ))}
      </div>

      <style>{`
        .input { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary); outline: none; }
        .input:focus { border-color: var(--accent); }
      `}</style>
    </Card>
  )
}

function IconBtn({ onClick, title, children }) {
  return <button onClick={onClick} title={title} className="p-1 rounded hover:bg-[color:var(--bg-tertiary)]">{children}</button>
}
function Card({ children }) {
  return <div className="my-3 p-4 border border-[color:var(--border)] rounded-xl bg-[color:var(--bg-primary)] shadow-sm max-w-[680px]">{children}</div>
}
function Field({ label, children }) {
  return <div><div className="text-xs text-[color:var(--text-muted)] mb-1">{label}</div>{children}</div>
}
```

- [ ] **Step 2**：`MessageList.jsx` 加 `schedule` 分支

```javascript
import ScheduleCard from '../cards/ScheduleCard.jsx'
// ...
if (m.cardType === 'schedule') {
  return <ScheduleCard key={m.id} />
}
```

- [ ] **Step 3**：提交

```bash
git add client/src/components/cards/ScheduleCard.jsx client/src/components/chat/MessageList.jsx
git commit -m "feat(client): add ScheduleCard for cron-based AI tasks"
```

---

## Task 4.6: Day 4 验收

- [ ] **Step 1**：`/plan` 生成 5-12 任务，时间线显示正确，甘特图 block 对齐日期，5 类颜色区分
- [ ] **Step 2**：`/schedule` 创建一个"每分钟（测试用）"任务，prompt 写"给我一个随机编程小技巧"
- [ ] **Step 3**：等 1 分钟，检查 `data/data.json` 里该任务的 `history` 有新记录；`generated/` 下有新 `.md` 文件；产物面板里有新条目
- [ ] **Step 4**：暂停/启用/删除任务均生效
- [ ] **Step 5**：tag

```bash
git tag day4-done
git commit --allow-empty -m "milestone: Day 4 plan + schedule + gantt complete"
```

---

# Day 5 · 周三 · 打磨 + （可选）Electron

---

## Task 5.1: Toast 错误提示系统

**Files:**
- Create: `client/src/hooks/useToast.js`
- Create: `client/src/components/common/Toast.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/lib/api.js`

- [ ] **Step 1**：`useToast.js`（简单的 context）

```javascript
import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const show = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(ts => [...ts, { id, message, type }])
    setTimeout(() => {
      setToasts(ts => ts.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2 rounded-lg shadow-md text-sm border ${
              t.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
              t.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
              'bg-[color:var(--bg-primary)] border-[color:var(--border)] text-[color:var(--text-primary)]'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

// 全局引用，便于非组件处（如 api.js）调用
let globalShow = null
export function setGlobalToast(show) { globalShow = show }
export function toast(message, type) { globalShow?.(message, type) }
```

- [ ] **Step 2**：修改 `App.jsx`

```javascript
import { useEffect } from 'react'
import Layout from './components/layout/Layout.jsx'
import { ToastProvider, useToast, setGlobalToast } from './hooks/useToast.js'

function ToastBridge({ children }) {
  const { show } = useToast()
  useEffect(() => { setGlobalToast(show) }, [show])
  return children
}

export default function App() {
  return (
    <ToastProvider>
      <ToastBridge>
        <Layout />
      </ToastBridge>
    </ToastProvider>
  )
}
```

- [ ] **Step 3**：在 `lib/api.js` 的 `request` 函数 catch 区加

```javascript
import { toast } from '../hooks/useToast.js'

// 在 throw err 之前
toast(err.message, 'error')
throw new ApiError(err.code, err.message)
```

- [ ] **Step 4**：提交

```bash
git add client/src/hooks/useToast.js client/src/App.jsx client/src/lib/api.js
git commit -m "feat(client): add global toast system for api errors"
```

---

## Task 5.2: UI 打磨扫尾

- [ ] **Step 1**：跑一遍所有功能，列出视觉问题（间距不对、hover 不明显、空状态难看等）
- [ ] **Step 2**：针对问题小步修改，每修好一类 commit 一次

参考检查清单：
- [ ] 侧边栏选中态高亮
- [ ] 卡片 hover 阴影加深
- [ ] 输入框 focus 边框蓝色
- [ ] 按钮 disabled 态有视觉区分
- [ ] loading spinner 居中
- [ ] 空状态（无对话、无产物、无任务）都有友好提示
- [ ] 长文本在气泡里换行正确

- [ ] **Step 3**：每类修完

```bash
git add .
git commit -m "style: polish ui pass N"
```

---

## Task 5.3: README 最终版

**Files:**
- Modify: `README.md`

- [ ] **Step 1**：写一个完整 README（含截图占位）

```markdown
# AgentDev Lite

模仿 AionUi 布局的简易版 Agent 助手。覆盖 Word/PPT 生成、论文助手、任务规划、定时任务五大能力。

## 技术栈

- **前端**：React 18 + Vite + Tailwind CSS + react-markdown
- **后端**：Express + DeepSeek API
- **文件生成**：docx / pptxgenjs
- **定时器**：node-cron

## 运行

```bash
# 首次安装所有依赖（root + client + server）
npm run setup

# 同时启动前后端
npm run dev
```

- 前端: http://localhost:5173
- 后端: http://localhost:8787

## 首次使用

1. 访问 http://localhost:5173
2. 点右上角 ⚙ 图标打开设置面板
3. 填入 DeepSeek API Key（https://platform.deepseek.com 申请）
4. 保存后即可使用

## 功能一览

在聊天框输入 `/` 触发命令面板：

| 命令 | 功能 |
|---|---|
| `/word` | 生成 Word 文档 (.docx) |
| `/ppt` | 生成 PPT 演示文稿 (.pptx) |
| `/paper` | 论文助手：大纲 / 摘要 / 章节 / 润色 |
| `/plan` | 任务规划（时间线 + 甘特图） |
| `/schedule` | 定时任务（cron 触发 AI 执行） |

或直接发送消息进行普通对话（流式回复）。

## 目录

```
agentdev-lite/
├── client/        React 前端
├── server/        Express 后端
├── data/          持久化（API Key / 对话 / 任务）
├── generated/     生成的文档
└── docs/          设计文档和实施计划
```

## 演示脚本（答辩用）

1. **普通对话**：发"帮我写一个 Python 二分查找函数"
2. **Word**：`/word` → 标题"软件工程实验报告" → 要求"包含实验目的/步骤/结果/总结" → 2000 字 → academic
3. **PPT**：`/ppt` → 标题"期中项目汇报" → 内容方向"AionUi 简化版开发过程" → 10 页 → business
4. **论文大纲**：`/paper` → 大纲 tab → 主题"基于深度学习的情感分析研究"
5. **任务规划**：`/plan` → 目标"两周内完成软件工程大作业" → 显示时间线和甘特图
6. **定时任务**：`/schedule` → "每天 8 点" → prompt "给我一个编程小技巧"

## 已知限制

- 定时任务仅在后端进程运行期间触发，关闭服务后停止
- 无对话跨会话持久化
- API Key 明文存储在本地 `data/config.json`

## 许可

MIT
```

- [ ] **Step 2**：提交

```bash
git add README.md
git commit -m "docs: finalize README with features and demo script"
```

---

## Task 5.4: Electron 套壳（**可选**，上午 12:00 前有空余才做）

**Files:**
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Modify: `package.json`

- [ ] **Step 1**：装依赖

```bash
npm install --save-dev electron electron-builder
```

- [ ] **Step 2**：`electron/main.js`

```javascript
import { app, BrowserWindow, shell } from 'electron'
import { fork } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let serverProc = null

function startServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(__dirname, '..', 'server', 'index.js')
    serverProc = fork(serverPath, [], {
      env: { ...process.env, PORT: '8787' },
      stdio: 'pipe'
    })
    serverProc.stdout?.on('data', (data) => {
      const msg = data.toString()
      console.log('[server]', msg)
      if (msg.includes('running on')) resolve()
    })
    setTimeout(resolve, 5000) // 超时兜底
  })
}

async function createWindow() {
  await startServer()

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    backgroundColor: '#ffffff',
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
  if (serverProc) serverProc.kill()
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 3**：修改根 `package.json` 加 electron 脚本

```json
{
  "main": "electron/main.js",
  "scripts": {
    "setup": "...",
    "dev": "...",
    "build:client": "npm --prefix client run build",
    "electron:dev": "NODE_ENV=development electron .",
    "electron:build": "npm run build:client && electron-builder"
  },
  "build": {
    "appId": "com.agentdev.lite",
    "productName": "AgentDev Lite",
    "directories": { "output": "dist-electron" },
    "files": ["electron/**", "client/dist/**", "server/**", "package.json"],
    "win": { "target": "nsis" }
  }
}
```

- [ ] **Step 4**：测试

```bash
# 先起 client dev server
cd client && npm run dev &
# 另一个终端
cd ..
npm run electron:dev
```

如果 15 分钟内跑不起来 —— **放弃**，revert 这个 task 的改动，回退到 web-only 版本。

- [ ] **Step 5**（若成功）：打包

```bash
npm run electron:build
```

产物在 `dist-electron/`。

- [ ] **Step 6**：提交

```bash
git add electron/ package.json package-lock.json
git commit -m "feat(optional): add electron wrapper for desktop packaging"
```

---

## Task 5.5: 最终验收

- [ ] **Step 1**：按 README 的"演示脚本"从头跑一遍，不中断、不报错
- [ ] **Step 2**：浏览所有 5 种 card，所有 UI 元素对齐、字体一致
- [ ] **Step 3**：故意断网试一次 API 调用，确认 toast 弹出友好错误
- [ ] **Step 4**：检查 `git log --oneline` 有清晰的提交历史
- [ ] **Step 5**：最后一次里程碑 tag

```bash
git tag v0.1.0-mvp
git commit --allow-empty -m "release: v0.1.0 MVP ready for demo"
```

- [ ] **Step 6**：交付材料清单
  - [ ] 项目源码（`D:\claude project\agentdev-lite\`）
  - [ ] README.md
  - [ ] spec 和 plan 文档（`docs/superpowers/`）
  - [ ] （可选）`dist-electron/*.exe`
  - [ ] 演示脚本

---

## 备用砍项目清单（应急）

如果任何一天掉队，按此顺序砍：

1. 先砍 **Electron**（Task 5.4）
2. 再砍 **ScheduleCard 的 UI 美化**（功能保留，样式不打磨）
3. 再砍 **论文助手 polish 模式**
4. 再砍 **PlanCard 的甘特图视图**（只留时间线）
5. 再砍 **ScheduleCard 整个功能**
6. 再砍 **PlanCard 整个功能**
7. **死线兜底**：保 Word + PPT + 通用对话 + 配置页即可交 MVP

---

## 附录：常见问题排查

**问题：DeepSeek 调用 401**
→ 设置面板 API Key 没保存成功。检查 `data/config.json`。

**问题：docx 生成中文乱码**
→ 确认 `docxGen.js` 里所有 TextRun 都指定了 `font: '宋体'` 或 `'Times New Roman'`。

**问题：pptxgenjs 生成的 PPT 打开错位**
→ 检查 `pptxGen.js` 里坐标是否超出 `LAYOUT_16x9` 的 10x5.625 英寸范围。

**问题：node-cron 不触发**
→ 检查 `cron.validate()` 返回 true，时区是否为 `Asia/Shanghai`，表达式字段数是否 5 个。

**问题：前端 `/api/*` 404**
→ 检查 `vite.config.js` 的 proxy 是否指向 `localhost:8787`。

**问题：生成文件打开后是"无法访问"**
→ Windows 路径反斜杠需转义，或改用 `path.resolve` 统一格式。
