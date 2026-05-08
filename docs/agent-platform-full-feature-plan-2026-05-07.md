# Agent Platform 全功能计划书

文档日期：2026-05-07  
目标分支：`dev`  
项目定位：面向 Windows 本地开发者的桌面 Agent 平台，提供本地文件、Shell、技能、项目索引、诊断助手、Workflow Skill、经验库、备份恢复和最终交付打包能力。

## 1. 项目目标

Agent Platform 的目标是把“本地开发助手”从普通聊天工具升级为可落地执行的桌面工作台：

- 能理解用户本地项目结构，并围绕真实项目文件做问答、搜索、画像、补丁预览和安全应用。
- 能在用户授权后调用本地工具，包括文件读写、Shell、技能和工作流。
- 能观察终端、窗口或手动粘贴的错误文本，生成诊断卡片和可复用经验。
- 能把重复开发流程沉淀为 Workflow Skill，并支持版本、回滚、运行、导入导出和模板源。
- 能提供完整交付包，包括用户手册、开发文档、测试报告、安装指南和 Windows exe。
- 能保护本地隐私和安全，默认不导出密钥、源码、原始截图、embedding 或完整运行日志。

## 2. 用户与使用场景

### 2.1 目标用户

- 个人开发者：需要本地项目问答、快速修复错误、运行项目、生成文档。
- 学习者：需要解释项目结构、定位错误、按步骤启动 demo。
- 交付人员：需要将项目打包、备份、恢复、演示和验收。
- 高级用户：需要自定义技能、偏好规则、工作流模板和本地工具策略。

### 2.2 核心场景

- 打开本地项目后，自动识别框架、入口文件、依赖文件和启动命令。
- 对项目提问，例如“登录逻辑在哪里”“为什么 Vite 启动失败”“这个接口怎么接”。
- 搜索项目索引并获得带路径、行号、原因的引用来源。
- 预览补丁，不直接覆盖源码；用户确认后才写入允许范围内的文件。
- 监控终端或窗口错误，识别 Python、Node、Git、Java 等常见错误。
- 自动生成诊断卡片，给出修复步骤，并沉淀为经验卡片。
- 把启动项目、安装依赖、运行测试等重复流程保存为 Workflow Skill。
- 导出 `.aionbackup` 或 `.aionworkflow`，用于迁移、交付或恢复。
- 打包 Windows NSIS 安装程序，形成可验收交付物。

## 3. 当前全功能范围

### 3.1 账号与登录

功能目标：

- 保留登录、注册、记住密码、自动登录和用户历史。
- 不让新功能绕过登录界面。
- 用户配置、偏好、规则、项目、诊断和经验均支持按用户隔离。

验收标准：

- 未登录时进入登录页。
- 注册账号后可登录。
- 记住密码和自动登录按用户选择生效。
- 退出登录后回到登录页。

### 3.2 模型配置

功能目标：

- 支持 DeepSeek V4 作为默认文本模型。
- 支持千问 Qwen 作为可切换模型提供商。
- 支持单独配置 API Key、Base URL、模型名和温度。
- 支持 DeepSeek 兼容模型保留，避免旧配置失效。
- 允许未来接入多模态模型能力。

当前模型范围：

- DeepSeek：`deepseek-v4-flash`、`deepseek-v4-pro`、兼容 `deepseek-chat`、`deepseek-reasoner`。
- Qwen：`qwen-plus`、`qwen-turbo`、`qwen-max`、`qwen-long`。

多模态规划：

- 当前 Qwen 接口用于文本 Chat 和工具调用。
- 图像理解、截图理解和更强 OCR 后续应接入独立视觉模型通道。
- 多模态能力不应默认上传本地截图，必须由用户显式授权。

验收标准：

- 设置页可切换 DeepSeek V4 / Qwen。
- 保存配置后密钥以掩码显示。
- 未配置密钥时返回明确错误。
- 流式对话仍支持取消。

### 3.3 权限与安全模式

功能目标：

- 默认普通模式只进行文字对话，不调用高风险本地能力。
- 完整权限模式允许文件、Shell、技能、诊断和工作流。
- 灰名单命令可按会话记住确认。
- 高风险执行需要强确认。

验收标准：

- 普通模式不展示或不执行本地工具。
- 完整权限模式下才启用本地能力。
- Shell 白名单、黑名单和高级风险开关可配置。
- 风险操作必须经过确认，不允许静默执行。

### 3.4 本地文件与工具

功能目标：

- 支持文件浏览、搜索、读取和生成。
- 支持文档工具、PPT、Word、文件写入和安全删除类能力。
- 工具执行结果可回流到聊天界面。
- 对危险路径、敏感文件和破坏性操作进行限制。

验收标准：

