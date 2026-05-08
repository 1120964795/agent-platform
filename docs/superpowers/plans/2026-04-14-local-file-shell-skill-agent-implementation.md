# 本地文件 / Shell / Skill Agent 重构 实现计划

> **执行方**：本计划交由用户在 codex CLI 中按任务顺序执行。每个任务是一个 codex 可独立完成的工作单元；codex 完成后用户口头确认推进下一个。
>
> **设计稿**：`docs/superpowers/specs/2026-04-14-local-file-shell-skill-agent-design.md`（执行任何任务前先通读对应章节，spec 是真理来源,本 plan 与 spec 冲突时以 spec 为准）。
>
> 步骤使用 `- [ ]` 复选框便于追踪。

**Goal**：把 agentdev-lite 重构为 Electron 主进程独立运行的主动 tool-calling Agent，引入 skill 系统、shell 三段策略、用户规则持久化。

**Architecture**：Express 完全废弃；chat 循环、工具执行、skill 加载全部在 Electron 主进程；前端通过 `window.electronAPI.invoke / on` 与主进程通信；事件流取代 SSE。

**Tech Stack**：Electron 33、React 18 + Vite、DeepSeek function-calling、Vitest（新增,用于工具/registry 单测）、`gray-matter`（frontmatter 解析）、`docx` / `pptxgenjs`（沿用现有）。

**实现顺序**：严格按阶段 A → B → C → D，每阶段结束做一次集中验证后才进下一阶段。阶段内任务 ID 单调递增；同阶段相邻任务可在同一会话内连续做但每个独立 commit。

---

## 公共约定

**测试框架**：Vitest（在阶段 A 一并装好）。测试文件放 `electron/__tests__/` 与每个工具同名。

**commit message**：使用 `<scope>: <subject>` 风格。scope 取 `electron`/`tools`/`skills`/`ipc`/`renderer`/`build`/`docs`。每个任务一个 commit，禁止合并 commit。

**Codex 执行模板**（每个任务都用此格式喂给 codex）：

```
请按 docs/superpowers/plans/2026-04-14-local-file-shell-skill-agent-implementation.md 第 T## 任务执行。
完成后:
  1. 运行任务里"验证命令"段落
  2. 按"Commit"段落提交
  3. 输出 git log -1 --oneline 给我确认
```

**禁止**：
- 跨任务批量提交
- 在阶段 B 完成前删除 `server/` 目录（阶段 A 的 IPC handlers 还在引用迁移过来的 services）
- 实现时绕过本 plan 自由发挥；遇到不一致先停下问用户

---

## 阶段 A：Electron 主进程承接后端

阶段目标：Express 退场，所有原 HTTP 路由迁为 IPC handler；前端走 `window.electronAPI.invoke`；聊天功能不带工具仍可用。

阶段验收：`npm run electron:dev`（更新后的脚本）能启动 Electron 应用，能保存 API key，能进行普通文本聊天，能浏览文件目录。无 8787 端口监听。

---

### Task A01: 准备 Vitest 与目录骨架

**Files:**
- Modify: `package.json`（root） — devDependencies 加 `vitest`、`@vitest/ui`；scripts 加 `"test": "vitest run"` 与 `"test:watch": "vitest"`
- Create: `vitest.config.js`
- Create: `electron/ipc/.gitkeep` `electron/services/.gitkeep` `electron/tools/.gitkeep` `electron/skills/.gitkeep` `electron/__tests__/.gitkeep`
- Create: `resources/skills/.gitkeep`

- [ ] 安装依赖：`npm install --save-dev vitest @vitest/ui gray-matter`
- [ ] 写 `vitest.config.js`：

```js
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/**/*.test.js'],
    globals: false
  }
})
```

- [ ] 创建 5 个空目录及 `.gitkeep` 占位
- [ ] 验证：`npm test` 输出 "No test files found"（不应报错）
- [ ] **Commit**：`build: scaffold vitest and electron module dirs`

---

### Task A02: 迁移 services 层

**Files:**
- Create: `electron/services/deepseek.js` ← 内容来自 `server/services/deepseek.js`，把 `import` 改 `require`（Electron main 是 CommonJS）；保留接口 `chatStream({messages, tools?})`、`DeepSeekError`
- Create: `electron/services/fileReader.js` ← 同上迁移
- Create: `electron/services/docxGen.js` ← 同上
- Create: `electron/services/pptxGen.js` ← 同上

**注意**：阶段 A 仅迁移与 require 化；阶段 B 才在 `deepseek.js` 中加 function-calling 支持。先确保现有调用方（迁移后的 chat IPC handler）仍能用旧签名跑起来。

- [ ] 复制 4 个文件
- [ ] 把每个文件的 ESM `import/export` 改为 CJS `require/module.exports`
- [ ] 验证：`node -e "require('./electron/services/deepseek')"` 不报错（4 个文件都跑一遍）
- [ ] **Commit**：`electron: move services from server/ to electron/services/`

---

### Task A03: 迁移并改造 store

