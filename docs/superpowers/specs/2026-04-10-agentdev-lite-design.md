# AgentDev Lite — 设计文档

- **日期**: 2026-04-10
- **状态**: 已通过 brainstorm 评审，待 spec review
- **截止**: 2026-04-15（周三）MVP 交付
- **开发模式**: 单人（学生）指挥 Codex 开发，课程作业性质
- **项目目录**: `D:\claude project\agentdev-lite\`

---

## 1. 目标与非目标

### 1.1 要做什么
用 5.5 天时间做一个模仿 AionUi 布局/交互、但使用浅色主题的简易版 Agent 桌面助手，覆盖以下能力：

1. **通用对话**（流式）
2. **Word 生成**（LLM 输出 → .docx 文件）— **MVP 必须跑通**
3. **PPT 生成**（LLM 输出 → .pptx 文件）— **MVP 必须跑通**
4. **论文助手**（大纲 / 摘要 / 章节 / 润色 四模式）
5. **任务规划**（一次性 LLM 拆解，时间线 + 甘特图双视图）
6. **定时任务**（cron 触发，后台自动执行 AI 任务）
7. **基础模块**：模型配置页、已生成文件列表、本地持久化、Markdown 渲染

### 1.2 不做什么（明确 YAGNI）

- 用户登录/多用户、云同步、WebSocket
- 数据库（用 JSON 文件）、schema 迁移
- 国际化（只做中文）
- 单元测试 / E2E 测试 / CI/CD / Lint / Docker
- 文件上传、图片生成、多模态、语音输入
- 对话历史跨会话持久化进 prompt（每次对话独立）
- TypeScript（纯 JS）

### 1.3 成功标准

交付时（2026-04-15）：
- `npm run setup && npm run dev` 能起来，前端 `http://localhost:5173` 打开
- 在浅色主题 UI 里能顺畅跑完 Word / PPT / 论文助手 / 任务规划 / 定时任务五个功能的演示路径
- Word 和 PPT 生成的文件用系统默认程序打开格式正确
- 定时任务能设置 cron 表达式并被真正触发

---

## 2. 技术栈

- **前端**：React 18 + Vite + Tailwind CSS + react-markdown + remark-gfm + lucide-react（纯 JS，无 TS）
- **后端**：Node.js + Express + cors
- **文件生成**：`docx`（Word）+ `pptxgenjs`（PPT）
- **LLM**：DeepSeek（`deepseek-chat`，OpenAI 兼容端点）
- **定时器**：`node-cron`
- **HTTP 客户端**：`node-fetch`
- **持久化**：`data/config.json` + `data/data.json`（JSON 文件，全量重写）
- **启动聚合**：`concurrently`（root 一条 `npm run dev` 同时启前后端）
- **Electron**（可选，Day 5 若时间允许）：`electron` + `electron-builder`

### 2.1 明确不引入的依赖

- TypeScript、Redux / Zustand、SQLite / better-sqlite3、Jest / Vitest / Playwright、winston / pino、ESLint / Prettier、frappe-gantt（甘特图自实现）

---

## 3. 目录结构

```
D:\claude project\agentdev-lite\
├── package.json              根目录：仅 concurrently + 启动脚本
├── README.md
├── .gitignore                忽略 node_modules / data / generated / dist
│
├── client/                   前端独立项目
│   ├── package.json          react / vite / tailwind / react-markdown / lucide-react
│   ├── vite.config.js        dev 代理 /api → localhost:8787
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── layout/       Sidebar / MainArea / TopBar / RightDrawer / Layout
│       │   ├── chat/         ChatArea / MessageList / MessageBubble / InputBar / CommandPalette
│       │   ├── cards/        WordCard / PptCard / PaperCard / PlanCard / ScheduleCard / FileCard
│       │   └── common/       Button / Badge / Modal / Toast / Spinner / EmptyState
│       ├── hooks/            useChat / useApi / useConfig / useCommand / useToast
│       ├── lib/              api.js (fetch 封装) / commands.js (/ 解析)
│       └── styles/
│           └── theme.css     浅色主题 CSS 变量
│
├── server/                   后端独立项目
│   ├── package.json          express / docx / pptxgenjs / node-fetch / cors / node-cron
│   ├── index.js              入口，挂路由 + CORS + 启动 scheduler
│   ├── routes/
│   │   ├── chat.js           /api/chat（流式 SSE）
│   │   ├── word.js           /api/word
│   │   ├── ppt.js            /api/ppt
│   │   ├── paper.js          /api/paper
│   │   ├── plan.js           /api/plan
│   │   ├── schedule.js       /api/schedule CRUD + run + enable
│   │   ├── artifacts.js      /api/artifacts + /api/open-file
│   │   └── config.js         /api/config GET/POST
│   ├── services/
│   │   ├── deepseek.js       DeepSeek 客户端 + JSON 鲁棒解析
│   │   ├── docxGen.js        docx 封装
│   │   ├── pptxGen.js        pptxgenjs 封装
│   │   └── scheduler.js      node-cron 启动 + 任务执行器
│   └── store.js              读写 data.json / config.json
│
├── data/                     持久化（gitignored）
│   ├── config.json
│   └── data.json
│
├── generated/                输出文件（gitignored）
│   └── *.docx / *.pptx / schedule_*.md
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-10-agentdev-lite-design.md  （本文档）
```