- 文件列表可浏览工作区。
- 搜索可返回命中文件。
- 工具调用记录可展示开始、日志、结果和错误。
- 高风险文件写入或删除必须确认。

### 3.5 技能系统

功能目标：

- 支持内置技能、用户技能、从内置复制、自定义创建、删除和重载。
- 支持用户持久偏好规则。
- 支持 Workflow Skill 自动暴露到技能列表。

验收标准：

- 技能列表能展示内置技能、用户技能和 Workflow Skill。
- 新建技能有合法名称校验。
- 删除只作用于可编辑用户技能。
- 用户规则可被系统提示引用。

### 3.6 项目索引 V2

功能目标：

- 支持添加本地项目。
- 识别项目类型、框架、依赖文件、入口文件和常用命令。
- 基于 SQLite FTS 持久化索引。
- 支持索引队列、项目 watcher、增量更新和搜索。
- 支持问答引用来源，避免无来源回答。
- 支持补丁草稿、预览、确认应用和记录。
- 支持项目经验迁移匹配。
- 支持可选 embedding 刷新和状态展示。

主要模块：

- `electron/services/projects/projectRegistry.js`
- `electron/services/projects/projectProfileService.js`
- `electron/services/projects/projectIndexer.js`
- `electron/services/projects/sqliteIndexStore.js`
- `electron/services/projects/projectQAService.js`
- `electron/services/projects/patchDraftService.js`
- `electron/services/projects/patchApplyService.js`
- `electron/services/projects/projectWatcher.js`

验收标准：

- 添加 Vite / Flask / Java demo 后能识别框架。
- `.env`、锁文件、二进制文件不进入索引。
- 搜索返回路径、片段、分数和来源。
- 项目问答必须返回引用来源。
- 补丁在确认前不写入源码。
- 越界路径补丁被拒绝。

### 3.7 诊断助手与 Companion

功能目标：

- 支持手动粘贴错误文本。
- 支持选择窗口目标，通过 UI Automation 采集窗口文本。
- 支持区域选择和 OCR 采集。
- 支持后台轮询，识别新错误并生成诊断卡。
- 支持 Companion Popup，在主窗口非焦点时提示诊断。
- 支持忽略签名、解释诊断、重写计划和执行修复。

主要模块：

- `electron/services/diagnostics/errorDetector.js`
- `electron/services/diagnostics/diagnosisService.js`
- `electron/services/diagnostics/companionService.js`
- `electron/services/diagnostics/windowTargetService.js`
- `electron/services/diagnostics/uiaCollector.js`
- `electron/services/diagnostics/ocrCollector.js`
- `electron/services/diagnostics/observerSessionManager.js`
- `electron/services/diagnostics/experienceMatcher.js`

错误类型范围：

- Python：模块缺失、常见 Traceback。
- Node：端口占用、npm 错误。
- Git：仓库状态、路径、命令错误。
- Java：异常和构建错误。
- 通用：未知错误文本可生成保守诊断。

验收标准：

- 手动粘贴错误可生成诊断卡。
- 窗口目标列表可展示外部窗口。
- 后台采集不会重复创建相同经验。
- 成功执行修复后经验成功次数增加。
- 被忽略签名不再弹出。

### 3.8 经验库

功能目标：

- 自动从诊断卡沉淀经验草稿。
- 支持搜索、查看、编辑、删除、置顶和导出。
- 支持经验匹配复用，重复错误不重复创建经验。
- 支持成功/失败计数。
- 支持过期草稿清理。

验收标准：

- 同一错误签名复用同一经验。
- 成功修复后经验状态更新为 resolved。
- 经验搜索可按标题、签名、标签和正文命中。
- 导出不包含密钥和敏感原始数据。

### 3.9 Workflow Skill V3

功能目标：

- 支持从项目或运行记录生成工作流草稿。
- 支持保存、禁用、删除 Workflow Skill。
- 支持版本历史、diff、rollback。
- 支持运行、暂停、恢复、跳过、重试、终止和临时插入步骤。
- 支持低风险步骤自动执行，中高风险步骤等待确认。
- 支持 `start_service` 长进程管理。
- 支持 `.aionworkflow` 导入导出预览。
- 支持模板源和信任确认。

主要模块：

- `electron/workflows/registry.js`
- `electron/workflows/schema.js`
- `electron/workflows/runner.js`
- `electron/workflows/stepExecutor.js`
- `electron/workflows/serviceProcessManager.js`
- `electron/workflows/packageService.js`
- `electron/workflows/templateSourceService.js`
- `electron/workflows/trustService.js`

内置模板：

- Flask 本地启动。
- Vite 本地启动。
- Java 构建检查。

验收标准：

