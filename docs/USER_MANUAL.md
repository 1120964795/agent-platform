# AgentDev Lite 详细说明书

适用版本：`agentdev-lite` 0.1.0  
说明范围：以 2026-04-15 当前代码为准，覆盖安装启动、普通使用、Full Permission、本地工具、Skill、数据位置、打包和开发维护。

## 1. 项目简介

AgentDev Lite 是一个基于 Electron 的桌面 Agent 应用。它把 DeepSeek 聊天、本地文件读取、Shell 命令执行、Word/PPT 生成、Skill 工作流和用户偏好记忆集中到一个轻量桌面界面中。

当前架构已经移除 Express 常驻后端。聊天循环、工具执行、Skill 加载、文档生成和数据持久化都运行在 Electron 主进程；React 前端通过 `window.electronAPI.invoke/on` 与主进程通信。

适合场景：

- 普通问答、代码解释、学习辅导。
- 总结本地 PDF、DOCX、Markdown、代码文件。
- 在确认后执行本地开发命令，例如安装依赖、运行测试、检查工具版本。
- 根据自然语言生成 `.docx` 报告或 `.pptx` 演示稿。
- 用 Skill 固化常见工作流，例如写报告、做 PPT、查文件、装依赖。
- 记录跨会话偏好，例如“以后写报告优先调用 word-writer”。

## 2. 技术栈

- 桌面壳：Electron 33。
- 前端：React 18、Vite 5、Tailwind CSS、lucide-react。
- 主进程：Node.js CommonJS。
- 大模型：DeepSeek Chat Completions API。
- 测试：Vitest。
- 打包：electron-builder，Windows NSIS 安装包。
- 文档生成：`docx`、`pptxgenjs`。
- 文档读取：普通文本直接读取，DOCX 使用 `mammoth`，PDF 使用 `pdftotext`。

目录里的 `server/` 是早期 Express 方案遗留代码。当前桌面应用主链路以 `electron/`、`client/` 和 `resources/skills/` 为准。

## 3. 目录结构

```text
agentdev-lite/
  client/                 React + Vite 前端
    src/components/       布局、聊天区、工具卡片
    src/panels/           设置、文件、产物、Skills、偏好面板
    src/hooks/            聊天状态、输入命令逻辑
    src/lib/              IPC API 映射
  electron/               Electron 主进程
    main.js               创建窗口、加载前端
    preload.js            暴露 window.electronAPI
    ipc/                  配置、聊天、文件、Skill、产物等 IPC
    tools/                本地工具注册与执行
    services/             DeepSeek、文件读取、Word/PPT、用户偏好
    skills/               Skill registry 与 load_skill
    __tests__/            Vitest 测试
  resources/skills/       内置 Skill
  docs/superpowers/       设计文档和实现计划
  dist-electron/          打包输出
  package.json            根脚本和 electron-builder 配置
```

## 4. 安装与启动

### 4.1 环境要求

建议环境：

- Windows 10/11。
- Node.js 18 或更高版本。
- npm。
- 可访问 DeepSeek API 的网络。
- DeepSeek API Key。
- 如需读取 PDF，建议安装 `pdftotext.exe`，或设置 `PDFTOTEXT_PATH`。

### 4.2 安装依赖

```powershell
cd "D:\claude project\agentdev-lite"
npm run setup
```

`npm run setup` 会安装根目录依赖和 `client/` 前端依赖：

```powershell
npm install
npm --prefix client install
```

### 4.3 开发模式启动

```powershell
npm run electron:dev
```

该脚本会同时启动 Vite 前端和 Electron。默认前端地址为 `http://localhost:5173`。开发模式下会打开 DevTools。

如果 Vite 端口改变，可以设置：

```powershell
$env:AGENTDEV_DEV_SERVER_URL="http://localhost:5174"
npm run electron:dev
```

### 4.4 运行测试

```powershell
npm test
```

监听模式：

```powershell
npm run test:watch
```

### 4.5 构建 Windows 安装包

```powershell
npm run electron:build
```

构建流程：

1. `npm run build:client` 生成 `client/dist`。
2. `electron-builder --win` 打包 Windows x64 NSIS 安装包。
3. 输出文件位于 `dist-electron/`。

## 5. 初次配置

启动应用后，先打开右侧设置面板。入口在左侧底部“设置”，也可以点击顶部栏右侧设置图标。

### 5.1 Model 标签

`Permission Mode` 有两种：

- `Normal`：普通聊天模式。模型只输出文本，不暴露本地文件、Shell、Skill 和文档生成工具。
- `Full Permission`：全权限模式。模型可以按需调用本地文件、Shell、Skill、Word/PPT 生成和偏好记忆工具。

