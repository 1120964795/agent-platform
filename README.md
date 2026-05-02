# AgentDev Lite

AgentDev Lite is an Electron desktop assistant. This build adds a Windows-only companion diagnostics system for development terminals: after the user explicitly authorizes a window or a screen region, the app observes terminal output, detects common development errors, creates diagnosis cards, auto-saves experience cards, and suggests reusing past fixes when similar errors appear again.

## What Was Added

This implementation focuses on the V1 companion diagnostics scope:

- Windows only.
- Development scenarios only.
- User must manually start observation.
- Observe only the user-selected window or region.
- Default interval: `5000ms`, options: `3000ms`, `5000ms`, `10000ms`.
- Window mode: UI Automation first, OCR fallback.
- Region mode: OCR only.
- Raw screenshots are not stored.
- Diagnosis is rule-based first.
- Model explanation is only requested when the user clicks `详细解释`.
- Fix commands always require user confirmation.
- High-risk download/script commands follow a stronger confirmation policy.
- Experience cards are auto-saved only after a diagnosis card is created.

## Diagnostics Workflow

1. Open the app and log in.
2. Open `设置` and configure the DeepSeek API key if you want model explanation and reuse-plan rewriting.
3. Switch to `完全权限` if you want local shell execution and diagnostics automation.
4. Click the top-bar `诊断` button.
5. In the diagnostics panel:
   - Click `刷新窗口` to list terminal windows, or
   - Click `框选区域` to select a screen region.
6. Set `项目目录` and choose the interval.
7. Click `开始观察`.
8. Trigger a known development error in the observed target.
9. Review the generated diagnosis card.
10. Click `确认执行` for a recommended fix, or `详细解释` for a model explanation, or `复用上次方案` if there is a matching experience card.

## Supported Error Types

Current rule-based detection covers:

- Python `ModuleNotFoundError`
- Node `Cannot find module`
- npm `ERR! code ...`
- Port in use (`EADDRINUSE`)
- Git merge conflicts
- Java command not found (`java`, `javac`, `mvn`, `gradle`)
- Java class not found / main class not found
- Java unsupported class version
- Maven build failure
- Gradle build failure
- Generic shell command not found
- `ENOENT`

## Risk Policy

- All diagnosis fix commands require explicit confirmation.
- High-risk fixes use a dedicated `Yes / No` confirmation with default `No`.
- `advancedRiskExecutionEnabled` defaults to `false`.
- When advanced mode is off:
  - non-HTTPS downloads are blocked,
  - `.bat` and `.ps1` downloads are blocked,
  - download-and-execute chains are blocked.
- Extreme-risk commands remain blocked.

## Data Files

App data lives under Electron `userData`:

- `data/config.json`
- `data/data.json`
- `data/auth.json`
- `data/experiences.json`
- `data/diagnostics.json`
- `skills/`
- `user_rules.md`

## Packaging Outputs

Build outputs after `npm run electron:build` or `npx electron-builder --win portable`:

- Installer: `dist-electron/AgentDev Lite Setup 0.1.0.exe`
- Portable exe: `dist-electron/AgentDev Lite 0.1.0.exe`

The latest portable build was also copied to:

- `C:\Users\DELL2024\Desktop\AgentDev Lite 0.1.0.exe`

## Commands

Install dependencies:

```powershell
npm run setup
```

Run Electron in development mode:

```powershell
npm run electron:dev
```

Run tests:

```powershell
npm test
```

Build the client only:

```powershell
npm --prefix client run build
```

Build the Windows installer:

```powershell
npm run electron:build
```

Build the portable exe:

```powershell
npx electron-builder --win portable
```

## How To Use Companion Diagnostics

### 1. Configure settings

- Open `设置`.
- Fill in the DeepSeek API key if you want `详细解释` and reuse-plan rewriting.
- Switch to `完全权限`.
- Optionally enable `高级风险执行模式`.

### 2. Start observing

- Click the top-bar `诊断` button.
- Click `刷新窗口` and select a terminal window, or click `框选区域`.
- Fill in the project directory.
- Click `开始观察`.

### 3. Trigger a known error

Examples:

```powershell
Write-Output "ModuleNotFoundError: No module named flask"
```