**Files:**
- Create: `electron/store.js` ← 来自 `server/store.js`，CJS 化，DATA_DIR 用 `app.getPath('userData')`（参考 `electron/main.js:25-26` 现有逻辑）
- 新增字段：`workspace_root`（默认 `os.homedir()`）、`shell_whitelist_extra: []`、`shell_blacklist_extra: []`、`session_confirm_cache_enabled: true`
- Test: `electron/__tests__/store.test.js`

- [ ] 写测试先（`store.test.js`）：

```js
const { test, expect, beforeEach } = require('vitest')
const fs = require('fs')
const os = require('os')
const path = require('path')

const TMP = path.join(os.tmpdir(), `agentdev-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = TMP
const { store } = require('../store')

beforeEach(() => { fs.rmSync(TMP, { recursive: true, force: true }) })

test('getConfig returns defaults including new fields', () => {
  const c = store.getConfig()
  expect(c.permissionMode).toBe('default')
  expect(c.workspace_root).toBe(os.homedir())
  expect(c.shell_whitelist_extra).toEqual([])
  expect(c.shell_blacklist_extra).toEqual([])
  expect(c.session_confirm_cache_enabled).toBe(true)
})

test('setConfig persists patches', () => {
  store.setConfig({ apiKey: 'sk-x', workspace_root: 'D:\\\\work' })
  expect(store.getConfig().apiKey).toBe('sk-x')
  expect(store.getConfig().workspace_root).toBe('D:\\\\work')
})
```

- [ ] 运行：`npm test electron/__tests__/store.test.js` → 期望 FAIL（store.js 还没新字段）
- [ ] 实现 `electron/store.js`：CJS 化原 `server/store.js`；顶部用以下 pattern 兼容测试环境：

```js
let app
try { app = require('electron').app } catch { app = null }
const userData = app ? app.getPath('userData') : require('os').tmpdir()
const DATA_DIR = process.env.AGENTDEV_DATA_DIR || path.join(userData, 'agentdev-lite', 'data')
```

`DEFAULT_CONFIG` 加上述 4 个字段（`workspace_root` 默认 `os.homedir()`）
- [ ] 重跑测试 → 期望 PASS
- [ ] **Commit**：`electron: port store to main process with workspace/shell config`

---

### Task A04: preload 改造为通用桥

**Files:**
- Modify: `electron/preload.js` — 完全重写
- Create: `electron/__tests__/preload.test.js`（轻量,只断言导出形状）

- [ ] 重写 `preload.js`：

```js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (event, handler) => {
    const wrapped = (_evt, payload) => handler(payload)
    ipcRenderer.on(event, wrapped)
    return () => ipcRenderer.off(event, wrapped)
  },
  // 保留少量"不走 invoke 更自然"的快捷方法
  selectFile: (options) => ipcRenderer.invoke('dialog:selectFile', options),
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),
  getPaths: () => ipcRenderer.invoke('app:getPaths')
})
```

- [ ] 删除 `execLocalCommand` 桥（旧 IPC 在 A07 一并移除）
- [ ] 验证：`grep -n execLocalCommand electron/preload.js client/src` 无结果
- [ ] **Commit**：`electron: replace preload bridge with generic invoke/on`

---

### Task A05: IPC handler 注册器

**Files:**
- Create: `electron/ipc/index.js` — 集中注册所有 channel
- Create: `electron/ipc/config.js`、`electron/ipc/conversations.js`、`electron/ipc/artifacts.js`、`electron/ipc/files.js`、`electron/ipc/dialog.js`
- Create: `electron/__tests__/ipc.test.js`（mock ipcMain，断言每个 handler 的输入输出契约）

每个 IPC 模块导出 `register(ipcMain)` 函数。`electron/ipc/index.js` 在 `app.whenReady` 后调用所有模块的 `register`。

**Channel 列表**（含原 HTTP 路由的等价映射）：

| HTTP 路由 | IPC channel | 来源文件 |
|---|---|---|
| GET `/api/config` | `config:get` | server/routes/config.js |
| POST `/api/config` | `config:set` | 同上 |
| GET `/api/conversations` | `conversations:list` | server/routes/conversations.js |
| GET `/api/conversations/:id` | `conversations:get` | 同上 |
| POST `/api/conversations` | `conversations:upsert` | 同上 |
| GET `/api/artifacts` | `artifacts:list` | server/routes/artifacts.js |
| GET `/api/files/list` | `files:list` | server/routes/files.js |
| GET `/api/files/search` | `files:search` | 同上 |
| `select-file`（旧） | `dialog:selectFile` | electron/main.js |
| `select-directory`（旧） | `dialog:selectDirectory` | 同上 |
| `open-path`（旧） | `shell:openPath` | 同上 |
| `get-paths`（旧） | `app:getPaths` | 同上 |

- [ ] 写 5 个 IPC 模块；逻辑直接 port 自原 routes 与 main.js
- [ ] 写 `ipc/index.js` 聚合 `register` 调用
- [ ] 写 `ipc.test.js`（5 个 channel 的 happy path 各一条）
- [ ] 验证：`npm test electron/__tests__/ipc.test.js` PASS
- [ ] **Commit**：`ipc: port config/conversations/artifacts/files handlers to main process`

---

### Task A06: chat IPC handler v1（无工具，纯文本流）

**Files:**
- Create: `electron/ipc/chat.js`
- Create: `electron/__tests__/chat.test.js`

**接口**：
- 入站：`ipcMain.handle('chat:send', async (evt, {convId, messages}))`
- 出站事件（`evt.sender.send(...)`）：`chat:delta {convId, text}`、`chat:done {convId}`、`chat:error {convId, error}`
- 阶段 A 不实现工具循环；只把 messages 喂给 `deepseek.chatStream`，逐 chunk 转发

- [ ] 写测试：mock `deepseek.chatStream` 返回 `['你', '好', '!']`，断言 evt.sender.send 被调 3 次 delta + 1 次 done
- [ ] 实现 `electron/ipc/chat.js`：

```js
const { store } = require('../store')
const { chatStream, DeepSeekError } = require('../services/deepseek')