`DeepSeek API Key`：填写 DeepSeek API Key。保存后界面只显示掩码；输入框留空再保存不会清空已有 Key。

`Base URL`：默认 `https://api.deepseek.com`。实际请求路径为 `{baseUrl}/v1/chat/completions`。

`Model`：当前界面提供 `deepseek-chat` 和 `deepseek-reasoner`。

`Temperature`：范围 0 到 2，值越低越稳定，值越高越发散。

配置完成后点击 `Save Settings`。

### 5.2 Workspace 标签

`Workspace` 是 Shell 命令默认工作目录，也是模型未指定输出路径时的重要参考。

注意：`workspace_root` 不是硬沙盒边界。Full Permission 下，如果模型获得绝对路径，仍可能读取或操作工作区外的文件。涉及敏感文件或危险命令时，需要依赖权限模式、确认弹窗和你的判断。

可配置项：

- `Pick`：选择默认工作目录。
- `Remember approved gray shell commands for this session`：本会话内记住已确认的灰名单 Shell 命令首 token。
- `Extra shell whitelist`：额外 Shell 白名单，一行一个，也支持逗号分隔。
- `Extra shell blacklist`：额外 Shell 黑名单，一行一个，也支持逗号分隔。

## 6. 界面说明

### 6.1 左侧导航栏

左侧包含应用标题、折叠按钮、`新对话`、助手分类、设置和产物入口。

当前版本的核心能力主要通过聊天框自然语言触发。`通用对话`、`Word 助手`、`PPT 助手`、`论文助手`、`日程助手`更多是界面分类入口，不代表已经实现完整多 Agent。`新对话`按钮目前保留了入口，但完整多会话 UI 尚未完成。

### 6.2 中间聊天区

聊天区会显示：

- 用户消息。
- 模型流式回复。
- 工具调用卡片。
- Shell 输出日志。
- Skill 加载提示。

输入框规则：

- Enter 发送。
- Shift+Enter 换行。
- Normal 模式只发送普通文本。
- Full Permission 模式会显示回形针按钮，可选择本地文件路径并插入输入框。

回形针不会上传文件本身，只是把绝对路径插入输入框。模型是否读取文件，由 Full Permission 下的工具调用决定。

### 6.3 右侧面板

右侧面板包含：

- `设置`：模型、权限、工作区、Shell 名单、Skills、用户偏好。
- `文件`：仅 Full Permission 模式显示，用于浏览本地文件并把路径插入输入框。
- `产物`：查看已生成的 Word/PPT 文件，并调用系统打开。

### 6.4 文件浏览

