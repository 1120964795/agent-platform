# Day 2 · Codex Prompt Packs（PPT 功能）

> Day 2 在 Day 1 跑通之后再开（day1-complete tag 必须存在）。
>
> Day 2 任务比 Day 1 少（只有 4 个 task），拆成 **2 个 Pack**：后端 PPT 生成 → 前端卡片 + 集成 + 验收。

---

## 通用前缀（每个 Pack 都默认遵守）

- 工作目录固定 `D:\claude project\agentdev-lite\`。
- 所有代码以 plan 文件为准：`docs/superpowers/plans/2026-04-10-agentdev-lite.md`。**不要自由发挥**：不确定时**完整照抄 plan**，不要改命名、不要简化、不要补功能。
- 每个 step 跑完都要验证，失败立刻停下报错。
- 每个 Pack 末尾跑 `git status` + `git log --oneline -10` 贴出来，**停下等用户确认**再开下一 Pack。
- Windows 路径有空格，所有路径加双引号。
- 不要安装 plan 没列出的依赖。
- Day 1 已经把 commands.js 5 个命令、useCommand、CommandPalette、ArtifactsPanel 都写完了，Day 2 **直接复用**，不要重复实现。

---

# Pack I · 后端 PPT 生成（Tasks 2.1 – 2.2）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 2 Pack I。

前置：Day 1 已完成（day1-complete tag 存在），Word 端到端跑通。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务，**严格按顺序**：
- Task 2.1（Server - services/pptxGen.js）
- Task 2.2（Server - routes/ppt.js）

执行规则：
1. Task 2.1 会要你在 server/package.json 加 `pptxgenjs` 依赖，按 plan 里写的版本号装，**不要升级到 latest**。装完跑 `npm --prefix server install` 验证。
2. pptxGen.js 里的封面页、内容页布局、颜色（背景 F6F8FB、强调色 3B82F6、字号、字体）全部照搬，**不要换字体名、不要改坐标**。pptxgenjs 的坐标系是 inch，改一个数字整张幻灯片就崩。
3. pptxGen.js 末尾页码（slide N / total）那段 footer 不能省略——演示时老师会看页码。
4. routes/ppt.js 调用 deepseek.chatJson 生成 slides 的 prompt 必须照搬 plan，**JSON 输出格式约束那段不能删**。
5. server/index.js 在 Task 2.2 里会被改动加 `/api/ppt` 路由，按 plan 改。
6. 每个 Task 末尾的 git commit 必须执行。

完成后必须验证：
- `npm --prefix server install` 无错
- 启 `npm --prefix server run dev`
- 在另一个终端跑：
    curl -X POST http://localhost:8787/api/ppt -H "Content-Type: application/json" -d "{\"title\":\"测试演示\",\"topic\":\"区块链入门\",\"slides\":5}"
  必须返回 JSON，包含 filename、path 字段
- 进 generated/ 目录，看到刚生成的 .pptx 文件，**必须用 PowerPoint / WPS 打开人工肉眼检查**：
  a) 封面页有标题 + 顶部蓝色横条
  b) 内容页有页面标题 + bullet 列表（至少 4 页）
  c) 每页右下角有页码（"2 / 5" 这种）
  d) 中文显示正常，没有乱码
- 跑：
    curl http://localhost:8787/api/artifacts
  返回的列表里应该同时有 Day 1 的 .docx 和刚才的 .pptx
- Ctrl+C 关掉
- 跑 `git log --oneline`，应该比 day1-complete 多 2 个 commit

最后停下来：
1. 输出生成的 .pptx 文件路径 + 文件大小
2. 描述用 PowerPoint/WPS 打开后看到的内容（封面、章节数、页码是否正常、字体是否正常）
3. 输出 `git status` 和 `git log --oneline -15`
4. 等用户确认后再继续，**不要自动开 Pack J**。
````

---

# Pack J · PPT 卡片 + 集成 + Day 2 验收（Tasks 2.3 – 2.4）

把以下整段贴给 codex：

````
你现在要执行 AgentDev Lite 项目的 Day 2 Pack J（最后一个 Day 2 包）。

前置：Pack I 已完成，后端 /api/ppt 能产出 .pptx。

请打开并阅读这个 plan 文件：
D:\claude project\agentdev-lite\docs\superpowers\plans\2026-04-10-agentdev-lite.md

需要执行的任务：
- Task 2.3（Client - PptCard）
- Task 2.4（Day 2 验收）

执行规则：
1. PptCard 是 Day 1 WordCard 的姊妹组件——三态（form/loading/done），状态走 useChat reducer，**不要在 PptCard 里 useState**，理由同 Day 1。
2. PptCard 表单字段：title、topic、slides 数量。最大 slides 数量限制 plan 里写了（一般 10），照搬。
3. PptCard form 状态收集到字段后，调用 lib/api.js 的 generatePpt（POST /api/ppt），返回结果通过 reducer 更新到 done 状态，并自动 addFileCard 把生成的 .pptx 加到右侧 ArtifactsPanel。
4. PptCard 颜色风格用主题里的强调色（绿色或紫色，参考 plan 里的 className），**不要照抄 WordCard 的蓝色**，理由：5 种 Assistant 视觉上要能区分。
5. lib/api.js 里如果 Day 1 没有 generatePpt 函数，按 plan 加上（应该是 fetch POST 的简单封装）。
6. MessageList 里 card 类型识别会自动 dispatch 到 PptCard，不需要改 MessageList——前提是 useChat reducer 里 addCard action 已经支持 type='ppt'。
7. ArtifactsPanel 不需要改：Day 1 已经支持任意文件类型，PptCard done 后 addFileCard 自动会进列表。
8. Task 2.4 是验收 task，按 plan checklist 一项一项过。
9. Day 2 末尾打 milestone tag：`git tag day2-complete`。

完成后必须做端到端验证：
- 启 `npm run dev`
- 浏览器打开 http://localhost:5173
- 在 InputBar 输入 `/`，CommandPalette 弹出 5 个命令
- 选 /ppt，PptCard 表单出现
- 填：
    title: 测试演示
    topic: 介绍 React
    slides: 5
- 点"生成"，PptCard 进入 loading（旋转 spinner），15–40 秒后变成 done 态
- done 态显示 FileCard：.pptx 文件名 + 大小 + 打开按钮
- 点打开按钮，**PowerPoint/WPS 自动打开生成的 .pptx**：
  a) 封面有标题"测试演示"
  b) 后面 4 页是 AI 生成的 React 介绍内容
  c) 每页右下角有页码
  d) 中文正常显示
- 右上角 ⚙ → 切到"产物"Tab，列表里同时能看到 Day 1 生成的 .docx + 刚生成的 .pptx
- **回归测试**：再跑一次 /word 命令生成一个 Word 文档，确认 Word 功能没被 Day 2 改动搞坏
- 关掉浏览器再开，所有产物 + 对话历史还在
- Ctrl+C 关掉
- 跑 `git log --oneline -10` 应该看到最近 2 个 commit
- 跑 `git tag` 应该看到 day0-complete、day1-complete、day2-complete 三个 tag

如果中间任何一步失败：**停下，把错误贴出来，等用户解决**，不要自己改 plan 里的代码绕过去。

最后停下来：
1. 文字描述完整端到端流程（PPT 生成 + Word 回归两次都跑通）
2. 贴出 .pptx 文件实际路径
3. 描述 PowerPoint 打开后的页面布局
4. 输出 `git log --oneline -25` 和 `git tag`
5. **报告 Day 2 完成**，等用户决定是否进 Day 3（论文助手）
````

---

## 使用顺序

```
（Day 1 完成后）→ Pack I → 你检查 → Pack J → Day 2 完成
```

## 时间预估

- Pack I: 25–35 分钟（pptxGen 代码量较大 + 含 PowerPoint 实际打开人工检查）
- Pack J: 25–35 分钟（PptCard 套用 WordCard 模式，主要时间在端到端 + 回归测试）

合计 **约 1 小时**，周日上午一段集中时间能跑完。**Day 2 完成意味着两个必交项（Word + PPT）都已稳**，剩下的 Day 3/4/5 都可以视情况砍。

## Day 2 风险点

1. **pptxgenjs 坐标系**：pptxgenjs 用 inch 而不是 px/em，plan 里坐标值精心算过，**任何修改都会让幻灯片错位**。如果 codex 想"美化布局"，立刻打断。
2. **页码 footer**：codex 容易把 `slideNumber` 配置漏掉，PPT 答辩时老师注意页码。
3. **PptCard 颜色复用 WordCard**：codex 默认会复制 WordCard 的蓝色 className，**必须换色**保持视觉区分。
4. **回归测试**：Day 2 改动 useChat reducer 时如果误删了 type='word' 的分支，Word 会瞬间挂掉。所以 Pack J 验收里**必须再跑一次 /word**。
5. **中文字体**：和 Word 不同，PowerPoint 默认中文字体在 pptxgenjs 里是用 `fontFace` 字段指定，plan 里设置过，照搬即可。如果 PPT 打开中文乱码，先查 fontFace 字段。

## 应急

Day 2 任何一个 Pack 出问题立刻回来。Word + PPT 是 deadline 必交项，**Day 2 之前不要碰 Day 3/4/5 的 task**——保住下限再谈上限。