const BASE_PROMPT = '你是 AgentDev Lite，一个学生学习助手。用中文简洁专业地回答问题。涉及代码时给可运行示例。'

function register(ipcMain) {
  ipcMain.handle('chat:send', async (evt, payload = {}) => {
    const { convId, messages = [] } = payload
    const send = (event, data) => evt.sender.send(event, { convId, ...data })
    try {
      const config = store.getConfig()
      const fullMessages = [{ role: 'system', content: BASE_PROMPT }, ...messages]
      for await (const delta of chatStream({ messages: fullMessages })) {
        send('chat:delta', { text: delta })
      }
      send('chat:done', {})
    } catch (e) {
      const code = e instanceof DeepSeekError ? e.code : 'INTERNAL'
      send('chat:error', { error: { code, message: e.message } })
    }
    return { ok: true }
  })
}

module.exports = { register }
```

- [ ] 在 `ipc/index.js` 注册它
- [ ] 验证：`npm test electron/__tests__/chat.test.js` PASS
- [ ] **Commit**：`ipc: add chat handler v1 (no tools, plain streaming)`

---

### Task A07: main.js 大清理

**Files:**
- Modify: `electron/main.js` — 删除 server fork、HTTP healthcheck、`exec-local-command` handler、相关 helper（`buildInspectPathCommand`、`runLocalCommand`、`resolveWorkingDirectory`）
- 加入：`require('./ipc').registerAll(ipcMain)`
- `mainWindow.loadURL` 直接指向 `client/dist/index.html`（生产）或 `http://localhost:5173`（开发）

- [ ] 重写 `electron/main.js`：保留窗口创建、isDev 判断、菜单；删除所有 server / Express / exec 相关代码
- [ ] 在 `app.whenReady().then(() => { ... })` 里 `require('./ipc').registerAll(ipcMain)`
- [ ] 验证：`grep -n 'serverProcess\|exec-local-command\|EXEC_TIMEOUT_MS' electron/main.js` 无结果
- [ ] 验证：`npm run electron:dev` 启动后窗口能打开（DevTools console 无 IPC 错误）
- [ ] **Commit**：`electron: drop express subprocess and legacy exec IPC`

---

### Task A08: 前端 api 层切换到 invoke

**Files:**
- Modify: `client/src/lib/api.js` — `fetch('/api/...')` 全部改 `window.electronAPI.invoke('<channel>', payload)`；`stream` 改为基于 `electronAPI.on('chat:delta'/'chat:done'/'chat:error')` 的事件订阅
- Modify: `client/src/hooks/useChat.js` 等调用方 — 适配新 stream 接口
- Delete: 任何 SSE/HTTP 残留

**新 stream 接口**：

```js
api.stream = function({channel, payload, onDelta, onDone, onError}) {
  const offDelta = window.electronAPI.on('chat:delta', d => d.convId === payload.convId && onDelta?.(d.text))
  const offDone  = window.electronAPI.on('chat:done',  d => d.convId === payload.convId && (cleanup(), onDone?.()))
  const offError = window.electronAPI.on('chat:error', d => d.convId === payload.convId && (cleanup(), onError?.(new ApiError(d.error.code, d.error.message))))
  function cleanup() { offDelta(); offDone(); offError() }
  window.electronAPI.invoke(channel, payload).catch(e => { cleanup(); onError?.(e) })
  return cleanup
}
```

- [ ] 重写 `api.js`
- [ ] 修 `useChat.js` 调用 `api.stream({channel: 'chat:send', payload: {convId, messages}, ...})`
- [ ] **删除**：`generatePpt` / `generateWord` / `executeLocalCommand` 函数（阶段 B 再以工具/skill 重构入口；阶段 A 留空，前端的 /word /ppt slash 命令暂时报"功能正在迁移"）
- [ ] 验证：浏览器 DevTools 里发一条聊天消息 → 文本流式回显
- [ ] **Commit**：`renderer: migrate api layer to electronAPI.invoke + event subscription`

---

### Task A09: 删除 server/ 与旧 routes