文件浏览面板支持进入目录、返回上级、刷新、快捷切换 `C:\`、`D:\` 和文档目录。点击文件会把文件路径插入聊天输入框。

### 6.5 产物面板

通过 `generate_docx` 或 `generate_pptx` 生成的文件会登记到产物列表。点击产物卡片会打开对应文件路径。

## 7. 常见使用流程

### 7.1 普通聊天

保持 `Normal` 模式，输入问题即可：

```text
解释一下 React useEffect 的依赖数组。
```

```text
帮我把这段 Python 代码改得更清晰。
```

Normal 模式不会读取本地文件，也不会执行命令。

### 7.2 总结本地文件

1. 设置为 `Full Permission` 并保存。
2. 用回形针或文件面板插入路径。
3. 用自然语言说明任务。

示例：

```text
总结 "D:\docs\paper.pdf"，提炼研究问题、方法、实验和结论。
```

```text
读取 "D:\projects\demo\README.md"，告诉我这个项目怎么启动。
```

支持文本类文件、PDF、DOCX。PDF 依赖 `pdftotext`，DOCX 依赖 `mammoth`。

### 7.3 生成 Word 文档

示例：

```text
写一份关于点云目标检测的 Word 报告，包含研究背景、主流方法、数据集、挑战和未来方向，输出到 D:\reports\point-cloud-report.docx。
```

模型通常会加载 `word-writer`，组织大纲和正文，然后调用 `generate_docx`。如果没有指定输出路径，文件会写入应用的 `generated` 目录，并出现在产物面板。

### 7.4 生成 PPT

示例：

```text
帮我做一个 8 页 PPT，主题是自动驾驶中的 LiDAR 3D 目标检测，面向研究生组会，输出到 D:\slides\lidar-3d-detection.pptx。
```

模型通常会加载 `ppt-builder`，拟定幻灯片标题和要点，然后调用 `generate_pptx`。当前 PPT 生成器使用内置 16:9 模板，适合生成结构化草稿。

### 7.5 检查或安装依赖

示例：

```text
在 "D:\claude project\agentdev-lite" 里检查依赖是否装好，如果没装请安装。
```

```text
帮我看看本机有没有 uv，没有的话用合适方式安装，并验证版本。
```

模型通常会加载 `dep-installer`，按 `get_os_info -> which -> run_shell_command -> verify` 的流程执行。灰名单命令会弹出确认窗口。

### 7.6 记住偏好

示例：

```text
以后我让你写报告时，请优先调用 word-writer，并把结构写成“背景、方法、实验、结论”。
```

Full Permission 模式下，模型会调用 `remember_user_rule`，把偏好写入 `user_rules.md`。之后新会话会把这些偏好加入 system prompt。删除偏好可以在设置面板的 `Preferences` 标签操作。

## 8. 权限与安全

### 8.1 Normal 模式

Normal 是默认安全模式：不暴露本地文件工具、Shell 工具、Skill 工具、文档生成工具和偏好写入工具。适合普通问答。

### 8.2 Full Permission 模式

Full Permission 允许模型主动调用本地工具。它能完成更多工作，但也意味着被读取的文件内容、Shell 输出和工具结果可能会发送给 DeepSeek 作为上下文。建议只在需要本地能力时开启，用完后切回 Normal。

### 8.3 Shell 三段策略

Shell 命令按首个 token 分类。例如 `npm install` 的 token 是 `npm`。

默认白名单：

```text
npm, pnpm, yarn, npx, pip, pip3, python, python3, node, git,
curl, wget, winget, choco, scoop, where, echo, dir, type, ls, cat
```

默认黑名单：

```text
rm, rmdir, rd, del, erase, format, diskpart, shutdown, reboot,
taskkill, reg, regedit, mkfs, dd, fdisk
```

行为规则：

- 白名单命令可直接执行。
- 黑名单命令直接拒绝。
- 既不在白名单也不在黑名单的命令属于灰名单，会弹出确认窗口。
- 确认窗口会显示命令和工作目录，也可选择本会话内不再询问同类命令。

### 8.4 文件操作保护

- `write_file` 覆盖已有文件时需要 `overwrite=true`，并弹出确认。
- `delete_path` 删除文件或目录前一定确认。
- `move_path` 移动或重命名前一定确认。
- 目标文件已存在且没有允许覆盖时，直接返回 `ALREADY_EXISTS`。

### 8.5 使用建议

- 不要在 Full Permission 下处理敏感目录，除非你清楚会读取什么。
- 插入文件路径前，确认文件内容可以发送给模型服务。
- 对灰名单 Shell 命令，先看清命令和工作目录再允许。
- 不要把删除、格式化、注册表修改等命令加入白名单。
- `workspace_root` 不是安全边界。

## 9. Skill 系统

Skill 是 Markdown 工作流文件，用来告诉模型某类任务应该按什么步骤做、可以用哪些工具、有哪些资源。Full Permission 模式下，模型会看到 Skill 索引，并在适合时调用 `load_skill(name)` 读取完整内容。

### 9.1 内置 Skill

当前内置 5 个 Skill：

- `word-writer`：Word 文档、报告、论文草稿、`.docx` 输出。
- `ppt-builder`：PPT 演示文稿、幻灯片、`.pptx` 输出。
- `study-helper`：学习解释、作业帮助、练习题、学习计划。
- `file-explorer`：理解目录结构、查找文件、总结本地文件。
- `dep-installer`：检查、安装、配置本地开发依赖和命令行工具。

内置 Skill 位于：

```text
resources/skills/
```

### 9.2 Skills 面板

路径：设置面板 -> `Skills`。

支持操作：

- `Folder`：打开用户 Skill 目录。
- `Reload`：重新扫描 Skill。
- `Create`：创建用户 Skill 骨架。
- `Edit`：打开 `SKILL.md`。
- `Copy`：复制内置 Skill 到用户目录，生成可编辑副本。
- 删除按钮：删除用户 Skill。内置 Skill 是只读的，不能删除。

同名用户 Skill 会覆盖内置 Skill，适合复制内置工作流后做个人定制。

### 9.3 SKILL.md 格式

示例：

```markdown
---
name: my-report-writer
description: Use when the user wants a structured Chinese research report.
when-to-use: User asks for a Chinese report, lab summary, or paper reading note.
tools: [read_file, generate_docx]
resources:
  - templates/report.docx
---

# My Report Writer