```powershell
Write-Output "Error: Cannot find module 'vite'"
```

```powershell
Write-Output "'javac' is not recognized as an internal or external command"
```

### 4. Use diagnosis cards

Each diagnosis card shows:

- original error snippet,
- rule-based meaning,
- possible causes,
- recommended fixes,
- matched past experiences,
- optional model explanation.

### 5. Use experience cards

Open the `经验` tab to:

- search experiences,
- filter by status,
- edit title / cause / notes / steps,
- delete cards,
- export all experiences as JSON.

## Implementation Map

### Updated Files

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

### New Main-Process Diagnostics Files

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

### New Renderer Files

- `client/src/hooks/useDiagnostics.js`
- `client/src/components/chat/DiagnosisCard.jsx`
- `client/src/components/chat/ExperienceCard.jsx`
- `client/src/panels/DiagnosticsPanel.jsx`
- `client/src/panels/ExperienceLibraryPanel.jsx`
- `client/src/popup/CompanionPopup.jsx`

### New Tests

- `electron/__tests__/diagnostics-store.test.js`
- `electron/__tests__/diagnostics-detector.test.js`
- `electron/__tests__/diagnostics-lifecycle.test.js`
- `electron/__tests__/diagnostics-ipc.test.js`
- `electron/__tests__/companion-popup.test.js`
- `electron/__tests__/diagnostics-region.test.js`
- `electron/__tests__/diagnostics-collectors.test.js`

## File Responsibilities

### Main process

- `errorDetector.js`: rule-based text-to-error detection.
- `experienceMatcher.js`: keyword/signature similarity matching.
- `executionPlanService.js`: risk classification and execution plan normalization.
- `diagnosisService.js`: diagnosis generation, auto-save experience, fix result persistence, model client helpers.
- `observerSessionManager.js`: session lifecycle, dedupe, ignore cache, cooldown, repeated-failure pause.
- `windowTargetService.js`: enumerate observable windows with thumbnails.
- `regionSelectionService.js`: transparent overlay for region selection.
- `uiaCollector.js`: Windows UI Automation text capture.
- `ocrCollector.js`: OCR over captured window or region images.
- `companionPopupManager.js`: top-right queued popup notifications.
- `companionService.js`: orchestration entry point for collection, detection, popup emission, diagnosis persistence.

### IPC

- `diagnostics.js`: observer lifecycle, diagnosis retrieval, fix execution, explain, rewrite plan, popup actions.
- `experiences.js`: experience CRUD, search, export.
- `dialog.js`: extended to support saving generated JSON content directly.
- `config.js`: extended to persist `advancedRiskExecutionEnabled`.

### Renderer

- `useDiagnostics.js`: subscribes to diagnostics events and exposes diagnostics state/actions.
- `DiagnosticsPanel.jsx`: target selection, session controls, diagnostics list.
- `ExperienceLibraryPanel.jsx`: searchable/editable/exportable experience library.
- `DiagnosisCard.jsx`: explain / execute / reuse interactions.
- `ExperienceCard.jsx`: editable experience display.
- `CompanionPopup.jsx`: popup window UI for queued notifications.
- `TopBar.jsx`: diagnostics and experience entry buttons plus status indicator.
- `Layout.jsx` / `RightDrawer.jsx`: diagnostics tab wiring.
- `ChatArea.jsx` / `MessageList.jsx`: inject diagnosis/experience cards into the chat stream.

## Verification Completed

The following commands were executed successfully during this implementation:

```powershell
npm test
npm --prefix client run build
npm run electron:build
npx electron-builder --win portable
```

## Notes

- OCR now uses `tesseract.js` in the main process.
- Region mode does not persist raw screenshots.
- The popup uses the same renderer build with `?popup=1`.
- The app is not code-signed, so Windows SmartScreen may show a warning before launch.

## Manual Acceptance Checklist

- exe 安装后首次启动能看到 5 个内置 skill。
- 给本地 pdf 路径说“总结这个文件”。
- 说“帮我装 uv”。
- 说“删掉 D:\temp”。
- 说“写一份关于 XX 的 Word 报告”。
- 切到 `normal` 模式。
- 自己写 `SKILL.md` 放到用户 `skills/` 目录。
- `user_rules.md` 新增规则。
