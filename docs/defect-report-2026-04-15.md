# 体验与功能缺陷文档

日期：2026-04-15

说明：
- 本文聚焦“用户可感知”的体验问题与功能问题，不再讨论架构清理类事项。
- 结论基于当前仓库代码静态检查整理。
- 当前工作区未安装根 `node_modules`，因此未执行完整自动化测试；以下问题均有明确代码定位。

## 体验缺陷

1. `EXP-001` 输入框仍提示 `/paper`、`/plan`、`/schedule`，但实际功能已被移除
- 严重级别：高
- 现象：
  - 用户在输入框输入 `/` 时仍会看到命令面板推荐 `/paper`、`/plan`、`/schedule`。
  - 用户按回车提交后，系统不会执行对应功能，只会回一条“该 slash command 已移除”的提示。
- 代码定位：
  - `client/src/lib/commands.js:3-31`
  - `client/src/components/chat/InputBar.jsx:44-73`
  - `client/src/hooks/useChat.js:134-142`
- 影响：
  - UI 主动暴露了一个“看起来可用、实际上已废弃”的入口。
  - 用户会误以为产品支持这些命令，体验上属于明显的误导。
- 建议：
  - 彻底移除命令面板和相关命令解析。
  - 或恢复这些命令的真实能力，不要让 UI 和行为相互矛盾。

2. `EXP-002` 聊天消息未渲染 Markdown / 代码块，可读性差
- 严重级别：中
- 现象：
  - 助手消息当前直接以纯文本输出。
  - 如果模型返回 Markdown、代码块、列表或链接，界面不会进行格式化展示。
- 代码定位：
  - `client/src/components/chat/MessageBubble.jsx:1-17`
  - `client/src/components/chat/MessageList.jsx:24-27`
  - `client/package.json:11-17`
- 影响：
  - 代码示例、命令说明和结构化回答会以原始文本形式展示，阅读成本高。
  - 项目已经安装了 `react-markdown` 和 `remark-gfm`，但当前没有实际接入，属于“有依赖、无体验收益”。
- 建议：
  - 用 Markdown 组件渲染 assistant 消息。
  - 至少补齐代码块、列表、链接和表格的基础展示能力。

3. `EXP-003` 文件浏览器快捷入口写死为 `C:\` 和 `D:\`，适配性差
- 严重级别：中
- 现象：
  - 文件浏览器顶部快捷入口固定为 `C:\`、`D:\` 和“文档”。
  - 代码中存在 `drives` 状态，但没有实际用于动态盘符展示。
- 代码定位：
  - `client/src/panels/FileBrowser.jsx:23-27`
  - `client/src/panels/FileBrowser.jsx:92-108`
- 影响：
  - 在只有单盘、盘符不规则、或非 Windows 场景下，快捷入口会失效或误导。
  - 用户无法快速进入真实常用目录，比如桌面、下载、其他盘符。
- 建议：
  - 动态读取系统可用路径并渲染快捷入口。
  - 至少补齐 `desktop`、`downloads`、`documents` 等系统目录。

## 功能缺陷

1. `FUN-001` “新对话”按钮无任何实际行为
- 严重级别：高
- 现象：
  - 左侧边栏提供了“新对话”按钮，但按钮没有绑定点击处理逻辑。
  - 同时聊天状态默认只使用一个固定会话 ID。
- 代码定位：
  - `client/src/components/layout/Sidebar.jsx:39-46`
  - `client/src/hooks/useChat.js:36`
  - `client/src/hooks/useChat.js:46`
- 影响：
  - 用户无法真正开始一个全新的会话。
  - 产品表面看起来支持多轮/多会话，实际仍是单会话模式。
- 建议：
  - 为“新对话”按钮接入清空消息、重置会话 ID、重置本地状态的完整流程。

2. `FUN-002` 助手切换只改标题，不改实际能力与会话上下文
- 严重级别：高
- 现象：
  - 左侧可切换 `general / word / ppt / paper / schedule`。
  - 但切换后只是顶部标题变化，聊天区仍始终复用同一个 `ChatArea -> useChat -> chat:send` 流程。
  - 会话保存时助手类型仍固定写死为 `general`。
- 代码定位：
  - `client/src/components/layout/Sidebar.jsx:14-19`
  - `client/src/components/layout/MainArea.jsx:12-16`
  - `client/src/components/chat/ChatArea.jsx:5-20`
  - `client/src/hooks/useChat.js:66-69`
- 影响：
  - 用户会认为不同助手具有不同能力，但当前没有真实差异。
  - 助手切换属于“视觉状态切换”，不是“功能状态切换”。
- 建议：
  - 将 `selectedAssistant` 继续传递到聊天逻辑层。
  - 按助手维度区分 system prompt、会话 ID、默认工作流和持久化字段。

3. `FUN-003` 聊天中的“下载文件”按钮已经失效
- 严重级别：高
- 现象：
  - 文件卡片仍生成下载链接 `/files/<filename>`。
  - 但项目已迁移到 Electron IPC，当前既没有 `/files` 的 API 映射，也没有 Vite 代理。
- 代码定位：
  - `client/src/components/cards/FileCard.jsx:19-22`
  - `client/src/components/cards/FileCard.jsx:60-67`
  - `client/src/lib/api.js:30-49`
  - `client/vite.config.js:4-9`
- 影响：
  - 用户点击“下载”后，大概率会拿到无效链接或错误页面。
  - 这类问题直接影响生成文件的取用闭环，是核心功能缺陷。
- 建议：
  - 改为使用 Electron 能力直接打开/导出本地文件。
  - 或新增明确的文件读取/另存 IPC，而不是继续保留旧 HTTP 路径。

4. `FUN-004` 会话仍被固定保存到 `general-default`，不同操作会互相污染
- 严重级别：中
- 现象：
  - 当前聊天逻辑内置固定会话 ID `general-default`。
  - 页面初始化时会直接读取这个会话，发送消息后也持续写回这个会话。
- 代码定位：
  - `client/src/hooks/useChat.js:36`
  - `client/src/hooks/useChat.js:49-64`
  - `client/src/hooks/useChat.js:97-100`
- 影响：
  - 用户无法隔离不同主题或不同任务的上下文。
  - 旧消息会持续叠加，后续对话更容易跑偏。
- 建议：
  - 每次新建会话生成独立 ID。
  - 切换助手、新任务或清空对话时同步切换会话上下文。