## Workflow
1. Confirm the report topic, audience, length, and deadline.
2. Read provided local references with `read_file`.
3. Build an outline with background, method, experiment, and conclusion.
4. Generate the Word document with `generate_docx`.
5. Return the output path and summarize what was included.
```

字段说明：

- `name`：Skill 名称，必须唯一。
- `description`：简短描述，模型会根据它判断是否加载。
- `when-to-use`：更具体的触发条件。
- `tools`：建议搭配的工具名。
- `resources`：相对于 Skill 目录的资源文件。加载时会附带绝对路径。
- 正文：具体工作流。

### 9.4 加载规则

- 只有 Full Permission 模式下模型才会看到 Skill 索引。
- 内置目录和用户目录会合并。
- 用户 Skill 与内置 Skill 同名时，用户版本优先。
- 每个会话中同一个 Skill 只加载一次。
- 修改 Skill 后需要点击 `Reload` 或重启应用。

## 10. 本地工具清单

Full Permission 模式下，模型可以使用这些主要工具：

- `read_file`：读取本地文件，支持文本、PDF、DOCX，也支持 base64。
- `list_dir`：列出目录。
- `search_files`：按文件名搜索，默认最多返回 50 项。
- `write_file`：写入文件，覆盖已有文件需确认。
- `edit_file`：按精确字符串替换文件内容。
- `create_dir`：创建目录。
- `delete_path`：删除文件或目录，必须确认。
- `move_path`：移动或重命名，必须确认。
- `run_shell_command`：运行本地命令，受 Shell 策略约束。
- `get_os_info`：获取系统、架构、Shell、包管理器等信息。
- `which`：查找命令是否存在。
- `generate_docx`：生成 Word 文档。
- `generate_pptx`：生成 PPT。
- `load_skill`：加载 Skill 工作流。
- `remember_user_rule`：保存跨会话偏好。
- `forget_user_rule`：删除跨会话偏好。

## 11. 数据与文件位置

默认数据目录在 Electron `userData` 下的：

```text
agentdev-lite/data/
```

主要文件：

- `config.json`：API Key、Base URL、模型、权限模式、工作区、Shell 名单。
- `data.json`：会话、产物索引、预留任务数据。

默认生成目录：

```text
agentdev-lite/generated/
```

用户偏好文件：

```text
agentdev-lite/user_rules.md
```

用户 Skill 目录：

```text
agentdev-lite/skills/
```

可用环境变量：

```powershell
$env:AGENTDEV_DATA_DIR="D:\agentdev-data\data"
$env:AGENTDEV_GENERATED_DIR="D:\agentdev-generated"
$env:AGENTDEV_USER_SKILLS_DIR="D:\agentdev-skills"
$env:AGENTDEV_BUILTIN_SKILLS_DIR="D:\agentdev-builtin-skills"
$env:PDFTOTEXT_PATH="D:\tools\poppler\Library\bin\pdftotext.exe"
```

## 12. 常用提示词示例

总结论文：

```text
总结 "D:\papers\example.pdf"，按“研究问题、核心方法、实验设置、主要结果、局限性、可复现建议”输出。
```

理解项目：

```text
查看 "D:\projects\my-app" 的目录结构，告诉我它是什么技术栈、入口文件在哪里、怎么启动。
```

生成报告：

```text
写一份 3000 字左右的 Word 报告，主题是大模型 Agent 的本地工具调用安全设计，输出到 D:\reports\agent-tools-security.docx。
```

生成 PPT：

```text
做一个 10 页 PPT，主题是 Vite + Electron 桌面应用开发流程，面向初学者，输出到 D:\slides\electron-vite-intro.pptx。
```

执行命令：

```text
在 "D:\claude project\agentdev-lite" 里运行测试，并总结失败原因。
```

记住偏好：

```text
以后我让你做 PPT 时，请默认控制在 8 到 12 页，每页不要超过 5 个要点。
```

## 13. 旧 slash command 说明

当前代码仍保留 `/paper`、`/plan`、`/schedule` 的输入提示和解析逻辑，但真正提交后会提示该 slash command 已移除。当前版本应优先用自然语言触发工具和 Skill。

## 14. 常见问题

### 14.1 API key is not configured

打开设置，在 Model 标签填写 `DeepSeek API Key`，点击 `Save Settings` 后重新发送消息。

### 14.2 DeepSeek 401 或 403

通常是 API Key 错误、过期、权限不足或 Base URL 配置错误。检查 Key、Base URL、账号余额和 API 权限。

### 14.3 Network error 或 timeout

可能是网络不可达、代理配置错误、DeepSeek 服务异常或请求内容过大。检查网络和 Base URL；如果读取大文件，缩小任务范围。

### 14.4 PDF 读取失败

PDF 读取依赖 `pdftotext`。代码会尝试 `PDFTOTEXT_PATH`、`pdftotext.exe`、`pdftotext`、TeX Live 常见路径。解决方式是安装 Poppler/TeX Live，把 `pdftotext.exe` 加入 PATH，或设置 `PDFTOTEXT_PATH`。

### 14.5 Full Permission 下看不到文件面板

确认已选择 `Full Permission` 并点击 `Save Settings`。保存后关闭并重新打开右侧面板。

### 14.6 Shell 命令没有执行

检查是否处于 Full Permission、命令是否在黑名单、灰名单确认是否被取消、工作区路径是否存在、工具卡片里是否有 stderr 或 error。

### 14.7 产物列表为空

只有通过 `generate_docx` 或 `generate_pptx` 登记的文件会显示在产物列表。手动写文件或外部工具生成的文件不一定显示。

### 14.8 新对话按钮没有新建独立会话

当前版本还没有完整多会话 UI。聊天保存使用默认会话 ID，后续可以继续完善会话列表、新建、切换和删除。

## 15. 开发者维护说明

### 15.1 主进程

`electron/main.js` 负责创建窗口、注册 IPC、开发模式加载 Vite URL、生产模式加载 `client/dist/index.html`，并在渲染器加载失败时展示错误页。

`electron/preload.js` 暴露安全桥：`invoke`、`on`、`selectFile`、`selectDirectory`、`openPath`、`getPaths`。

### 15.2 IPC

`electron/ipc/index.js` 聚合注册 `config`、`conversations`、`artifacts`、`files`、`dialog`、`chat`、`skills`、`rules`。

新增 IPC 建议流程：

1. 在 `electron/ipc/` 新建模块。
2. 导出 `register(ipcMain, deps)`。
3. 加入 `ipc/index.js` 的 `MODULES`。
4. 在 `electron/__tests__/` 增加测试。

### 15.3 工具

工具入口是 `electron/tools/index.js`。新增工具时：

1. 在 `electron/tools/` 新建文件。
2. 定义 schema 和 handler。
3. 调用 `register(schema, handler)`。
4. 在 `loadBuiltins()` 中 require 新文件。
5. 高风险操作接入 `requestConfirm`。
6. 添加测试。

### 15.4 DeepSeek 聊天链路

主要文件：`electron/services/deepseek.js` 和 `electron/ipc/chat.js`。

流程：前端调用 `chat:send`，主进程构造 system prompt；Normal 模式只传普通 messages；Full Permission 模式额外传工具 schema；DeepSeek 返回文本和 tool calls；主进程执行工具并把结果作为 tool message 继续喂给模型；最多循环 10 轮；前端接收 `chat:delta`、`chat:tool-start`、`chat:tool-log`、`chat:tool-result`、`chat:done` 等事件。

### 15.5 前端状态

- `client/src/hooks/useChat.js`：加载默认会话、保存对话、处理流式回复、工具卡片和 Skill 提示。
- `client/src/components/chat/InputBar.jsx`：输入框、文件路径插入、旧 slash command 触发。
- `client/src/panels/SettingsPanel.jsx`：模型、权限、工作区、Skills、偏好设置。
- `client/src/panels/FileBrowser.jsx`：文件浏览。
- `client/src/panels/ArtifactsPanel.jsx`：生成文件列表。

### 15.6 打包

根 `package.json` 的 `build` 字段控制打包。当前 `asar` 为 `false`，`extraResources` 会把 `resources/skills` 和 `client/dist` 带进安装包。输出目录是 `dist-electron`。

### 15.7 回归 Checklist

每次打包前建议检查：

- `npm test` 通过。
- `npm run build:client` 通过。
- `npm run electron:build` 通过。
- 安装版首次启动能看到 5 个内置 Skill。
- DeepSeek Key 配置后普通聊天可用。
- Full Permission 下能浏览文件、读取 PDF/DOCX/MD。
- Shell 白名单命令可执行，灰名单会确认，黑名单被拒绝。
- Word/PPT 能生成并出现在产物列表。
- 用户 Skill 创建、复制、Reload 生效。
- 用户偏好能写入和删除。

## 16. 当前限制

当前版本尚未完整实现：

- 完整多会话管理 UI。
- 多 Agent 协作。
- PTY/xterm 交互式终端。
- Skill 市场或远程 Skill 仓库。
- RAG 索引和文件监听。
- 严格文件沙盒。
- 复杂 Word/PPT 模板排版。
- 定时任务完整 UI 和调度闭环。

当前主路径是：自然语言聊天 + Full Permission 工具调用 + Skill 工作流。
