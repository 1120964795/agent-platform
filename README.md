# AgentDev Lite

AgentDev Lite 是一款 Electron 桌面助手。本版本为开发终端加入了仅支持 Windows 的伴随诊断系统：在用户明确授权某个窗口或屏幕区域后，应用会观察终端输出、检测常见开发错误、生成诊断卡片、自动保存经验卡片，并在之后遇到相似错误时建议复用历史修复方案。

## 新增内容

本次实现聚焦于 V1 伴随诊断范围：

- 仅支持 Windows。
- 仅面向开发场景。
- 用户必须手动开始观察。
- 只观察用户选择的窗口或区域。
- 默认观察间隔为 `5000ms`，可选 `3000ms`、`5000ms`、`10000ms`。
- 窗口模式：优先使用 UI Automation，失败时回退到 OCR。
- 区域模式：仅使用 OCR。
- 不存储原始截图。
- 诊断优先基于规则生成。
- 只有当用户点击 `详细解释` 时，才会请求模型解释。
- 修复命令始终需要用户确认。
- 高风险下载或脚本命令遵循更严格的确认策略。
- 只有在创建诊断卡片后，才会自动保存经验卡片。

## 诊断流程

1. 打开应用并登录。
2. 打开 `设置`，如果需要模型解释和复用方案重写，请配置 DeepSeek API key。
3. 如果需要本地 shell 执行和诊断自动化，请切换到 `完全权限`。
4. 点击顶部栏的 `诊断` 按钮。
5. 在诊断面板中：
   - 点击 `刷新窗口` 列出终端窗口，或
   - 点击 `框选区域` 选择屏幕区域。
6. 设置 `项目目录` 并选择观察间隔。
7. 点击 `开始观察`。
8. 在被观察目标中触发一个已知开发错误。
9. 查看生成的诊断卡片。
10. 点击 `确认执行` 执行推荐修复，或点击 `详细解释` 获取模型解释；如果存在匹配的经验卡片，也可以点击 `复用上次方案`。

## 支持的错误类型

当前基于规则的检测覆盖：

- Python `ModuleNotFoundError`
- Node `Cannot find module`
- npm `ERR! code ...`
- 端口占用 (`EADDRINUSE`)
- Git 合并冲突
- Java 命令不存在 (`java`、`javac`、`mvn`、`gradle`)
- Java 类不存在 / 主类不存在
- Java 类版本不兼容
- Maven 构建失败
- Gradle 构建失败
- 通用 shell 命令不存在
- `ENOENT`

## 风险策略

- 所有诊断修复命令都需要明确确认。
- 高风险修复会使用专门的 `Yes / No` 确认，并默认选择 `No`。
- `advancedRiskExecutionEnabled` 默认为 `false`。
- 当高级模式关闭时：
  - 阻止非 HTTPS 下载；
  - 阻止 `.bat` 和 `.ps1` 下载；
  - 阻止“下载后执行”的命令链。
- 极高风险命令始终会被阻止。

## 数据文件

应用数据位于 Electron 的 `userData` 目录下：

- `data/config.json`
- `data/data.json`
- `data/auth.json`
- `data/experiences.json`
- `data/diagnostics.json`
- `skills/`
- `user_rules.md`

## 打包产物

运行 `npm run electron:build` 或 `npx electron-builder --win portable` 后会生成：

- 安装包：`dist-electron/AgentDev Lite Setup 0.1.0.exe`
- 便携版 exe：`dist-electron/AgentDev Lite 0.1.0.exe`

最新的便携版构建也已复制到：

- `C:\Users\DELL2024\Desktop\AgentDev Lite 0.1.0.exe`

## 命令

安装依赖：

```powershell
npm run setup
```

以开发模式运行 Electron：

```powershell
npm run electron:dev
```

运行测试：

```powershell
npm test
```

仅构建客户端：

```powershell
npm --prefix client run build
```

构建 Windows 安装包：

```powershell
npm run electron:build
```

构建便携版 exe：

```powershell
npx electron-builder --win portable
```

## 如何使用伴随诊断

### 1. 配置设置

- 打开 `设置`。
- 如果需要 `详细解释` 和复用方案重写，请填写 DeepSeek API key。
- 切换到 `完全权限`。
- 可选：启用 `高级风险执行模式`。

### 2. 开始观察

- 点击顶部栏的 `诊断` 按钮。
- 点击 `刷新窗口` 并选择一个终端窗口，或点击 `框选区域`。
- 填写项目目录。
- 点击 `开始观察`。

### 3. 触发已知错误

示例：

```powershell
Write-Output "ModuleNotFoundError: No module named flask"
```

```powershell
Write-Output "Error: Cannot find module 'vite'"
```

```powershell
Write-Output "'javac' is not recognized as an internal or external command"
```

### 4. 使用诊断卡片

每张诊断卡片会展示：

- 原始错误片段；
- 基于规则识别出的含义；
- 可能原因；
- 推荐修复；
- 匹配到的历史经验；
- 可选的模型解释。

### 5. 使用经验卡片

打开 `经验` 标签页后可以：

- 搜索经验；
- 按状态筛选；
- 编辑标题 / 原因 / 备注 / 步骤；
- 删除卡片；
- 将所有经验导出为 JSON。

## 实现地图

### 已更新文件