- 保存工作流后生成 `workflow.json`、版本文件和 `SKILL.md`。
- 工作流出现在技能列表中。
- 运行时低风险步骤自动执行。
- 中风险/网络/服务步骤等待用户确认。
- 回滚创建新版本，不删除历史。
- 导入包必须先预览并通过信任确认。

### 3.10 备份与恢复

功能目标：

- 支持导出 `.aionbackup`。
- 支持导入前预览内容摘要。
- 支持合并恢复经验、项目、项目画像、Workflow Skill、模板源和用户规则。
- 不导出源码、密钥、`.env`、二进制、embedding、原始截图或完整运行日志。
- 恢复后提示重新索引项目。

主要模块：

- `electron/backup/backupService.js`
- `electron/ipc/backup.js`
- `client/src/panels/BackupTab.jsx`

验收标准：

- 导出的备份包可预览。
- 备份包不包含 API Key。
- 路径穿越和敏感文件被拒绝。
- 恢复时采用合并策略，不覆盖本地项目源码。

### 3.11 最终交付 V4

功能目标：

- 提供完整交付文档。
- 提供 Windows 安装指南。
- 提供用户手册、开发者指南、架构、数据结构、安全策略、测试报告和性能报告。
- 提供 demo 项目与演示脚本。
- 提供 Windows NSIS exe。

交付物：

- `docs/final-delivery/`
- `resources/demos/`
- `resources/workflow-templates/`
- `dist-electron/AgentDev Lite Setup 0.1.0.exe`

验收标准：

- `npm test` 通过。
- `npm run build:client` 通过。
- `npm run electron:build` 通过。
- exe 可安装并启动。
- 首次运行文档、用户手册和演示脚本可用于验收。

## 4. 系统架构

### 4.1 架构分层

- React Renderer：聊天、登录、设置、文件、项目助手、诊断、经验库、技能、备份等 UI。
- Electron Main：IPC 注册、权限控制、文件/工具/模型/诊断/项目/工作流服务。
- Local Services：项目索引、诊断采集、Workflow Runner、备份恢复、技能注册。
- Local Storage：配置、账号、项目、经验、诊断、SQLite 索引、工作流文件。
- Packaged Resources：技能、模板、demo、文档、前端 dist。

### 4.2 IPC 模块

- `auth`：登录注册和会话。
- `config`：模型、权限、工作区配置。
- `chat`：模型对话、工具调用和流式取消。
- `files`：文件浏览、搜索、读取。
- `skills`：技能管理。
- `rules`：用户偏好规则。
- `projects`：项目索引、问答、补丁、画像。
- `diagnostics`：诊断采集、卡片、修复。
- `experiences`：经验库。
- `workflows`：Workflow Skill。
- `backup`：备份导出、预览、恢复。
- `dialog`：目录选择、文件选择、另存为。

## 5. 数据与隐私策略

### 5.1 本地数据

- 配置：`config.json`
- 账号：`auth.json`
- 项目：`projects.json`
- 经验：`experiences.json`
- 诊断：`diagnostics.json`
- 通用数据：`data.json`
- 项目索引：`project-index.sqlite`
- Workflow Skill：本地 workflow skills 目录

### 5.2 隐私边界

- 默认不上传本地项目源码。
- 默认不导出密钥、原始截图、OCR 原文和 embedding。
- 备份包限制文件路径和扩展名。
- Shell、补丁和工作流运行均需要权限和风险确认。

## 6. 测试计划

### 6.1 自动化测试

必须覆盖：

- 登录注册和配置。
- 模型 provider 解析。
- 项目添加、画像、索引、搜索、问答、补丁。
- 诊断检测、经验复用、修复执行。
- Workflow Skill 保存、运行、版本、回滚、导入导出。
- 备份导出、预览、恢复和安全拒绝。
- 打包资源存在性。

当前验证命令：

```powershell
npm test
npm run build:client
npm run electron:build
```

### 6.2 手工验收

- 登录页是否仍存在并可用。
- 设置页可切换 DeepSeek V4 和 Qwen。
- 添加 demo 项目并完成索引。
- 搜索和问答能返回引用来源。
- 粘贴错误文本能生成诊断和经验。
- 运行一个 Workflow Skill 并确认中风险步骤。
- 导出并预览 `.aionbackup`。
- 安装 exe 并完成首次启动。

## 7. 开发阶段计划

### 阶段 A：基础稳定

目标：

- 固化登录、配置、权限、聊天、文件和技能系统。
- 保证新功能不破坏原登录和基础聊天。

验收：

- 登录流程完整。
- 普通模式和完整权限模式明确区分。
- 聊天流式、取消、工具回传正常。

### 阶段 B：项目智能

目标：

- 完成项目注册、画像、SQLite FTS、问答、补丁预览和经验匹配。

验收：