### 3.1 根 `package.json`

```json
{
  "name": "agentdev-lite",
  "private": true,
  "scripts": {
    "setup": "npm install && npm --prefix client install && npm --prefix server install",
    "dev": "concurrently -n server,client -c cyan,magenta \"npm --prefix server run dev\" \"npm --prefix client run dev\""
  },
  "devDependencies": { "concurrently": "^8.2.2" }
}
```

---

## 4. 前端设计

### 4.1 顶层布局

```
┌─────────────────────────────────────────────────────────────┐
│ Sidebar  │                 MainArea                │  Right  │
│  260px   │                  flex-1                 │ Drawer  │
│          │ ┌──────────────────────────────────────┐│  360px  │
│ [新对话] │ │ TopBar: "Word 助手 · 会话 3" [⚙][📁] ││  隐藏   │
│  ────    │ ├──────────────────────────────────────┤│         │
│ 会话列表 │ │ ChatArea                              ││ (按需   │
│          │ │  - MessageBubble                      ││  滑出)  │
│ ────     │ │  - WordCard / PptCard / ...           ││         │
│ 助手列表 │ │  - FileCard                           ││         │
│ •通用    │ │                                       ││         │
│ •Word    │ ├──────────────────────────────────────┤│         │
│ •PPT     │ │ InputBar: [/命令或自由输入] [⬆]      ││         │
│ •论文    │ │   (输入 / 时弹 CommandPalette)        ││         │
│ •日程    │ └──────────────────────────────────────┘│         │
│ ────     │                                          │         │
│ [设置]   │                                          │         │
│ [产物]   │                                          │         │
└──────────┴─────────────────────────────────────────┴─────────┘
```

- Sidebar 宽 260px，可折叠到 60px
- MainArea flex-1
- RightDrawer 宽 360px，默认隐藏，右上角图标触发滑出
- 整屏最小宽度 1024px

### 4.2 浅色主题色板（`client/src/styles/theme.css`）

```css
:root {
  --bg-primary:   #ffffff;
  --bg-secondary: #f6f8fb;
  --bg-tertiary:  #eef2f7;
  --border:       #e2e8f0;
  --text-primary: #0f172a;
  --text-muted:   #64748b;
  --accent:       #3b82f6;
  --accent-grad:  linear-gradient(135deg, #3b82f6, #8b5cf6);
  --success:      #059669;
  --error:        #dc2626;
  --shadow-sm:    0 1px 2px rgba(15,23,42,0.04);
  --shadow-md:    0 4px 12px rgba(15,23,42,0.06);
}
```

视觉风格：白底 + 细边框 + 小阴影 + 蓝紫强调色，参考 Linear / Notion 浅色风。卡片 `rounded-xl border shadow-sm`，hover 时 `shadow-md`。

### 4.3 组件树

```
<App>
 └ <Layout>
    ├ <Sidebar collapsed>
    │   ├ <SidebarHeader />       Logo + 折叠
    │   ├ <NewChatButton />
    │   ├ <ConversationList />
    │   ├ <AssistantList />       5 个助手入口
    │   └ <SidebarFooter />       设置 + 产物
    ├ <MainArea>
    │   ├ <TopBar />              会话标题 + 右上角图标
    │   ├ <ChatArea>
    │   │   └ <MessageList>
    │   │       ├ <MessageBubble role="user|assistant" />
    │   │       ├ <WordCard />
    │   │       ├ <PptCard />
    │   │       ├ <PaperCard />
    │   │       ├ <PlanCard />
    │   │       ├ <ScheduleCard />
    │   │       └ <FileCard />
    │   └ <InputBar>
    │       └ <CommandPalette />
    └ <RightDrawer open view="settings|artifacts">
        ├ <SettingsPanel />
        └ <ArtifactsPanel />
 └ <Toast />
```