- `package.json`
- `package-lock.json`
- `client/package-lock.json`
- `electron/store.js`
- `electron/main.js`
- `electron/confirm.js`
- `electron/ipc/config.js`
- `electron/ipc/dialog.js`
- `electron/ipc/index.js`
- `electron/tools/shell.js`
- `client/src/App.jsx`
- `client/src/lib/api.js`
- `client/src/panels/SettingsPanel.jsx`
- `client/src/components/chat/ChatArea.jsx`
- `client/src/components/chat/MessageList.jsx`
- `client/src/components/layout/Layout.jsx`
- `client/src/components/layout/MainArea.jsx`
- `client/src/components/layout/RightDrawer.jsx`
- `client/src/components/layout/TopBar.jsx`

### 新增主进程诊断文件

- `electron/services/diagnostics/errorDetector.js`
- `electron/services/diagnostics/experienceMatcher.js`
- `electron/services/diagnostics/executionPlanService.js`
- `electron/services/diagnostics/diagnosisService.js`
- `electron/services/diagnostics/observerSessionManager.js`
- `electron/services/diagnostics/windowTargetService.js`
- `electron/services/diagnostics/regionSelectionService.js`
- `electron/services/diagnostics/uiaCollector.js`
- `electron/services/diagnostics/ocrCollector.js`
- `electron/services/diagnostics/companionPopupManager.js`
- `electron/services/diagnostics/companionService.js`
- `electron/services/diagnostics/index.js`
- `electron/ipc/diagnostics.js`
- `electron/ipc/experiences.js`
- `electron/region-selection-preload.js`

### 新增渲染进程文件

- `client/src/hooks/useDiagnostics.js`
- `client/src/components/chat/DiagnosisCard.jsx`
- `client/src/components/chat/ExperienceCard.jsx`
- `client/src/panels/DiagnosticsPanel.jsx`
- `client/src/panels/ExperienceLibraryPanel.jsx`
- `client/src/popup/CompanionPopup.jsx`

### 新增测试

- `electron/__tests__/diagnostics-store.test.js`
- `electron/__tests__/diagnostics-detector.test.js`
- `electron/__tests__/diagnostics-lifecycle.test.js`
- `electron/__tests__/diagnostics-ipc.test.js`
- `electron/__tests__/companion-popup.test.js`
- `electron/__tests__/diagnostics-region.test.js`
- `electron/__tests__/diagnostics-collectors.test.js`

## 文件职责

### 主进程

- `errorDetector.js`：基于规则将文本检测为错误。
- `experienceMatcher.js`：基于关键词和签名相似度进行匹配。
- `executionPlanService.js`：风险分级和执行方案规范化。
- `diagnosisService.js`：生成诊断、自动保存经验、持久化修复结果，以及提供模型客户端辅助能力。
- `observerSessionManager.js`：会话生命周期、去重、忽略缓存、冷却时间、重复失败暂停。
- `windowTargetService.js`：枚举可观察窗口并提供缩略图。
- `regionSelectionService.js`：用于区域选择的透明覆盖层。
- `uiaCollector.js`：通过 Windows UI Automation 采集文本。
- `ocrCollector.js`：对捕获的窗口或区域图像执行 OCR。
- `companionPopupManager.js`：右上角队列式弹窗通知。
- `companionService.js`：采集、检测、弹窗发送和诊断持久化的编排入口。

### IPC

- `diagnostics.js`：观察器生命周期、诊断获取、修复执行、解释、重写方案、弹窗操作。
- `experiences.js`：经验的增删改查、搜索、导出。
- `dialog.js`：扩展为支持直接保存生成的 JSON 内容。
- `config.js`：扩展为持久化 `advancedRiskExecutionEnabled`。

### 渲染进程

- `useDiagnostics.js`：订阅诊断事件，并暴露诊断状态和操作。
- `DiagnosticsPanel.jsx`：目标选择、会话控制、诊断列表。
- `ExperienceLibraryPanel.jsx`：可搜索、可编辑、可导出的经验库。
- `DiagnosisCard.jsx`：解释 / 执行 / 复用交互。
- `ExperienceCard.jsx`：可编辑的经验展示。
- `CompanionPopup.jsx`：队列通知弹窗窗口 UI。
- `TopBar.jsx`：诊断和经验入口按钮，以及状态指示器。
- `Layout.jsx` / `RightDrawer.jsx`：诊断标签页接入。
- `ChatArea.jsx` / `MessageList.jsx`：向聊天流注入诊断卡片和经验卡片。

## 已完成验证

本次实现期间，下列命令已成功执行：

```powershell
npm test
npm --prefix client run build
npm run electron:build
npx electron-builder --win portable
```

## 备注

- OCR 现在在主进程中使用 `tesseract.js`。
- 区域模式不会持久化原始截图。
- 弹窗使用同一份渲染进程构建，并通过 `?popup=1` 加载。
- 应用未进行代码签名，因此 Windows SmartScreen 可能会在启动前显示警告。

## 手动验收清单

- exe 安装后首次启动能看到 5 个内置 skill。
- 给本地 pdf 路径说“总结这个文件”。
- 说“帮我装 uv”。
- 说“删掉 D:\temp”。
- 说“写一份关于 XX 的 Word 报告”。
- 切到 `normal` 模式。
- 自己写 `SKILL.md` 放到用户 `skills/` 目录。
- `user_rules.md` 新增规则。