- demo 项目索引成功。
- 搜索/问答来源明确。
- 补丁不越权、不静默写入。

### 阶段 C：诊断与经验

目标：

- 完成错误检测、窗口/区域/手动采集、诊断卡、经验库和修复闭环。

验收：

- 常见 Python / Node / Git / Java 错误可识别。
- 经验复用有效。
- 修复执行后经验状态更新。

### 阶段 D：Workflow Skill

目标：

- 完成工作流草稿、保存、版本、运行、服务管理、模板和包导入导出。

验收：

- 工作流可作为技能出现。
- 低风险自动执行，中高风险确认。
- 导出导入有安全预览。

### 阶段 E：备份与交付

目标：

- 完成 `.aionbackup`、最终交付文档、demo、安装包。

验收：

- 自动化测试通过。
- exe 打包通过。
- 交付文档覆盖安装、使用、开发、测试、限制和安全。

## 8. 后续增强路线

### 8.1 多模态增强

- 接入真正的视觉模型通道。
- 对截图、区域 OCR、错误弹窗进行图像理解。
- 视觉输入必须用户显式授权。

### 8.2 GitHub 交付增强

- 自动创建 release。
- 自动上传 exe 到 GitHub Release。
- 自动生成 changelog。
- 支持 PR 模板和验收清单。

### 8.3 插件市场

- Workflow Skill 模板源从本地 manifest 扩展到远程可信源。
- 支持签名校验、版本约束和回滚。
- 支持用户评分和导入前风险摘要。

### 8.4 更强项目理解

- 支持语义 embedding 和混合检索。
- 支持跨项目经验迁移。
- 支持依赖图、调用图和架构图。
- 支持大型仓库增量索引和索引健康检查。

### 8.5 生产化能力

- 启用代码签名证书。
- 支持自动更新。
- 支持崩溃报告的本地导出。
- 支持 macOS / Linux 适配。

## 9. 风险与控制

| 风险 | 影响 | 控制措施 |
| --- | --- | --- |
| 本地工具误操作 | 破坏用户文件 | 权限模式、路径校验、确认弹窗、补丁预览 |
| 密钥泄露 | 安全事故 | 掩码显示、备份排除、禁止导出敏感文件 |
| OCR 误识别 | 错误诊断 | 保留手动粘贴入口，诊断标注来源 |
| 工作流命令高风险 | 执行不可控 | 风险等级、网络标记、确认步骤、服务管理 |
| 大项目索引慢 | 体验下降 | SQLite FTS、忽略规则、增量索引、文件大小限制 |
| 模型接口变化 | 对话失败 | Base URL 可配置，兼容旧模型名，错误码明确 |

## 10. 交付验收清单

- [ ] 登录、注册、记住密码、自动登录可用。
- [ ] DeepSeek V4 默认模型可保存。
- [ ] Qwen provider 可切换并保存。
- [ ] 普通模式不调用本地工具。
- [ ] 完整权限模式可启用本地工具。
- [ ] 项目添加、画像、索引、搜索、问答可用。
- [ ] 补丁预览和确认应用可用。
- [ ] 诊断助手可手动识别错误。
- [ ] 窗口/区域采集可用或有明确降级提示。
- [ ] 经验库可搜索、复用、导出。
- [ ] Workflow Skill 可保存、运行、回滚、导出。
- [ ] 备份可导出、预览、恢复。
- [ ] 最终交付文档完整。
- [ ] `npm test` 通过。
- [ ] `npm run build:client` 通过。
- [ ] `npm run electron:build` 通过。
- [ ] Windows exe 可安装启动。

## 11. 当前交付状态

截至 2026-05-07，`dev` 分支已包含：

- 项目索引 V2。
- 诊断助手与经验库。
- Workflow Skill V3。
- 最终交付 V4 文档与 demo。
- DeepSeek V4 和 Qwen 模型配置。
- `.aionbackup` 备份恢复。
- Windows Electron 打包。

最近一次验证结果：

- `npm test`：24 个测试文件通过，109 个测试通过。
- `npm run build:client`：通过。
- `npm run electron:build`：通过。
- exe：`dist-electron/AgentDev Lite Setup 0.1.0.exe`

## 12. 结论

Agent Platform 当前已经具备完整本地 Agent 平台的核心闭环：

登录进入平台，配置模型与权限，添加项目并索引，围绕项目问答和修复，观察错误并生成诊断经验，将重复流程沉淀为 Workflow Skill，最后通过备份、文档和 Windows 安装包完成交付。

下一阶段重点不应是继续堆叠入口，而应围绕三件事提升质量：

- 更可靠的多模态错误理解。
- 更严格的工作流安全与模板信任体系。
- 更顺滑的 GitHub Release 和安装包发布流程。