### 4.4 关键交互流

- **通用对话**：输入文字 → 回车 → `POST /api/chat` 流式 → MessageBubble 逐字追加
- **斜杠命令**：输入 `/` → CommandPalette 浮出 5 个选项（`/word` `/ppt` `/paper` `/plan` `/schedule`）→ 回车选择 → 对应 Card 以"表单态"插入消息列表
- **Card 三态**：表单态（填入参数）→ 加载态（spinner）→ 结果态（展示输出 + 下方 FileCard）
- **点 FileCard**：调 `POST /api/open-file`，后端用 `exec('start "" <path>')` 打开
- **右抽屉**：TopBar ⚙ 打开 SettingsPanel（DeepSeek API Key / baseUrl / model / temperature）；📁 打开 ArtifactsPanel（产物列表）

### 4.5 状态管理

- `useChat` hook：`useReducer` 管会话列表 + 当前 ID + 消息数组
- `useConfig` hook：从 `/api/config` 拉取模型配置
- 持久化：每次消息变化 debounce 500ms 后 POST 整包保存到后端
- 不引入 Redux / Zustand

---

## 5. 后端 API 契约

### 5.1 `POST /api/chat` —— 通用对话（流式 SSE）

```
请求: { conversationId, messages: [{role, content}], stream: true }
响应: text/event-stream
  data: {"delta":"..."}
  data: {"done":true}
```

### 5.2 `POST /api/word`

```
请求:
{
  conversationId, title, outline, wordCount,
  style: "academic" | "business" | "casual"
}

响应:
{
  ok: true,
  artifactId, filename, path,
  preview: "前 200 字",
  sections: [{heading, content}, ...]
}
```

### 5.3 `POST /api/ppt`

```
请求: { conversationId, title, topic, slideCount, style }
响应:
{
  ok: true,
  artifactId, filename, path,
  slides: [{title, bullets:[...]}, ...]
}
```

### 5.4 `POST /api/paper`

```
请求:
{
  conversationId,
  mode: "outline" | "abstract" | "section" | "polish",
  topic,      // 前三种
  section,    // mode=section
  wordCount,  // mode=section
  context,    // mode=section 可选
  text        // mode=polish
}

响应:
{
  ok: true,
  mode,
  content: "Markdown",
  // polish 模式额外字段：
  polished: "润色后全文",
  changes: ["修改点1", "修改点2", ...]
}
```

outline / abstract / section 流式返回，polish 一次性返回。

### 5.5 `POST /api/plan`

```
请求:
{
  conversationId, goal,
  startDate: "YYYY-MM-DD",
  deadline:  "YYYY-MM-DD",
  granularity: "day" | "week" | "hour"
}

响应:
{
  ok: true,
  goal, startDate, endDate,
  tasks: [
    {
      id, title, startDate, endDate, estHours,
      category: "设计|开发|测试|文档|其他",
      dependsOn: []
    }
  ]
}
```

一次性返回，5-12 个任务。

### 5.6 `/api/schedule` 族

```
POST   /api/schedule           创建
  请求: { name, prompt, cron, enabled }
  响应: { ok, task }

GET    /api/schedule           列表
  响应: { ok, tasks: [...] }

GET    /api/schedule/:id       详情 + history
  响应: { ok, task, history }

DELETE /api/schedule/:id       删除
PATCH  /api/schedule/:id       { enabled: bool }
POST   /api/schedule/:id/run   手动触发
```

### 5.7 `/api/artifacts` + `/api/open-file`

```
GET  /api/artifacts
  响应: { ok, items: [{id, type, filename, path, title, createdAt}] }

POST /api/open-file
  请求: { path }
  响应: { ok }
  安全: path 必须 resolve 后在 generated/ 目录下，否则拒绝
```

### 5.8 `/api/config`

```
GET  响应: { apiKey: "sk-xxx***xxx", baseUrl, model, temperature }  // 脱敏
POST 请求: { apiKey, baseUrl, model, temperature }
POST 响应: { ok }
```

### 5.9 `GET /api/health`

```
响应: { ok, deepseek: "reachable|unreachable", version }
```

### 5.10 统一错误响应

```
{
  ok: false,
  error: {
    code: "DEEPSEEK_AUTH" | "DEEPSEEK_RATE_LIMIT" | "DEEPSEEK_TIMEOUT"
        | "LLM_INVALID_JSON" | "FILE_WRITE" | "NOT_FOUND" | "VALIDATION" | "INTERNAL",
    message: "中文用户友好提示",
    detail: "..."  // 仅 dev
  }
}
```