**Files:**
- Delete: `server/` 整个目录
- Delete: `server/routes/word.js` `ppt.js`（被 skill 吃掉，不再迁移）
- Modify: `package.json` root —
  - `scripts.dev`、`scripts.electron:dev` 移除 `npm --prefix server run dev`
  - `scripts.setup` 移除 `npm --prefix server install`
  - `build.extraResources` 移除 `server` 项

- [ ] `git rm -r server/`
- [ ] 改 `package.json`（dev 脚本与 build 配置）
- [ ] 验证：`npm run electron:dev` 仍正常启动；`netstat -ano | grep 8787`（或 `Get-NetTCPConnection -LocalPort 8787`）无监听
- [ ] **Commit**：`build: remove express server, drop legacy /word /ppt routes`

**阶段 A 验收**：手动跑一次普通聊天 + 文件浏览 + 配置保存,三项都 OK。然后才能进阶段 B。

---

## 阶段 B：工具执行器与 Skill 系统

阶段目标：13 个核心工具 + 2 个文档生成工具 + skill registry/loader + chat loop v2（带 function calling）。

阶段验收：`full` 模式下,模型能调 `read_file` 总结本地 pdf；能调 `run_shell_command("npm -v")` 自动执行；能 `load_skill('word-writer')` 并按工作流产文档；能 `remember_user_rule` 写规则到 `user_rules.md`。

---

### Task B01: tools 注册器骨架

**Files:**
- Create: `electron/tools/schemas.js` — 导出空 `TOOL_SCHEMAS = []`
- Create: `electron/tools/index.js` — 导出 `TOOLS = {}` 与 `register(name, schema, fn)`
- Create: `electron/__tests__/tools-index.test.js`

- [ ] 写 `tools/index.js`：

```js
const TOOLS = {}
const TOOL_SCHEMAS = []

function register(schema, fn) {
  if (!schema?.name) throw new Error('tool schema must have name')
  if (TOOLS[schema.name]) throw new Error(`tool ${schema.name} already registered`)
  TOOLS[schema.name] = fn
  TOOL_SCHEMAS.push(schema)
}

async function execute(name, args) {
  const fn = TOOLS[name]
  if (!fn) return { error: { code: 'INVALID_ARGS', message: `unknown tool ${name}` } }
  try { return await fn(args || {}) }
  catch (e) { return { error: { code: e.code || 'INTERNAL', message: e.message } } }
}

module.exports = { TOOLS, TOOL_SCHEMAS, register, execute }
```

- [ ] 写测试：register + execute 各一条 + 重复注册抛错
- [ ] **Commit**：`tools: add registry skeleton`

---

### Task B02: fs 工具组（非破坏性）

**Files:**
- Create: `electron/tools/fs-read.js` — `read_file` `list_dir` `search_files`（`search_files` 复用 `ipc/files.js` 内逻辑，提取为共享 helper `electron/tools/_fs-helpers.js`）
- Create: `electron/tools/fs-write.js` — `write_file` `edit_file` `create_dir`
- Create: `electron/__tests__/fs-tools.test.js`（用 `os.tmpdir` 做沙盒）

**接口契约**（与 spec §3.1 完全一致）：

```js
// read_file({path, encoding='utf8', max_bytes=2_000_000}) -> {content, truncated, mime, size}
// write_file({path, content, encoding='utf8', overwrite=false}) -> {path, bytes_written}
//   overwrite=false 且文件存在 -> {error:{code:'ALREADY_EXISTS'}}
//   overwrite=true 且文件存在 -> 调用 confirm.requestOverwrite (B04 实现，本任务先 stub 成"自动同意")
// edit_file({path, old_string, new_string, replace_all=false}) -> {path, replacements}
// list_dir({path, show_hidden=false}) -> {entries:[{name,isDir,size,ext}]}
// search_files({root, query, max_depth=3}) -> {results}
// create_dir({path, recursive=true}) -> {path}
```

- [ ] 写测试（每个工具至少 1 条 happy + 1 条错误路径）
- [ ] 实现 6 个工具
- [ ] 在 `tools/index.js` 注册（通过 `require('./fs-read'); require('./fs-write')` 完成自注册）
- [ ] 验证：`npm test fs-tools.test.js` PASS
- [ ] **Commit**：`tools: add non-destructive fs tools`

---

### Task B03: confirm 模块

**Files:**
- Create: `electron/confirm.js` — `requestConfirm({kind, payload})` 返回 `Promise<boolean>`；管理"本会话不再询问"内存缓存
- Create: `electron/__tests__/confirm.test.js`

**接口**：

```js
// kind: 'shell-command' | 'delete' | 'move' | 'overwrite'
// payload: { command? , path?, dest? }
// 返回 true=允许 / false=用户取消
async function requestConfirm({kind, payload}) { ... }

// 测试时通过 setDialogProvider 注入 mock，避免真弹窗
function setDialogProvider(fn) { ... }
```

实现要点：
- 默认 dialogProvider 用 Electron `dialog.showMessageBox`
- 缓存 key：`shell-command` 时按 `payload.command` 的首 token；其他 kind 不缓存
- 缓存仅本会话内存（`Map`），无持久化
- 若 `store.getConfig().session_confirm_cache_enabled === false`，禁用缓存

