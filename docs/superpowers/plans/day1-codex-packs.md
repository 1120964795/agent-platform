# Day 1 · Codex Prompt Packs（Word 功能）

> Day 1 在 Day 0 跑通之后再开。如果 Day 0 的 day0-complete tag 没打，**先把 Day 0 收尾**。
>
> Day 1 拆成 3 个 Pack：后端 Word 生成 → 前端命令系统 + 卡片 → 集成到聊天 + 产物面板 + 验收。

---

## 通用前缀（每个 Pack 都默认遵守）

- 工作目录固定 `D:\claude project\agentdev-lite\`。
- 所有代码以 plan 文件为准：`docs/superpowers/plans/2026-04-10-agentdev-lite.md`。**不要自由发挥**：不确定时**完整照抄 plan**，不要改命名、不要简化、不要补功能。
- 每个 step 跑完都要验证，失败立刻停下报错。
- 每个 Pack 末尾跑 `git status` + `git log --oneline -10` 贴出来，**停下等用户确认**再开下一 Pack。
- Windows 路径有空格，所有路径加双引号。
- 不要安装 plan 没列出的依赖。
- Day 0 用过的真 DeepSeek API Key 已经存在 data/config.json，**不要重新配置**。

---

# Pack F · 后端 Word 生成 + 产物接口（Tasks 1.1 – 1.3）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 1 Pack F。

前置：Day 0 已完成（day0-complete tag 存在），server 能跑通用对话。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务，**严格按顺序**：
- Task 1.1（Server - services/docxGen.js）
- Task 1.2（Server - routes/word.js）
- Task 1.3（Server - routes/artifacts.js + open-file）

执行规则：
1. Task 1.1 会要你在 server/package.json 加 `docx` 依赖，按 plan 里写的版本号装，**不要升级到 latest**。装完跑 `npm --prefix server install` 验证。
2. docxGen.js 里的中文字体设置（宋体 / Times New Roman）、字号、对齐方式，全部照搬，**不要换字体名**。理由：宋体是 Word 默认中文字体名，换了之后 Word 打开会回退成英文字体。
3. routes/word.js 里调用 deepseek.chatJson 生成 sections 的 prompt 必须照搬 plan，**不要把"用 JSON 输出"那段去掉**。
4. routes/artifacts.js 里的 GET /api/open-file 端点必须有路径穿越保护（plan 里有 `path.resolve` + `startsWith` 检查），**不能省略**——这是安全要求。
5. server/index.js 在 Task 1.2/1.3 里会被改动两次（每次加一个新路由），按 plan 改。
6. 每个 Task 末尾的 git commit 必须执行。

完成后必须验证：
- `npm --prefix server install` 无错
- 启 `npm --prefix server run dev`
- 在另一个终端跑：
    curl -X POST http://localhost:8787/api/word -H "Content-Type: application/json" -d "{\"title\":\"测试报告\",\"topic\":\"人工智能简介\",\"sections\":3}"
  必须返回 JSON，包含 filename、path 字段
- 进入 generated/ 目录，看到刚生成的 .docx 文件，用 Word / WPS 打开能正常显示中文标题和正文（**这一步必须人工打开看一眼**）
- 跑：
    curl http://localhost:8787/api/artifacts
  返回 JSON 数组，包含刚才的 .docx 条目
- 跑：
    curl "http://localhost:8787/api/open-file?path=../../../etc/passwd"
  必须返回 4xx 错误（路径穿越被拦）。如果返回 200 + 任何文件内容，**立刻停下报告**，不要继续。
- Ctrl+C 关掉
- 跑 `git log --oneline`，应该比 day0-complete 多 3 个 commit

最后停下来：
1. 输出生成的 .docx 文件路径 + 文件大小
2. 描述用 Word/WPS 打开后的内容（标题、章节数、字体看上去是否正常）
3. 输出 `git status` 和 `git log --oneline -15`
4. 等用户确认后再继续，**不要自动开 Pack G**。
````

---

# Pack G · 前端命令系统 + Word 卡片（Tasks 1.4 – 1.6）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 1 Pack G。

前置：Pack F 已完成，后端 /api/word 能产出 .docx。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 1.4（Client - lib/commands.js + useCommand hook + CommandPalette）
- Task 1.5（Client - WordCard 三态组件）
- Task 1.6（Client - FileCard）

执行规则：
1. lib/commands.js 必须导出 5 个命令的元数据（/word、/ppt、/paper、/plan、/schedule），**全部 5 个都写进去**——后续 Day 2/3/4 会用，现在不要图省事只写 /word。
2. useCommand hook 必须支持键盘上下选择 + Enter 选中 + Esc 关闭，按 plan 实现，**不要换成鼠标点击 only**。
3. CommandPalette 浮层定位用 absolute + bottom，参考 plan 里的 className。
4. WordCard 三态：form / loading / done。state 转换走 useChat reducer 里的 updateCard action，**不要在 WordCard 里自己 useState 管状态**——理由：Day 4 的 PlanCard 需要外部强制重置卡片状态，只能走 reducer。
5. WordCard 的"打开文件"按钮调用 lib/api.js 里的 openFile（GET /api/open-file），不要直接 window.open。
6. FileCard 是一个通用文件展示组件（图标 + 文件名 + 大小 + 打开/下载按钮），WordCard done 状态会复用它。
7. 每个 Task 末尾的 git commit 必须执行。
8. 这个 Pack **不修改 InputBar / MessageList / ChatArea**——集成是 Pack H 的事。

完成后必须验证：
- `npm --prefix client run dev`，浏览器打开 http://localhost:5173
- 这一步浏览器里**看不到**新功能，因为还没接到 chat 流——这是预期的
- 但 client/src 下应该多出这些文件：lib/commands.js、hooks/useCommand.js、components/chat/CommandPalette.jsx、components/cards/WordCard.jsx、components/cards/FileCard.jsx
- 跑 `npm --prefix client run build`，必须 build 成功，无 import 错误（这是验证三个新组件至少在语法上没问题）
- 跑 `git log --oneline`，应该比 Pack F 多 3 个 commit

最后停下来：
1. 列出 client/src/components/cards/ 和 client/src/components/chat/ 下的所有文件
2. 输出 build 命令的最后 10 行（确认 "built in xxx ms"）
3. 输出 `git status` 和 `git log --oneline -20`
4. 等用户确认后再继续，**不要自动开 Pack H**。
````

---

# Pack H · 集成到聊天 + 产物面板 + Day 1 验收（Tasks 1.7 – 1.9）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 1 Pack H（最后一个 Day 1 包）。

前置：Pack F + G 已完成。后端 /api/word 通；前端有 WordCard、FileCard、CommandPalette 文件但还没接到聊天里。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 1.7（Client - 集成 cards 到 MessageList + ChatArea）
- Task 1.8（Client - ArtifactsPanel）
- Task 1.9（Day 1 验收）

执行规则：
1. Task 1.7 会改 InputBar（接 useCommand + CommandPalette 浮层）、MessageList（识别 card 类型并渲染对应组件）、useChat reducer（加 addCard / updateCard / addFileCard action）。**这三处改动必须同时做完才能联调**。
2. useChat 的 reducer 在 Day 0 已经有 addUserMessage / addAssistantMessage / appendDelta 三个 action，这次**新增**三个，不要删旧的。
3. WordCard 在 form 状态收集到 title/topic/sections 后，调用 lib/api.js 的 generateWord（POST /api/word），返回结果通过 reducer 更新到 done 状态，并自动 addFileCard 把生成的 .docx 加到右侧 ArtifactsPanel。
4. ArtifactsPanel 在 RightDrawer 里以 Tab 形式和 SettingsPanel 共存（plan 里有 RightDrawer 改造的代码）。Tab 切换用 React 内部 state 即可。
5. ArtifactsPanel 启动时调用 GET /api/artifacts 拉一次列表；后续每次 chat 生成新文件后追加到列表头部。
6. Task 1.9 是验收 task，按 plan 里的 checklist 一项一项过。
7. Day 1 末尾打 milestone tag：`git tag day1-complete`。

完成后必须做端到端验证（**真实 DeepSeek API Key 必须可用**）：
- 启 `npm run dev`
- 浏览器打开 http://localhost:5173，进通用对话或 Word 助手
- 在 InputBar 输入 `/`，CommandPalette 应该弹出 5 个命令（/word /ppt /paper /plan /schedule）
- 上下方向键能切换高亮，按 Enter 选中 /word
- WordCard 表单出现，填：
    title: 测试文档
    topic: 介绍机器学习
    sections: 3
- 点"生成"，WordCard 进入 loading（旋转 spinner），10–30 秒后变成 done 态
- done 态显示 FileCard：文件名 + 大小 + 打开按钮
- 点打开按钮，**Word/WPS 自动打开生成的 .docx**，内容能看到"测试文档"标题 + 3 个 AI 生成的章节
- 右上角 ⚙ 打开 RightDrawer，切到"产物"Tab，应该看到刚才那个文件出现在列表里
- 关闭浏览器再开，对话历史 + 产物列表应该都还在
- Ctrl+C 关掉
- 跑 `git log --oneline -10` 应该看到最近 3 个 commit
- 跑 `git tag` 应该看到 day1-complete

如果中间任何一步失败：**停下，把错误贴出来，等用户解决**，不要自己改 plan 里的代码绕过去。

最后停下来：
1. 文字描述完整的端到端流程（看到了什么、点了什么、生成的文件名）
2. 贴出 .docx 文件的实际路径（generated/xxx.docx）
3. 输出 `git log --oneline -25` 和 `git tag`
4. **报告 Day 1 完成**，等用户决定是否进 Day 2（PPT 功能）
````

---

## 使用顺序

```
（Day 0 完成后）→ Pack F → 你检查 → Pack G → 你检查 → Pack H → Day 1 完成
```

## 时间预估

- Pack F: 20–30 分钟（含 Word 实际打开人工肉眼检查）
- Pack G: 25–35 分钟（前端代码量较大，3 个组件 + 1 个 hook + 1 个 lib）
- Pack H: 30–40 分钟（集成 + 端到端联调，最容易出意外的环节）

合计 **约 1.5–2 小时**，周六上午或下午一段集中时间能跑完。

## Day 1 风险点（codex 最容易翻车的地方）

1. **docx 字体名**：plan 里写的是 `'宋体'`（中文字符），如果文件保存时编码挂了，字体名变成乱码，Word 打开会丢字体。如果发现 Word 里中文字体不对，先检查 docxGen.js 文件实际编码（必须是 UTF-8）。
2. **path 穿越保护**：如果 codex 自作聪明把 `startsWith` 检查删了说"不需要"，**立刻让它改回来**。
3. **WordCard 状态机**：codex 很容易在 WordCard 里加 useState 管 loading/done 状态——这条路在 Day 4 PlanCard 会爆炸（Plan 是流式生成，需要 reducer 接收增量）。**必须坚持走 reducer**。
4. **Tab 切换 vs Drawer 关闭**：ArtifactsPanel 和 SettingsPanel 共用 RightDrawer，Tab 切换不要触发 drawer 关闭动画。
5. **文件大小显示**：FileCard 里 size 字段单位（B/KB/MB）的格式化，plan 里有 helper，**别让 codex 重新写一遍**。

## 应急

Day 1 出问题先回来告诉我，我会改对应 Pack 或修 plan。如果想砍范围保 Day 2/3 进度，**Word 是 deadline 必交项，不能砍**——优先级最高。