前端 `lib/api.js` 统一 catch → `toast.error(err.message)`。

---

## 6. LLM Prompt 策略

### 6.1 DeepSeek 客户端封装（`server/services/deepseek.js`）

```javascript
export async function chat({ messages, stream=false, json=false, temperature=0.7 }) {
  const config = store.getConfig()
  const body = {
    model: config.model || 'deepseek-chat',
    messages, temperature, stream,
    ...(json && { response_format: { type: 'json_object' } })
  }
  const resp = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)  // 60s 超时
  })
  if (!resp.ok) throw new DeepSeekError(resp.status, await resp.text())
  if (stream) return parseSSEStream(resp.body)
  const data = await resp.json()
  return data.choices[0].message.content
}
```

### 6.2 JSON 鲁棒解析 + 重试

```javascript
export function parseJsonStrict(raw) {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found')
  return JSON.parse(cleaned.slice(start, end + 1))
}

export async function chatJson(messages, opts = {}) {
  try {
    const raw = await chat({ messages, json: true, ...opts })
    return parseJsonStrict(raw)
  } catch (e) {
    // 重试一次，加强指令
    const retry = await chat({
      messages: [
        ...messages,
        { role: 'user', content: '上次输出不是合法 JSON，请只输出 JSON 对象，不要任何其他文字。' }
      ],
      json: true, ...opts
    })
    return parseJsonStrict(retry)
  }
}
```

### 6.3 各功能 system prompt

**通用对话**：
```
你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。
```

**Word 生成**：
```
你是 Word 文档助手。根据用户要求输出纯 JSON:
{"sections":[{"heading":"一级标题","content":"正文段落..."}]}
要求:
- 至少 {wordCount} 字（±10%）
- 风格: {style}  (academic=严谨学术 / business=职场正式 / casual=轻松)
- content 用普通段落，不要 Markdown 语法
- 段落之间用 \n\n 分隔
- 不要输出 JSON 以外任何文字
```

**PPT 生成**：
```
你是 PPT 助手。根据要求输出纯 JSON:
{"slides":[{"title":"页标题","bullets":["要点1","要点2"]}]}
要求:
- 恰好 {slideCount} 页，第一页是封面（title 为主题，bullets 为副标题/作者）
- 每页 bullets 3-5 条，每条不超过 25 字
- 最后一页是总结/致谢
- 不要输出 JSON 以外任何文字
```

**论文助手**：
- `outline`: "你是论文写作助手。为主题 {topic} 输出 Markdown 章节大纲（引言/相关工作/方法/实验/结论），每节 2-3 个子节"
- `abstract`: "为题目 {topic} 写一段中文学术摘要，200-300 字，涵盖背景、方法、发现、意义"
- `section`: "根据前文 {context}，为章节《{section}》撰写 {wordCount} 字正文，学术语气，引用用 [1][2] 形式"
- `polish`: "润色以下中文学术文本：提升流畅度、统一术语、修正语病，不改变原意。输出: 1. 润色后全文 2. 主要修改点 3-5 条 bullet。原文: {text}"

**任务规划**：
```
你是任务规划助手。用户目标: {goal}，开始 {startDate}，截止 {deadline}。
输出纯 JSON:
{"tasks":[{"id","title","startDate","endDate","estHours","category","dependsOn":[]}]}
要求:
- 5-12 个任务
- 每个任务时长 0.5-3 天
- startDate/endDate 在 {startDate} 和 {deadline} 之间
- category ∈ 设计/开发/测试/文档/其他
- 合理安排依赖关系
- 粒度: {granularity}
- 不要输出 JSON 以外任何文字
```

**定时任务执行**：
```
你是定时任务执行助手。根据以下指令生成结果，输出 Markdown 格式:
{用户配置的 prompt}
```

### 6.4 流式 vs 非流式

| 功能 | 流式 |
|---|---|
| `/api/chat` | ✅ |
| `/api/word` | ❌（要完整 JSON） |
| `/api/ppt` | ❌ |
| `/api/paper` outline/abstract/section | ✅ |
| `/api/paper` polish | ❌ |
| `/api/plan` | ❌ |
| `/api/schedule/:id/run` | ❌（后台执行） |

---

## 7. 持久化

### 7.1 `data/config.json`
```json
{ "apiKey": "sk-...", "baseUrl": "https://api.deepseek.com", "model": "deepseek-chat", "temperature": 0.7 }
```