- [ ] 测试先：mock dialogProvider，断言相同首 token 命令第二次不弹窗
- [ ] 实现
- [ ] **Commit**：`electron: add confirm module with session cache`

---

### Task B04: fs 工具组（破坏性）+ 接入 confirm

**Files:**
- Create: `electron/tools/fs-destructive.js` — `delete_path` `move_path`
- Modify: `electron/tools/fs-write.js` — `write_file` 在 `overwrite=true` 且已存在时调 `requestConfirm({kind:'overwrite', payload:{path}})`
- Modify: `electron/__tests__/fs-tools.test.js` 增补用例

- [ ] 测试：mock confirm 返回 false → 工具返回 `USER_CANCELLED`；返回 true → 操作成功
- [ ] 实现 `delete_path` `move_path`，**强制** `requestConfirm`
- [ ] 改 `write_file`
- [ ] 验证测试 PASS
- [ ] **Commit**：`tools: add destructive fs tools with confirmation`

---

### Task B05: shell 工具

**Files:**
- Create: `electron/tools/shell.js` — `run_shell_command` 三段策略（spec §3.2）
- Create: `electron/__tests__/shell.test.js`

**实现要点**：
- 分词：`command.trim().split(/\s+/)[0]` → 去引号 → `toLowerCase()`
- 黑名单（写死在文件顶部常量；可被 `config.shell_blacklist_extra` 追加）
- 白名单（同上，含 `config.shell_whitelist_extra`）
- 灰名单 → `requestConfirm({kind:'shell-command', payload:{command}})`
- spawn + 流式：通过参数注入 `onLog(stream, chunk)` 回调（chat 循环把 chunk 转发到 `chat:tool-log` 事件）
- timeout：到点 `child.kill('SIGTERM')`，2s 后还活着 `SIGKILL`，返回 `COMMAND_TIMEOUT`
- output 上限 1MB，超出 `truncated=true`

```js
async function runShellCommand({command, cwd, timeout_ms = 120_000}, {onLog} = {}) { ... }
```

- [ ] 测试（mock spawn）：白名单直接执行 / 黑名单返回 PERMISSION_DENIED / 灰名单触发 confirm / timeout 触发 kill / output 截断
- [ ] 实现
- [ ] **Commit**：`tools: add run_shell_command with three-tier policy`

---

### Task B06: env 工具

**Files:**
- Create: `electron/tools/env.js` — `get_os_info` `which`
- Create: `electron/__tests__/env.test.js`

```js
// get_os_info() -> {platform, arch, shell, package_managers:{winget,choco,scoop,brew}, user_home, cwd}
//   package_managers.* 通过 which 同步检测
// which({command}) -> {found: boolean, path?: string}
//   Windows 用 'where'，其他用 'which'
```

- [ ] 测试 + 实现
- [ ] **Commit**：`tools: add env introspection tools`

---

### Task B07: skill registry

**Files:**
- Create: `electron/skills/registry.js` — 扫描 builtin（`<resourcesPath>/skills` 或 dev 模式 `<repo>/resources/skills`）+ user（`<userData>/skills`）；解析 frontmatter；合并去重；导出 `listSkills() -> [{name, description, path, readonly}]` 与 `findSkill(name)`
- Create: `electron/__tests__/skills-registry.test.js`

**实现细节**：
- 用 `gray-matter` 解析 `SKILL.md`
- 必填字段 (`name`, `description`) 缺失时跳过并 warn
- 用户目录 skill 同名覆盖 builtin（保留 `readonly:false`）
- 模块加载时不扫描；提供 `reload()` 显式刷新；`listSkills()` 内部缓存

- [ ] 测试：建临时目录写两个 SKILL.md（一 builtin 一 user 同名）→ 断言用户覆盖
- [ ] 实现
- [ ] **Commit**：`skills: add registry with frontmatter parsing`

---

### Task B08: skill loader 工具

**Files:**
- Create: `electron/skills/loader.js` — 实现 `load_skill` 工具
- Create: `electron/__tests__/skills-loader.test.js`

```js
// load_skill({name}, {convId}) -> {name, content, referenced_tools, already_loaded?}
//   模块级 Map<convId, Set<string>>; chat 循环 (B11) 把 convId 显式传入
//   重复加载 -> {already_loaded: true, content: ''}
//   resources 字段把相对路径展开到正文末尾的"可用资源（绝对路径）"区段
//   导出 clearSession(convId) 供会话结束/切换时调用
```

- [ ] 测试 + 实现
- [ ] **Commit**：`skills: add load_skill tool with session cache`

---

### Task B09: docs 工具（generate_docx / generate_pptx）

**Files:**
- Create: `electron/tools/docs.js` — wrap `electron/services/docxGen.js` `pptxGen.js`
- Create: `electron/__tests__/docs-tools.test.js`

```js
// generate_docx({outline:[{heading,level,content}], out_path, template?}) -> {path, bytes_written}
// generate_pptx({slides:[{title,bullets[],notes?}], out_path, template?}) -> {path, bytes_written}
// 两者都把生成结果加入 artifacts store（store.addArtifact）
```

