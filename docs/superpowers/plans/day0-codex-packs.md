# Day 0 · Codex Prompt Packs

> 把每个 Pack 完整复制粘贴给 codex，让它从头跑到尾。每个 Pack 末尾都有"停止 + 汇报"指令，codex 跑完会停下来让你确认，再开下一个 Pack。
>
> **重要前提**：所有 Pack 都假设 codex 在 `D:\claude project\agentdev-lite\` 目录下工作，并且能读取本仓库里的 plan 文件。

---

## 通用前缀（每个 Pack 都默认遵守）

- 工作目录固定为 `D:\claude project\agentdev-lite\`。第一次进入前先 `cd "D:/claude project/agentdev-lite"`。
- 所有代码以 plan 文件为准：`docs/superpowers/plans/2026-04-10-agentdev-lite.md`。**不要自由发挥**：遇到不确定时，**完整照抄 plan 里的代码块**，不要简化、不要改命名、不要补功能。
- 每个 step 跑完都要验证（运行命令 / 看输出），失败就停下报错，**不要硬撑往下走**。
- 每个 Pack 结束时执行 `git status` + `git log --oneline -5`，把这两个命令的输出贴出来，然后**停下等用户确认**再开下一 Pack。
- Windows 路径里有空格，shell 命令里所有路径都加双引号。
- 不要安装 plan 没列出的依赖。

---

# Pack A · 仓库 + 三个 package.json（Tasks 0.1 – 0.3）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 0 Pack A。

请打开并阅读这个 plan 文件的指定区段：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 0.1（创建项目目录 + git init）
- Task 0.2（根 package.json）
- Task 0.3（Server 骨架 + package.json）

执行规则：
1. 严格按照 plan 里每个 Task 下面的 Step 顺序执行。
2. 每个 Step 里贴的代码块、命令、文件路径，**完整照搬**，不要改字段顺序、不要改依赖版本、不要加注释。
3. 用 Write 工具创建文件。运行命令用 bash。
4. 每个 Task 末尾的 git commit 命令必须执行，commit message 完整照抄。
5. 不要触碰 client/ 目录，client 在 Pack C 才创建。

完成后必须验证：
- 目录结构里存在：.git/、.gitignore、README.md、package.json、server/package.json、server/index.js、server/.env.example
- 跑 `npm run setup`，无报错，client/ 安装那一段会失败因为 client/package.json 不存在——这是预期的，跳过即可，但 root + server 必须装成功。如果 setup 因为 client 缺失整个失败，把命令改成只跑 root + server：
    npm install
    npm --prefix server install
- 跑 `npm --prefix server run dev`，看到 "AgentDev server listening on http://localhost:8787" 字样后立刻 Ctrl+C 停掉。
- 跑 `git log --oneline`，应该有 3 个 commit。

最后停下来：
1. 输出 `git status` 和 `git log --oneline -5`
2. 输出最终目录树（用 `find . -type f -not -path "./node_modules/*" -not -path "./.git/*"` 或类似命令）
3. 等用户确认后再继续，**不要自动开 Pack B**。
````

---

# Pack B · 后端核心（Tasks 0.4 – 0.8）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 0 Pack B。

前置：Pack A 已完成，仓库里已经有 server/index.js（占位版）、server/package.json、根 package.json、git 仓库已初始化。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务，**严格按顺序**：
- Task 0.4（Server - store.js 持久化层）
- Task 0.5（Server - services/deepseek.js LLM 客户端）
- Task 0.6（Server - routes/config.js）
- Task 0.7（Server - routes/chat.js 流式 SSE）
- Task 0.8（Server - index.js 挂路由，会**覆盖** Pack A 里写的占位 index.js）

执行规则：
1. 每个 Task 的 Step 顺序执行，代码完整照搬 plan，**不要简化任何函数**，特别是 deepseek.js 里的 chatStream / parseJsonStrict / chatJson。
2. 每个 Task 末尾的 git commit 必须执行。
3. 如果 plan 里的代码引用了其它文件（比如 routes/chat.js 引用 services/deepseek.js），用相对路径，照搬 import 语句。
4. 数据目录：plan 里的 store.js 会自动创建 data/ 目录，不要手动建。
5. **不要修改 plan 里的任何 prompt 文本**（中文系统提示词原样保留）。

完成后必须验证：
- 启动后端：`npm --prefix server run dev`
- 在另一个终端跑：
    curl http://localhost:8787/api/health
  应该返回 `{"ok":true}` 或 plan 里 health 接口返回的内容。
- 跑：
    curl http://localhost:8787/api/config
  应该返回 JSON，apiKey 字段被 mask 成 "***" 或空字符串。
- 跑（不需要真 key，只验证路由通）：
    curl -X POST http://localhost:8787/api/config -H "Content-Type: application/json" -d "{\"apiKey\":\"sk-test\",\"model\":\"deepseek-chat\"}"
  应该返回 ok。
- 关闭后端（Ctrl+C）。
- 跑 `git log --oneline`，应该比 Pack A 多 5 个 commit。

最后停下来：
1. 输出上面所有 curl 命令的实际响应
2. 输出 `git status` 和 `git log --oneline -10`
3. 等用户确认后再继续，**不要自动开 Pack C**。
````

---

# Pack C · 前端 Scaffold（Tasks 0.9 – 0.12）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 0 Pack C。

前置：Pack A + B 已完成，server/ 目录可独立运行。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 0.9（Client 骨架 + Vite 初始化）
- Task 0.10（Tailwind + PostCSS + theme.css）
- Task 0.11（main.jsx + App.jsx 最小渲染）
- Task 0.12（lib/api.js fetch 封装）

执行规则：
1. **不要用 `npm create vite`**，按 plan 里的 Step 手动写 client/package.json、vite.config.js、index.html。理由：vite 模板会带很多用不上的文件。
2. 所有代码完整照搬，**不要改 Tailwind 配置里的 content 路径，不要改 theme.css 里的 CSS 变量值**（浅色主题色已经定好）。
3. 安装依赖时严格按 plan 里写的版本号，不要 `^` 改成 `~`，不要升级到 latest。
4. main.jsx + App.jsx 这阶段只需要渲染一个测试文字（plan 里有），不要加 layout 组件——layout 是 Pack D 的事。
5. lib/api.js 必须包含 ApiError 类、fetch 封装、SSE 流封装三段，**不能省略任何一个**。
6. 每个 Task 末尾的 git commit 必须执行。

完成后必须验证：
- `npm --prefix client install` 无错（耐心等，可能要几分钟）
- `npm --prefix client run dev`，看到 vite 提示 "Local: http://localhost:5173/" 后用浏览器打开
- 浏览器里能看到 plan 里 App.jsx 渲染的那行测试文字（Tailwind 样式生效，背景应该是浅色）
- 关闭 dev server（Ctrl+C）
- 跑 `git log --oneline`，应该比 Pack B 多 4 个 commit
- **顺手验证一下根级聚合脚本**：`npm run dev`，应该能同时启 server 和 client（`concurrently` 起作用）。看到两个都启起来后 Ctrl+C 关掉。

最后停下来：
1. 截图或文字描述：浏览器里看到的页面内容
2. 输出 `git status` 和 `git log --oneline -15`
3. 列出 client/ 下的文件树（不含 node_modules）
4. 等用户确认后再继续，**不要自动开 Pack D**。
````

---

# Pack D · 布局外壳（Tasks 0.13 – 0.14）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 0 Pack D。

前置：Pack A/B/C 已完成，前端能渲染测试页面，后端能跑。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 0.13（Layout + Sidebar + MainArea + TopBar 骨架）
- Task 0.14（RightDrawer + SettingsPanel）

执行规则：
1. 文件路径严格按 plan：client/src/components/layout/{Layout,Sidebar,TopBar,MainArea,RightDrawer}.jsx、client/src/panels/SettingsPanel.jsx。**不要改目录结构**。
2. App.jsx 在 Task 0.13 里会被改写，把 Pack C 那段测试渲染替换成真正的 Layout 组件树——按 plan 来。
3. Sidebar 里的 5 个 Assistant 项（通用对话/Word/PPT/论文/计划+定时）的图标、文字、颜色严格按 plan，**不要换 lucide 图标**。
4. 浅色主题色直接用 client/src/styles/theme.css 里的 CSS 变量（var(--color-bg) 等），**不要在组件里写死 hex**。
5. SettingsPanel 这阶段只需要静态 UI（输入框 + 保存按钮），保存逻辑用 Pack C 写好的 lib/api.js 里的 setConfig 调用。
6. 每个 Task 末尾的 git commit 必须执行。

完成后必须验证：
- `npm run dev`，浏览器打开 http://localhost:5173
- 看到：左边 260px 宽的浅色侧边栏，5 个 Assistant 项；顶部 TopBar 有 ⚙ 设置按钮；主区域空白或占位文字
- 点击 ⚙，右侧 RightDrawer 滑出，里面是 SettingsPanel（apiKey 输入框、model 输入框、保存按钮）
- 在 SettingsPanel 里随便填一个 apiKey 点保存，浏览器 devtools network 应该能看到 POST /api/config，返回 200
- 重新刷新页面，apiKey 应该被 mask 显示成 "***" 或空（说明 GET /api/config 的 mask 逻辑工作正常）
- Ctrl+C 关掉
- 跑 `git log --oneline`，应该比 Pack C 多 2 个 commit

最后停下来：
1. 描述浏览器里看到的页面（侧边栏文字、TopBar 按钮、设置面板字段）
2. 描述设置面板保存 + 刷新后的行为
3. 输出 `git status` 和 `git log --oneline -20`
4. 等用户确认后再继续，**不要自动开 Pack E**。
````

---

# Pack E · 通用对话 MVP + Day 0 验收（Tasks 0.15 – 0.16）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 0 Pack E（最后一个 Day 0 包）。

前置：Pack A/B/C/D 已完成，能看到 layout 外壳和设置面板。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 0.15（useChat hook + ChatArea + MessageBubble + InputBar）
- Task 0.16（Day 0 验收）

执行规则：
1. useChat 必须用 useReducer，按 plan 里的 reducer 完整照搬，**不要换成 useState**。理由：后续 Day 1+ 的 cards 状态机依赖这套 reducer。
2. lib/api.js 里的 streamChat（SSE 流封装）在 Pack C 已经写好了，useChat 直接调用即可，**不要重新实现 SSE 解析**。
3. ChatArea / MessageList / MessageBubble / InputBar 的文件路径严格按 plan：client/src/components/chat/。
4. InputBar 这阶段只要支持 Enter 发送 + Shift+Enter 换行，**不要加 / 命令补全**——slash command 是 Day 1 的事。
5. MessageBubble 这阶段渲染纯文本即可，**不要加 markdown 渲染**——markdown 是 Day 3 的事。
6. App.jsx 里把通用对话 Assistant 默认选中，主区域渲染 ChatArea。
7. Task 0.16 是验收 task，按 plan 里的 checklist 一项一项过，每项都跑通才算 Day 0 完成。
8. Day 0 末尾打 milestone tag：`git tag day0-complete`，按 plan 里的命令。

完成后必须做端到端验证（**真 API Key**，自己问用户要，不要瞎填）：
- 用户先在浏览器 ⚙ 里把真的 DeepSeek apiKey 存进去（或者在 server/.env 里设 DEEPSEEK_API_KEY，按 plan 走哪种都行）
- 启 `npm run dev`
- 在通用对话里输入 "你好，用一句话介绍你自己"
- 必须看到：
  a) 用户气泡立刻显示
  b) AI 气泡的文字**逐字流式**出现（不是一次性弹出整段）
  c) 流结束后下方还能继续输入第二条
- 至少跑 2 轮对话（验证 conversation 历史能传下去，第二条 AI 回复能 reference 第一条）
- 关掉前端，重新打开浏览器，对话历史应该还在（store.js 持久化生效）
- Ctrl+C 关掉所有

如果中间任何一步失败：**停下，把错误贴出来，等用户解决**，不要自己改 plan 里的代码绕过去。

最后停下来：
1. 贴出对话截图或文字 transcript
2. 输出 `git log --oneline -25` 和 `git tag`（应该看到 day0-complete tag）
3. 输出当前完整目录树（不含 node_modules）
4. **报告 Day 0 完成**，等用户决定是否进 Day 1

````

---

## 使用顺序

```
Pack A → 你检查 → Pack B → 你检查 → Pack C → 你检查 → Pack D → 你检查 → Pack E → Day 0 完成
```

每次 codex 跑完一个 Pack 会停下来报告，你看一眼 OK 就发下一个 Pack 的 prompt。任何一个 Pack 出问题，回来告诉我，我会改对应的 Pack 或修 plan。

## 时间预估

- Pack A: 5–10 分钟（主要等 npm install）
- Pack B: 15–25 分钟（5 个文件，代码量较大）
- Pack C: 10–15 分钟（主要等 client npm install）
- Pack D: 15–20 分钟
- Pack E: 20–30 分钟（含手动端到端测试）

合计 **约 1.5–2 小时**，今晚跑完 Day 0 完全可行。

## 应急备注

- 如果 codex 卡在某个 step 想自由发挥（改文件路径、换库、加额外功能），**立刻打断它**，把 plan 里那段代码复制出来贴给它，命令"严格照抄"。
- 如果 plan 里某段代码确实有 bug（比如缺 import、变量名拼错），**先记下来告诉我**，我修 plan 后再让 codex 重跑，不要让 codex 自己 debug。