### 7.2 `data/data.json`
```json
{
  "version": 1,
  "conversations": [
    { "id", "title", "assistant", "createdAt", "updatedAt", "messages": [...] }
  ],
  "artifacts": [
    { "id", "type", "filename", "path", "title", "conversationId", "createdAt" }
  ],
  "scheduledTasks": [
    { "id", "name", "prompt", "cron", "enabled", "createdAt", "lastRun", "history": [...] }
  ]
}
```

**写策略**：每次变更 → `JSON.stringify` 全量重写。MVP 数据量下 < 10ms，不做 WAL / debounce。

### 7.3 文件命名

```
word_{YYYYMMDDTHHMMSS}_{title截断20字}.docx
ppt_{YYYYMMDDTHHMMSS}_{title截断20字}.pptx
schedule_{taskId}_{timestamp}.md
```

---

## 8. 错误处理与安全

### 8.1 超时
- 所有 DeepSeek 调用 60s `AbortSignal.timeout`
- 流式调用每收到 delta 重置超时

### 8.2 错误文案映射

| code | 提示 |
|---|---|
| DEEPSEEK_AUTH | "API Key 无效，请在设置中检查" |
| DEEPSEEK_RATE_LIMIT | "调用太频繁，请稍后再试" |
| DEEPSEEK_TIMEOUT | "模型响应超时（60秒），请重试" |
| LLM_INVALID_JSON | "模型输出格式异常，已重试仍失败，请换个描述重试" |
| FILE_WRITE | "文件写入失败，请检查 generated/ 目录权限" |
| VALIDATION | "参数不合法：{detail}" |
| INTERNAL | "服务异常，请查看控制台日志" |

### 8.3 安全

| 风险 | 防御 |
|---|---|
| API key 泄露到前端 | GET `/api/config` 脱敏为 `sk-xxx***xxx` |
| 路径穿越 | `/api/open-file` 校验 `path.resolve(p)` 必须以 `generated/` 绝对路径开头 |
| 任意文件读取 | 不提供通用 read-file 接口 |
| cron 表达式注入 | 用 `node-cron` validator |
| CORS | 后端只允许 `http://localhost:5173` |
| data.json 体积 | conversations > 50 或 messages > 200 时给警告 |
| 定时任务进程退出 | 前端 banner 提示"后端离线时定时任务不会触发" |

---

## 9. Day-by-Day 执行计划

基准：2026-04-10（周五）晚 → 2026-04-15（周三）。每天 4-6 小时有效工作。

### Day 0 · 周五晚 · scaffold + 跑通对话

**Codex 任务**：
1. 创建目录、初始化三个 `package.json`
2. 装依赖（client / server / root）
3. `tailwind.config.js` + `postcss.config.js` + `theme.css`
4. `vite.config.js`（代理 /api）
5. `server/index.js`（express + cors + 静态 generated/）
6. `server/services/deepseek.js`（chat + parseJsonStrict + chatJson）
7. `server/store.js`（读写 data/config）
8. `server/routes/chat.js`（SSE 流式）
9. `server/routes/config.js`（GET 脱敏 / POST 落盘）
10. 前端 Layout / Sidebar / MainArea / ChatArea / MessageBubble / InputBar
11. `hooks/useChat.js`（useReducer + 流式读取 delta）
12. `RightDrawer` + `SettingsPanel`
13. `README.md` 启动说明

**验收**：
- `npm run setup && npm run dev` 起得来
- 填 API Key 保存 → `data/config.json` 有内容
- 发"你好" → AI 流式中文回复
- 新对话能创建，`data/data.json` 有 conversations 记录

### Day 1 · 周六 · Word 功能 + 产物面板

**Codex 任务**：
1. `services/docxGen.js`（docx 库，Times New Roman 12pt + 标题分级）
2. `routes/word.js`（调 chatJson + docxGen + addArtifact）
3. `routes/artifacts.js`（GET 列表 + POST open-file + 路径校验）
4. `CommandPalette.jsx`（输入 / 弹出选项）
5. `cards/WordCard.jsx`（三态：表单/加载/结果）
6. `cards/FileCard.jsx`
7. `panels/ArtifactsPanel.jsx`
8. `hooks/useCommand.js`

**验收**：
- `/word` 命令 → WordCard 表单 → 生成 → FileCard → 点击打开 Word 文档正确
- 产物面板列出文件

### Day 2 · 周日 · PPT 功能