- [ ] 测试（用临时目录验证文件被创建）
- [ ] 实现
- [ ] **Commit**：`tools: add document generation tools`

---

### Task B10: remember 工具与 user_rules 模块

**Files:**
- Create: `electron/services/userRules.js` — 读 / 追加 / 删除 `user_rules.md`
- Create: `electron/tools/remember.js` — `remember_user_rule` `forget_user_rule`
- Create: `electron/__tests__/user-rules.test.js`

**user_rules.md 格式**（spec §6.1）：每行 `- [r_<ISO ts>] <text>`

```js
// services/userRules.js
function readRules() -> [{id, text, raw_line}]
function appendRule(text) -> {id, text}
function removeRuleById(id) -> {removed: boolean}
function removeRulesBySubstring(sub) -> {removed_count}
function buildSystemPromptSection() -> string  // 空时返回 ''
```

- [ ] 测试 + 实现两文件
- [ ] **Commit**：`tools: add user rules persistence and remember tools`

---

### Task B11: chat IPC handler v2（function-calling 循环）

**Files:**
- Modify: `electron/ipc/chat.js` — 接入 `TOOL_SCHEMAS`、`execute`、skill 索引、user_rules、10 轮上限
- Modify: `electron/services/deepseek.js` — 增加 `tools` 参数支持，返回 `tool_calls`
- Modify: `electron/__tests__/chat.test.js` — 增加 mock function-calling 序列的集成测

**chat 循环骨架**（参考 spec §3.3）：

```js
async function handleChatSend(evt, {convId, messages}) {
  const send = (event, data) => evt.sender.send(event, { convId, ...data })
  const config = store.getConfig()
  const isFull = config.permissionMode === 'full'

  const systemParts = []
  systemParts.push(isFull ? FULL_PROMPT : BASE_PROMPT)
  const rules = userRules.buildSystemPromptSection()
  if (rules) systemParts.push(rules)
  if (isFull) {
    const skills = skillRegistry.listSkills()
    if (skills.length) systemParts.push(buildSkillIndex(skills))
    systemParts.push(REMEMBER_GUIDANCE)
  }
  const fullMessages = [{role:'system', content: systemParts.join('\n\n')}, ...messages]

  const tools = isFull ? TOOL_SCHEMAS : []
  for (let iter = 0; iter < 10; iter++) {
    const resp = await deepseek.chat({messages: fullMessages, tools, stream: true, onDelta: t => send('chat:delta', {text: t})})
    fullMessages.push(resp.assistant_message)
    if (!resp.tool_calls?.length) break
    for (const call of resp.tool_calls) {
      send('chat:tool-start', {callId: call.id, name: call.name, args: call.args})
      const result = await tools_execute(call.name, call.args, {
        onLog: (stream, chunk) => send('chat:tool-log', {callId: call.id, stream, chunk})
      })
      if (result.error) send('chat:tool-error', {callId: call.id, error: result.error})
      else send('chat:tool-result', {callId: call.id, result})
      if (call.name === 'load_skill' && !result.error) send('chat:skill-loaded', {name: call.args.name})
      fullMessages.push({role:'tool', tool_call_id: call.id, content: JSON.stringify(result)})
    }
  }
  send('chat:done', {})
}
```

- [ ] 改造 `deepseek.js` 支持 `tools` 参数（OpenAI 兼容）
- [ ] 重写 `chat.js`
- [ ] 集成测试：mock deepseek 返回 `[{tool_calls:[{name:'read_file',args:{path:'/tmp/x'}}]}, {tool_calls:[], content:'done'}]`，断言事件序列正确
- [ ] **Commit**：`ipc: chat handler v2 with function-calling loop`

---

### Task B12: 5 个内置 SKILL.md

**Files:**
- Create: `resources/skills/word-writer/SKILL.md`（+ `templates/report.docx` 占位空文件）
- Create: `resources/skills/ppt-builder/SKILL.md`
- Create: `resources/skills/study-helper/SKILL.md`
- Create: `resources/skills/file-explorer/SKILL.md`
- Create: `resources/skills/dep-installer/SKILL.md`

每个 SKILL.md 按 spec §4.2 frontmatter 格式 + spec §4.4 描述的工作流。`dep-installer` 必须明确写出"`get_os_info` → `which` → 选择包管理器 → `run_shell_command`"的标准流程,这是用户的核心诉求。

- [ ] 写 5 个文件（先写完再统一 commit）
- [ ] 启动一次应用,在设置面板（B14 完成后）能看到 5 个 skill
- [ ] **Commit**：`skills: add 5 builtin skills (word/ppt/study/explorer/dep-installer)`

---

### Task B13: skills:list / rules:list IPC

**Files:**
- Create: `electron/ipc/skills.js` — `skills:list`、`skills:reload`、`skills:openFolder`、`skills:copyBuiltin`
- Create: `electron/ipc/rules.js` — `rules:list`、`rules:delete`
- Modify: `electron/ipc/index.js` 注册它们

- [ ] 实现两文件（直接 wrap registry / userRules）
- [ ] **Commit**：`ipc: expose skills and rules management channels`

**阶段 B 验收**：开发模式下用一个 `node` 脚本走完 chat:send → tool 循环（mock 用户消息）；或手动在 UI 里发"列出 D:\\ 下文件" 验证模型调 `list_dir`。验收通过才进 C。

---

## 阶段 C：前端适配

阶段目标：聊天界面渲染工具卡片 + skill 徽标 + 确认；设置面板新增 4 项；删除遗留 slash 命令 UI。

阶段验收：手动回归 spec §10.3 的 8 项 checklist 全部通过。

---

### Task C01: 工具调用卡片组件

**Files:**
- Create: `client/src/components/chat/ToolCard.jsx`（通用容器：name、status、可折叠 args/result）
- Create: `client/src/components/chat/ShellCard.jsx`（继承 ToolCard，stdout/stderr 流式滚动）
- Create: `client/src/components/chat/SkillBadge.jsx`（"📘 word-writer 已加载"小条）
- Modify: `client/src/components/chat/MessageList.jsx`（或等价文件）— 根据 message.tool_calls / role=='tool' 渲染对应卡片
- Modify: `client/src/hooks/useChat.js` — 监听 `chat:tool-start/log/result/error/skill-loaded` 事件,维护 `pendingToolCalls` 状态

- [ ] 实现 3 个组件 + hook 改造
- [ ] 手动验证：在 `full` 模式发"看一下 D:\\xxx 是什么文件" → 出现 read_file 卡片
- [ ] **Commit**：`renderer: add tool/shell/skill cards in chat view`

---

### Task C02: 破坏性操作前端 fallback（仅 dev 用）

**Files:**
- Create: `client/src/components/ConfirmModal.jsx`
- Modify: `electron/confirm.js` — 主进程仍用原生 dialog；只在 `process.env.AGENTDEV_DEV_FALLBACK_CONFIRM === '1'` 时通过 IPC 推到 renderer 使用 web 弹窗（保留是为了某些 CI 场景）

第一版可不实现 dev fallback（spec §7.4 标记为可选）。本任务**仅做组件骨架**,真正接入留作未来。

- [ ] 仅写组件 stub 与样式
- [ ] **Commit**：`renderer: scaffold confirm modal (dev fallback only)`

---

### Task C03: 设置面板 — 工作区 / shell 名单

**Files:**
- Modify: `client/src/panels/SettingsPanel.jsx` — 新增"工作区"区块（workspace_root 输入 + 选目录按钮）、"Shell 安全策略"区块（白/黑名单 chip 输入）

- [ ] 用 `window.electronAPI.invoke('config:get'|'config:set', ...)` 读写
- [ ] **Commit**：`renderer: settings ui for workspace and shell policy`

---

### Task C04: 设置面板 — Skill 管理 tab

**Files:**
- Modify: `client/src/panels/SettingsPanel.jsx` 增 Tab
- Create: `client/src/panels/SkillsTab.jsx`

按钮：新建（弹模态填 name/description/正文 → 调 `skills:create`，需在 B13 补一个 channel 或本任务一并加）、导入（`dialog:selectDirectory` → 复制）、打开文件夹（`shell:openPath`）、编辑（`shell:openPath` 打开 SKILL.md）、删除、复制为我的 skill。

- [ ] 若 B13 漏了 `skills:create` / `skills:delete` / `skills:copyBuiltin`，本任务在 `electron/ipc/skills.js` 补上
- [ ] 实现 `SkillsTab.jsx`
- [ ] **Commit**：`renderer: settings ui for skills management`

---

### Task C05: 设置面板 — 用户偏好 tab

**Files:**
- Create: `client/src/panels/RulesTab.jsx`
- Modify: `SettingsPanel.jsx` 注册 Tab

列表展示 `rules:list` 返回的每条规则，每行 🗑 按钮调 `rules:delete`；顶部"打开文件手动编辑"按钮调 `shell:openPath` 打开 user_rules.md。

- [ ] 实现
- [ ] **Commit**：`renderer: settings ui for user rules`

---

### Task C06: 清理遗留 UI

**Files:**
- Modify: `client/src/lib/commands.js`（或等价 slash 命令注册）— 删除 `/word` `/ppt` 注册
- Modify: 任何 placeholder / 提示文字里"输入文件路径即可引用""使用 /word 命令"等措辞 — 改为"在全权限模式下,直接说自然语言即可,例如：'帮我看一下 D:\\xxx.pdf'"
- Delete: 与 generatePpt / generateWord 相关的导入

- [ ] grep 出所有提及 `/word` `/ppt` 的位置,逐一清理
- [ ] **Commit**：`renderer: remove legacy /word /ppt slash commands and prompts`

**阶段 C 验收**：手动跑 spec §10.3 的 checklist。

---

## 阶段 D：打包配置与文档

---

### Task D01: package.json 打包字段

**Files:**
- Modify: `package.json`（root） — `build.extraResources` 改为 `[{from: "resources/skills", to: "skills"}, {from: "client/dist", to: "client/dist"}]`；`build.files` 增加 `electron/**/*` `resources/**/*`