**Codex 任务**：
1. `services/pptxGen.js`（封面渐变背景 + 内容页 bullets + 尾页）
2. `routes/ppt.js`
3. `cards/PptCard.jsx`
4. CommandPalette 加 `/ppt`
5. 卡片统一样式调整

**验收**：
- `/ppt` 生成 10 页 PPT 用 PowerPoint 打开无错位
- Word/PPT 在同一会话穿插使用不乱

**此时达到"最低交付物"里程碑 —— 后续都是加分项。**

### Day 3 · 周一 · 论文助手 + Markdown

**Codex 任务**：
1. `routes/paper.js`（4 模式，前三流式后一一次性）
2. `cards/PaperCard.jsx`（4 tab + 对应表单 + 结果区 react-markdown）
3. `MessageBubble` 加 react-markdown 渲染
4. 代码块基础样式

**验收**：4 模式都能生成；Markdown 正确渲染；论文语气学术化

### Day 4 · 周二 · 任务规划 + 定时任务 + 甘特图

**A. 任务规划**：
1. `routes/plan.js`（chatJson 返回 tasks）
2. `cards/PlanCard.jsx`：
   - 表单：goal / startDate / deadline / granularity
   - 结果 tab：[时间线 / 甘特图]
   - 时间线：纵向按日期分组
   - 甘特图：CSS Grid，`grid-template-columns: repeat(N, 1fr)`，每任务块 `grid-column: startDay / endDay`，5 类配色

**B. 定时任务**：
1. `services/scheduler.js`：启动时 `initScheduler()` 加载 + `cron.schedule()`
2. 执行器：chat → 写 md → addArtifact → 追加 history（保留最近 20 条）
3. `routes/schedule.js`：CRUD + run + enable/disable
4. `cards/ScheduleCard.jsx`：创建表单 + 已有任务列表
5. 顶部 banner "后端离线时定时任务不会触发"

**验收**：
- `/plan` 生成 5-12 任务，时间线 + 甘特图都正确，颜色按类别区分
- `/schedule` 创建 `* * * * *` 测试任务，等 1 分钟看 history 有记录
- 删除/暂停/手动触发都可用

### Day 5 · 周三 · 打磨 + 收尾 + （可选）Electron

**优先级排序**：
1. UI 打磨（间距 / 阴影 / hover / spinner / 空状态）
2. Toast 错误提示（所有 API 失败都要有中文 toast）
3. README 补齐 + 演示脚本
4. Bug 修
5. **（可选）** Electron 套壳：`electron/main.js` fork server 进程 + loadFile + `electron-builder` 打包 NSIS exe
6. **硬约束**：中午 12 点前 Electron 没搞定就果断放弃，保交 Web 版

---

## 10. 风险与应急预案

| 风险 | 概率 | 应急 |
|---|---|---|
| DeepSeek JSON 输出格式崩 | 高 | 已设计重试 1 次，再失败回退手填 |
| docx/pptxgenjs 中文字体错位 | 中 | 强制 `font: '宋体'` / `微软雅黑`，提前测 |
| node-cron 时区乱 | 低 | 显式传 `timezone: 'Asia/Shanghai'` |
| Tailwind purge 误杀 | 中 | `content` 明确列出所有目录 |
| Day 1 Word 超时 | 中 | Day 2 直接复用 Word 模板做 PPT |
| Day 3 论文助手超时 | 中 | 砍 polish 模式，只留 outline/abstract/section |
| Day 4 甘特图写崩 | 中 | 回退到只做时间线，甘特图 tab 显"即将到来" |
| 全线超时 | 低 | Day 5 砍 Electron，保交 Web 版 |

### 砍功能优先级（从"必须有"到"可砍"）

1. **必须有**：Word、PPT、UI 壳、模型配置 ← Day 0-2
2. **强烈想要**：论文 outline+abstract、产物面板、Markdown ← Day 3
3. **想要**：论文 section+polish、Plan 时间线 ← Day 4 前半
4. **锦上添花**：Plan 甘特图、Schedule 定时任务 ← Day 4 后半
5. **可丢弃**：Electron、主题切换、对话历史持久化到侧边栏 ← Day 5

---

## 11. 开放问题（无阻塞）

- DeepSeek API Key：用户答辩前需自行购买/申请
- docx 库中文字体默认行为：需在 Day 1 实装时验证
- pptxgenjs 渐变背景 API：需在 Day 2 实装时验证
- Electron 内嵌 Express 进程路径问题：若进入 Day 5 Electron 阶段再处理