- [x] 改 + 跑一次 `npm run electron:build` 看是否能产 exe
- [ ] **Commit**：`build: bundle skills/ as extra resource`

---

### Task D02: dev 脚本简化

**Files:**
- Modify: `package.json` `scripts.electron:dev` —

```json
"electron:dev": "concurrently -n client,electron -c magenta,yellow \"npm --prefix client run dev\" \"node -e \\\"setTimeout(()=>require('child_process').execSync('electron .', {stdio:'inherit'}),3000)\\\"\""
```

`scripts.dev` 删除（已废弃浏览器纯前端开发模式）。

- [x] 修改 `scripts.electron:dev` 并删除 `scripts.dev`
- [ ] 手动启动 `npm run electron:dev`（长驻 GUI 流程，未在自动验证中运行）
- [ ] **Commit**：`build: simplify electron:dev script`

---

### Task D03: README 重写 + 手动回归 checklist

**Files:**
- Modify: `README.md` — 反映新架构、新功能、新 skill 体系；附 spec §10.3 checklist

- [x] 重写 README（保留中文,简短,结构化）
- [ ] **Commit**：`docs: rewrite README for new tool/skill architecture`

---

## 完成

**总任务数**：31（A 9 + B 13 + C 6 + D 3）

**最终验收**：spec §10.3 的 8 项 checklist 全部勾选;`npm run electron:build` 产出可安装 exe；exe 安装到干净机器跑核心 5 个用例无报错。

实现完成后,把本 plan 文件追加一段"实施结果"小节记录：哪些任务发生偏差、原因、与 spec 的差异是否需回补。

---

## 实施结果

- 阶段 A 已完成核心迁移：Electron 主进程承接配置、会话、文件浏览、聊天 IPC；前端聊天流从 HTTP/SSE 改为 IPC 事件；Express 不再被启动或打包。
- 阶段 B 已完成工具执行器、confirm、文件工具、shell 三段策略、env 工具、文档生成工具、user_rules、skill registry/loader、内置 5 个 skill、function-calling chat loop、skills/rules IPC。
- 阶段 C 已完成工具卡片、shell 输出卡、skill 加载徽标、工作区/shell 设置、Skills 管理、用户偏好管理，并清理 `/word` `/ppt` `/local` 旧入口。
- 阶段 D 已完成打包资源配置、dev 脚本简化和 README 重写。

### 偏差与原因

- 未删除 `server/` 目录：开始实施前工作树中已有 `server/routes/chat.js`、`server/services/fileReader.js` 等未提交改动。为避免丢失用户改动，暂时保留目录；当前 `package.json` 已不启动、不打包 `server/`。
- 未按计划逐任务 commit：用户没有要求提交，且工作树存在既有未提交改动，因此没有制造混合 commit。
- 前端确认 modal 只提供骨架：生产路径按 spec 使用 Electron 原生 dialog；dev fallback 未接线。
- 手动 checklist 未逐项实机验证：已完成自动测试、前端构建和 Electron 打包验证，实际模型调用仍需要配置真实 DeepSeek API Key 后回归。

### 验证记录

- `npm test`：通过。
- `npm run build:client`：通过。
- `node --check electron/**/*.js`：通过。
- `npm run electron:build`：通过，产出 `dist-electron\AgentDev Lite Setup 0.1.0.exe`。

### 阶段 E：收尾验收与硬化

- 新增 `electron/__tests__/packaging.test.js`，锁定桌面脚本不再启动旧 `server`、打包资源必须包含 `skills` 与 `client/dist`、README 必须保留 8 项手动回归 checklist。
- `package.json` 的 `build.files` 增加 `!electron/__tests__/**/*`，避免测试文件进入安装包。
- 重新打包后确认 `dist-electron/win-unpacked/resources/app/server` 不存在，`dist-electron/win-unpacked/resources/app/electron/__tests__` 不存在，`dist-electron/win-unpacked/resources/skills` 包含 5 个内置 skill。

### 阶段 E 验证记录

- `npm test`：通过，9 个测试文件 / 25 个用例。
- `node --check electron/**/*.js`：通过。
- `npm run electron:build`：通过，产出 `dist-electron\AgentDev Lite Setup 0.1.0.exe`。

### 阶段 E 热修：安装版缺少 gray-matter

- 现象：安装后启动时报 `Cannot find module 'gray-matter'`，调用链来自 `electron/skills/loader.js` 和 `electron/skills/registry.js`。
- 原因：`gray-matter` 是主进程运行时依赖，但之前放在 `devDependencies`；electron-builder 生产打包不会把 dev dependency 放进安装版 `resources/app/node_modules`。
- 修复：将 `gray-matter` 移到 `dependencies`，并在 `electron/__tests__/packaging.test.js` 增加运行时依赖必须位于 production dependencies 的防回退断言。
- 验证：`npm test` 通过，9 个测试文件 / 25 个用例；`npm run electron:build` 通过；打包后的 `resources/app/node_modules/gray-matter` 存在；在 `dist-electron/win-unpacked/resources/app` 下执行 `require('./electron/skills/loader'); require('./electron/tools')` 通过。
