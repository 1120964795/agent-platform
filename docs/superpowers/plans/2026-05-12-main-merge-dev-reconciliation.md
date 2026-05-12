# Main and Merge Dev Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one reconciled AionUi version from `g-sleeper/main` and `g-sleeper/merge-dev-xulinjie-liushuai` that keeps DeepSeek-only product direction, full Browser Use runtime install/repair, full Desktop/Computer Use, teammate chat/artifact polish, and improved Office artifacts.

**Architecture:** Create a fresh integration branch from `g-sleeper/main`, then reconcile by module rather than direct unrelated-history merge. Remove Qwen/Doubao active provider paths, transplant Browser Use installer and artifact management from the teammate branch, preserve Desktop/Computer Use from `main`, and merge UI files by behavior with targeted tests after each task group.

**Tech Stack:** Electron 33, React/Vite, CommonJS Electron services, Vitest, electron-builder NSIS, Python 3.11+, browser-use, Playwright, Selenium, better-sqlite3, docx, pptxgenjs.

---

## Scope Check

This plan covers several tightly connected subsystems, but they must ship as one integration because the same files connect model configuration, runtime supervision, chat plugin mode, Settings, and artifacts. Execute tasks in order. Do not start with a raw `git merge --allow-unrelated-histories`; the branches have no merge base and that path creates broad add/add conflicts.

## File Structure

- Modify `package.json`: keep `main` desktop-use workspace/resource, add teammate native rebuild scripts and Browser Use installer NSIS include.
- Modify `package-lock.json`: update only through `npm install` or `npm install --package-lock-only` if dependency metadata changes.
- Create `build/installer.nsh`: NSIS post-install hook for Browser Use dependency setup.
- Modify `scripts/prepare-bridges.js`: keep desktop-use packaging and copy Browser Use Python bridge without build-time Python dependency installs.
- Modify `server/browser-use-bridge/requirements.txt`: include Browser Use, FastAPI, Playwright, Selenium runtime dependencies.
- Keep `server/desktop-use-bridge/**`: preserve `main` desktop-use bridge, event stream, planner, runner, driver, translator, and tests.
- Create `electron/services/pythonRuntimeInstaller.js`: Browser Use dependency installer with staging, validation, rollback, and compatible Python discovery.
- Modify `electron/services/pythonBootstrap.js`: installer-aware Python and dependency detection.
- Modify `electron/services/browserUse/index.js`: expose Browser Use repair via installer.
- Modify `electron/services/bridgeSupervisor.js`: combine Browser Use Python dependency env and `main` desktop-use supervisor.
- Modify `electron/main.js`: installer-only mode plus existing overlay and supervisor startup.
- Modify `electron/store.js`: DeepSeek/Browser Use/Desktop Use config, deprecated provider stripping, artifact deletion/restoration.
- Modify `electron/ipc/config.js`: accept DeepSeek, Browser Use, and Desktop Use config fields only.
- Modify `electron/ipc/runtime.js`: runtime status/bootstrap without Qwen/Doubao and with Browser Use repair.
- Modify `electron/ipc/setupStatus.js`: setup readiness for DeepSeek, Browser Use, Desktop Use, Python deps, and bridge state.
- Modify `electron/ipc/artifacts.js`: add delete behavior and warnings.
- Modify `client/src/lib/api.js`: add artifact deletion and preserve runtime/chat APIs.
- Modify `client/src/pages/SettingsPage.jsx`: use `main` runtime/settings structure, add teammate Artifacts tab, remove Qwen/Doubao, localize active sections.
- Modify `client/src/components/WelcomeSetupDialog.jsx`: keep `main` multi-step flow, remove Qwen/Doubao, show Browser Use dependency readiness and Desktop Use setup.
- Modify `client/src/components/chat/*` and `client/src/hooks/useChat.js`: teammate UI base plus `main` plugin/approval/progress/cancel/ask-user behavior.
- Create `electron/services/officeArtifactPlanner.js`: internal Office Artifact quality planning layer for Word/PPT generation.
- Modify `electron/services/docxGen.js` if present, `electron/services/pptxGen.js`, and `electron/tools/docs.js`: use Office Artifact layer for structured Word/PPT outputs and artifact metadata.
- Add resources under `resources/skills/word-writer/templates/`: keep teammate Word templates.
- Update tests under `electron/__tests__`, `client/src/**.test.js`, and `server/desktop-use-bridge/__tests__`.
- Update docs: `README.md`, `docs/USER_MANUAL.md`, `docs/runtime-setup.md`, `docs/demo-script.md`, `docs/test-report.md`.

## Task 0: Prepare Integration Branch

**Files:**
- No source edits expected.

- [ ] **Step 1: Verify refs and clean state**

Run:

```bash
git fetch https://github.com/g-sleeper/agent-platform.git main:refs/remotes/g-sleeper/main merge-dev-xulinjie-liushuai:refs/remotes/g-sleeper/merge-dev-xulinjie-liushuai
git status --short --branch
git rev-parse g-sleeper/main g-sleeper/merge-dev-xulinjie-liushuai
```

Expected:

```text
working tree has no unstaged source edits
g-sleeper/main resolves to the latest main branch commit
g-sleeper/merge-dev-xulinjie-liushuai resolves to the teammate branch commit
```

- [ ] **Step 2: Create the integration branch from main**

Run:

```bash
git switch -c reconcile-main-merge-dev g-sleeper/main
```

Expected: `git status --short --branch` prints `## reconcile-main-merge-dev`.

- [ ] **Step 3: Record source commits**

Run:

```bash
git rev-parse g-sleeper/main > .git/reconcile-main.sha
git rev-parse g-sleeper/merge-dev-xulinjie-liushuai > .git/reconcile-merge-dev.sha
```

Expected: both files under `.git/` are created and are not tracked by Git.

## Task 1: Provider Cleanup Foundation

**Files:**
- Modify: `electron/store.js`
- Modify: `electron/services/models/modelTypes.js`
- Delete: `electron/services/models/qwenProvider.js`
- Delete: `electron/services/doubao.js`
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/config.js`
- Modify: `electron/ipc/runtime.js`
- Modify: `electron/ipc/setupStatus.js`
- Modify: `client/src/components/chat/ModelSelector.jsx`
- Modify: `client/src/components/runtime/RuntimeCard.jsx`
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/panels/SettingsPanel.jsx`
- Test: `electron/__tests__/store.test.js`
- Test: `electron/__tests__/ipc.test.js`
- Test: `electron/__tests__/runtime-ipc.test.js`
- Test: `electron/__tests__/setup-status-ipc.test.js`
- Test: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add provider cleanup tests**

In `electron/__tests__/store.test.js`, add these tests near the config tests:

```js
test('config defaults expose DeepSeek Browser Use and Desktop Use but not Qwen or Doubao', () => {
  const config = store.getConfig()
  expect(config.deepseekApiKey).toBe('')
  expect(config.browserUseApiKey).toBe('')
  expect(config.browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.desktopUseApiKey).toBe('')
  expect(config.desktopUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(config.desktopUseAllowBrowserFallback).toBe(true)
  expect(config).not.toHaveProperty('qwenApiKey')
  expect(config).not.toHaveProperty('qwenVisionApiKey')
  expect(config).not.toHaveProperty('doubaoVisionApiKey')
})

test('deprecated Qwen and Doubao config fields are stripped from config and masked config', () => {
  store.setConfig({
    qwenApiKey: 'sk-qwen',
    qwenBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwenPrimaryModel: 'qwen-max-latest',
    qwenCodingModel: 'qwen3-coder-plus',
    qwenVisionEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    qwenVisionApiKey: 'sk-qwen-vl',
    qwenVisionModel: 'qwen3-vl-plus',
    doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
    doubaoVisionApiKey: 'sk-doubao',
    doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
    browserUseApiKey: 'sk-ai-v1-browser-use'
  })

  const config = store.getConfig()
  const masked = store.getMaskedConfig()
  expect(config.browserUseApiKey).toBe('sk-ai-v1-browser-use')
  for (const key of ['qwenApiKey', 'qwenVisionApiKey', 'doubaoVisionApiKey']) {
    expect(config).not.toHaveProperty(key)
    expect(masked).not.toHaveProperty(key)
  }
})
```

In `electron/__tests__/runtime-ipc.test.js`, add:

```js
test('runtime status does not expose removed Qwen or Doubao runtimes', async () => {
  const ipcMain = ipc()
  runtime.register(ipcMain)
  const status = await ipcMain.handlers.get('runtime:status')({})
  expect(status.runtimes.map((item) => item.runtime)).not.toContain('qwen')
  expect(status.runtimes.map((item) => item.runtime)).not.toContain('doubao')
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- electron/__tests__/store.test.js electron/__tests__/runtime-ipc.test.js
```

Expected: FAIL because `main` still exposes Qwen/Doubao config and runtime status.

- [ ] **Step 3: Update store defaults and deprecated stripping**

In `electron/store.js`, keep Desktop Use defaults from `main`, add the teammate deprecated-field cleanup, and make these exact structures present:

```js
const DEPRECATED_CONFIG_KEYS = new Set([
  'qwenApiKey',
  'qwenBaseUrl',
  'qwenPrimaryModel',
  'qwenCodingModel',
  'qwenVisionEndpoint',
  'qwenVisionApiKey',
  'qwenVisionModel',
  'doubaoVisionEndpoint',
  'doubaoVisionApiKey',
  'doubaoVisionModel'
])

const DEFAULT_CONFIG = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  fallbackProvider: '',
  fallbackModel: 'deepseek-chat',
  deepseekApiKey: '',
  deepseekEndpoint: 'https://api.deepseek.com',
  deepseekChatEndpoint: 'https://api.deepseek.com',
  deepseekPlannerModel: 'deepseek-chat',
  deepseekCodingModel: 'deepseek-coder',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseApiKey: '',
  browserUseModel: 'openai/gpt-5.5',
  browserUseVisionEnabled: true,
  browserUseHeadless: false,
  desktopUseEndpoint: 'https://zenmux.ai/api/v1',
  desktopUseApiKey: '',
  desktopUseModel: 'openai/gpt-5.5',
  desktopUseGroundingBackend: 'manual-coordinate',
  desktopUseAllowBrowserFallback: true,
  dryRunEnabled: true,
  visionLoopEnabled: true,
  auditRetentionDays: 30,
  workspaceRoot: GENERATED_DIR,
  permissionMode: 'ask',
  enableSkills: true,
  activeSkills: [],
  welcomeShown: false
}

function stripDeprecatedConfigKeys(config = {}) {
  const next = { ...config }
  for (const key of DEPRECATED_CONFIG_KEYS) delete next[key]
  return next
}
```

Ensure `getConfig()`, `setConfig()`, and `getMaskedConfig()` use `stripDeprecatedConfigKeys()`. `getMaskedConfig()` must mask `apiKey`, `deepseekApiKey`, `browserUseApiKey`, and `desktopUseApiKey` only.

- [ ] **Step 4: Simplify model provider constants**

In `electron/services/models/modelTypes.js`, make `MODEL_PROVIDERS` DeepSeek-only:

```js
const MODEL_PROVIDERS = Object.freeze({
  DEEPSEEK: 'deepseek'
})
```

Ensure all `ROLE_REQUIREMENTS` entries allow and default to `MODEL_PROVIDERS.DEEPSEEK`. Remove Qwen constants from exports.

- [ ] **Step 5: Remove Qwen/Doubao active service files**

Run:

```bash
git rm electron/services/models/qwenProvider.js electron/services/doubao.js
```

Expected: both files are staged for deletion.

- [ ] **Step 6: Update agent loop provider selection**

In `electron/services/agentLoop.js`, remove `require('./doubao')` and make legacy Doubao model ids route to DeepSeek for compatibility:

```js
function getProvider(modelId, deps = {}) {
  const deepseek = deps.deepseek || require('./deepseek')
  const resolvedModel = modelId && modelId.startsWith('deepseek') ? modelId : undefined
  return { model: resolvedModel || 'deepseek-chat', chat: deepseek.chat }
}
```

If the file already has a richer `getProvider()` signature, preserve its signature and replace only the branch that selects Qwen/Doubao with the DeepSeek fallback above.

- [ ] **Step 7: Update runtime and setup IPC**

In `electron/ipc/runtime.js`, remove `qwenProvider` import and Qwen runtime entries. Runtime status should include at least:

```js
const browserUse = require('../services/browserUse')

function listRuntimes(config = store.getConfig()) {
  return [
    { runtime: 'deepseek', state: config.deepseekApiKey ? 'ready' : 'needs-configuration', configured: Boolean(config.deepseekApiKey) },
    { runtime: 'browser-use', state: 'managed-by-supervisor', configured: Boolean(config.browserUseApiKey) },
    { runtime: 'desktop-use', state: 'managed-by-supervisor', configured: Boolean(config.desktopUseApiKey || (config.desktopUseAllowBrowserFallback !== false && config.browserUseApiKey)) },
    { runtime: 'dry-run', state: config.dryRunEnabled ? 'ready' : 'disabled', configured: Boolean(config.dryRunEnabled) }
  ]
}

async function bootstrapRuntime(runtime) {
  if (runtime === 'browser-use') return browserUse.repair()
  if (runtime === 'dry-run') return { runtime: 'dry-run', state: 'ready' }
  throw new Error(`Unsupported runtime ${runtime}`)
}
```

Keep existing IPC handler names and exports intact.

- [ ] **Step 8: Run targeted provider cleanup tests**

Run:

```bash
npm test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: tests either pass or fail only on UI files not yet reconciled in later tasks. Backend provider cleanup assertions must pass before committing.

- [ ] **Step 9: Commit provider cleanup**

Run:

```bash
git add electron/store.js electron/services/models/modelTypes.js electron/services/agentLoop.js electron/ipc/config.js electron/ipc/runtime.js electron/ipc/setupStatus.js electron/__tests__/store.test.js electron/__tests__/ipc.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js
git add -u electron/services/models/qwenProvider.js electron/services/doubao.js
git commit -m "refactor: remove qwen and doubao active providers"
```

## Task 2: Browser Use Runtime Installer and Packaging

**Files:**
- Create: `build/installer.nsh`
- Create: `electron/services/pythonRuntimeInstaller.js`
- Modify: `electron/services/pythonBootstrap.js`
- Modify: `electron/services/browserUse/index.js`
- Modify: `electron/services/bridgeSupervisor.js`
- Modify: `electron/main.js`
- Modify: `electron/ipc/runtime.js`
- Modify: `electron/ipc/setupStatus.js`
- Modify: `package.json`
- Modify: `scripts/prepare-bridges.js`
- Modify: `server/browser-use-bridge/requirements.txt`
- Test: `electron/__tests__/python-runtime-installer.test.js`
- Test: `electron/__tests__/python-bootstrap.test.js`
- Test: `electron/__tests__/bridge-supervisor.test.js`
- Test: `electron/__tests__/runtime-ipc.test.js`
- Test: `electron/__tests__/setup-status-ipc.test.js`
- Test: `electron/__tests__/packaging.test.js`

- [ ] **Step 1: Restore teammate installer files into a scratch diff**

Run:

```bash
git show g-sleeper/merge-dev-xulinjie-liushuai:electron/services/pythonRuntimeInstaller.js > .git/reconcile-pythonRuntimeInstaller.js
git show g-sleeper/merge-dev-xulinjie-liushuai:electron/__tests__/python-runtime-installer.test.js > .git/reconcile-python-runtime-installer.test.js
```

Expected: both scratch files exist under `.git/`.

- [ ] **Step 2: Add installer service and tests**

Copy the scratch file contents into:

- `electron/services/pythonRuntimeInstaller.js`
- `electron/__tests__/python-runtime-installer.test.js`

Verify the service exports exactly these names:

```js
module.exports = {
  REQUIRED_IMPORTS,
  buildInstallerEnv,
  createStagingDepsPath,
  findCompatiblePython,
  getUserPythonDepsPath,
  installBrowserRuntime,
  normalizeRuntimePermissions,
  publishStagedDeps,
  validateBrowserRuntime,
  versionSupported
}
```

Verify `REQUIRED_IMPORTS` includes:

```js
[
  { key: 'browserUse', code: 'import browser_use' },
  { key: 'playwright', code: 'from playwright.sync_api import sync_playwright' },
  { key: 'selenium', code: 'import selenium' },
  { key: 'fastapi', code: 'import fastapi' }
]
```

- [ ] **Step 3: Add NSIS installer hook**

Create `build/installer.nsh`:

```nsh
!macro customInstall
  DetailPrint "Preparing browser runtime dependencies..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --install-browser-runtime --silent' $0
  DetailPrint "Browser runtime dependency setup exit code: $0"
!macroend
```

- [ ] **Step 4: Merge package scripts and resources**

In `package.json`, keep `main` workspace entries:

```json
"workspaces": [
  "server/uitars-bridge",
  "server/desktop-use-bridge"
]
```

Add or preserve these scripts:

```json
"rebuild:native:node": "npm rebuild better-sqlite3",
"rebuild:native:electron": "electron-rebuild -f -w better-sqlite3",
"electron:dev": "npm run rebuild:native:electron && concurrently -n client,electron -c magenta,yellow \"npm --prefix client run dev\" \"node -e \\\"setTimeout(function(){require('child_process').execSync('electron .',{stdio:'inherit'});},3000)\\\"\"",
"electron:build": "npm run build:client && npm run build:bridges && npm run rebuild:native:electron && electron-builder --win",
"postinstall": "npm run rebuild:native:electron",
"test": "npm run rebuild:native:node && vitest run",
"test:watch": "npm run rebuild:native:node && vitest"
```

In `build.nsis`, include:

```json
"include": "build/installer.nsh"
```

Keep this `extraResources` entry from `main`:

```json
{
  "from": "dist-bridges/desktop-use-bridge",
  "to": "server/desktop-use-bridge"
}
```

- [ ] **Step 5: Update bridge preparation**

In `scripts/prepare-bridges.js`, keep the Node bridge copy logic for `uitars-bridge` and `desktop-use-bridge`. Replace the Browser Use Python section with:

```js
// Python bridge: copy source. The app installer prepares Python deps in user app data.
const pySrc = path.join(SRC_ROOT, 'browser-use-bridge')
const pyFinal = path.join(STAGING_ROOT, 'browser-use-bridge')
if (fs.existsSync(pySrc)) {
  copyDir(pySrc, pyFinal, ['__tests__', '__pycache__', '.venv', 'venv', '.deps'])
  process.stdout.write('[prepare-bridges] browser-use Python deps will be installed by the app installer runtime setup\n')
} else {
  process.stderr.write(`[prepare-bridges] missing Python bridge source: ${pySrc}\n`)
}
```

- [ ] **Step 6: Update Browser Use requirements**

Set `server/browser-use-bridge/requirements.txt` to:

```txt
browser-use>=0.10.0
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
pydantic>=2.0.0
playwright>=1.40.0
selenium>=4.20.0
```

- [ ] **Step 7: Make Python bootstrap installer-aware**

Replace `electron/services/pythonBootstrap.js` with the teammate implementation, then preserve any `main` exports used by bridge tests. The final export must include:

```js
module.exports = {
  detect,
  getSetupGuide,
  buildPythonEnv,
  getBundledPythonDepsPath,
  getUserPythonDepsPath,
  findCompatiblePython
}
```

`buildPythonEnv(rootDir, baseEnv)` must prepend user deps before bundled deps before existing `PYTHONPATH`, and set:

```js
env.PYTHONUTF8 = '1'
env.PYTHONIOENCODING = 'utf-8'
env.PLAYWRIGHT_BROWSERS_PATH = '0'
```

- [ ] **Step 8: Wire Browser Use repair**

In `electron/services/browserUse/index.js`, add:

```js
const { installBrowserRuntime } = require('../pythonRuntimeInstaller')

async function repair() {
  const result = installBrowserRuntime()
  return {
    runtime: 'browser-use',
    state: 'installed',
    depsPath: result.depsPath,
    python: result.python,
    pythonVersion: result.pythonVersion,
    installCommand: 'python -m pip install -r server/browser-use-bridge/requirements.txt --target <runtime-deps> && python -m playwright install chromium'
  }
}
```

Keep existing `getStatus()` and `getSetupGuide()` exports, but ensure setup copy mentions Browser Use API key, Python, browser-use, Playwright, and Selenium.

- [ ] **Step 9: Merge bridge supervisor Browser Use env with Desktop Use**

In `electron/services/bridgeSupervisor.js`, keep `main` defaults for both browser and desktop:

```js
const DEFAULTS = {
  uitars: { name: 'uitars-bridge', port: 8765, dir: 'server/uitars-bridge' },
  browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' },
  desktopUse: { name: 'desktop-use-bridge', port: 8790, dir: 'server/desktop-use-bridge' }
}
```

Add:

```js
const { buildPythonEnv, findCompatiblePython } = require('./pythonBootstrap')
```

Inside `buildEnv(key)`, start with:

```js
const env = key === 'browserUse' ? buildPythonEnv(rootDir, process.env) : { ...process.env }
```

Add:

```js
function resolvePythonSpawn() {
  const python = findCompatiblePython(process.env)
  return python ? { command: python.command, args: python.args || [] } : { command: 'python', args: [] }
}
```

In the Python spawn branch, call:

```js
const pythonSpawn = runtime === 'python' ? resolvePythonSpawn() : null
const child = runtime === 'python'
  ? spawnImpl(pythonSpawn.command, [...pythonSpawn.args, '-u', path.join(rootDir, cfg.dir, 'main.py'), String(cfg.port)], spawnOptions)
  : spawnImpl('node', [path.join(rootDir, cfg.dir, 'index.js'), String(cfg.port)], spawnOptions)
```

- [ ] **Step 10: Add main process installer mode without removing overlay**

In `electron/main.js`, keep the `main` cursor overlay/window code. Add:

```js
const pythonBootstrap = require('./services/pythonBootstrap')
const { installBrowserRuntime } = require('./services/pythonRuntimeInstaller')
const installBrowserRuntimeOnly = process.argv.includes('--install-browser-runtime')
```

Wrap `app.whenReady()`:

```js
if (installBrowserRuntimeOnly) {
  app.whenReady().then(() => {
    try {
      const result = installBrowserRuntime({ rootDir })
      console.log('[browser-runtime] installed', result)
      app.exit(0)
    } catch (error) {
      console.error('[browser-runtime] install failed', error)
      app.exit(2)
    }
  })
} else {
  app.whenReady().then(async () => {
    registerAll(ipcMain)
    supervisor = createSupervisor()
    setSupervisor(supervisor)
    setBridgeContext({ pythonBootstrap, supervisor })
    supervisor.start().catch((err) => console.error('[bridges] start failed', err))
    createWindow()
    createCursorOverlayIfSupported?.()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}
```

If the existing overlay helper has a different function name, call the existing helper inside the non-installer branch and do not duplicate overlay window creation.

- [ ] **Step 11: Add setup status Browser Use dependency fields**

In `electron/ipc/setupStatus.js`, use:

```js
const KEY_FIELD_MAP = {
  deepseekKey: 'deepseekApiKey',
  browserUseKey: 'browserUseApiKey',
  desktopUseKey: 'desktopUseApiKey'
}
```

Python detection should set:

```js
deps.python = Boolean(pyResult.available ?? pyResult.python)
deps.browserUse = Boolean(pyResult.browserUseInstalled ?? pyResult.browserUse)
deps.playwright = Boolean(pyResult.playwrightInstalled ?? pyResult.playwright)
deps.selenium = Boolean(pyResult.seleniumInstalled ?? pyResult.selenium)
deps.pythonDepsBundled = Boolean(pyResult.bundledDepsPath)
deps.pythonDepsInstalled = Boolean(pyResult.userDepsPath)
```

Browser tier readiness should require:

```js
Boolean(deps.deepseekKey && deps.browserUseKey && deps.python && deps.browserUse && deps.playwright && deps.selenium)
```

Desktop tier readiness should require:

```js
Boolean(deps.deepseekKey && (deps.desktopUseKey || deps.browserUseKey))
```

- [ ] **Step 12: Run installer and packaging tests**

Run:

```bash
npm test -- electron/__tests__/python-runtime-installer.test.js electron/__tests__/python-bootstrap.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js electron/__tests__/packaging.test.js
```

Expected: PASS.

- [ ] **Step 13: Commit Browser Use runtime installer**

Run:

```bash
git add build/installer.nsh package.json package-lock.json scripts/prepare-bridges.js server/browser-use-bridge/requirements.txt electron/services/pythonRuntimeInstaller.js electron/services/pythonBootstrap.js electron/services/browserUse/index.js electron/services/bridgeSupervisor.js electron/main.js electron/ipc/runtime.js electron/ipc/setupStatus.js electron/__tests__/python-runtime-installer.test.js electron/__tests__/python-bootstrap.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js electron/__tests__/packaging.test.js
git commit -m "feat: reconcile browser use runtime installer"
```

## Task 3: Preserve Desktop and Computer Use

**Files:**
- Keep/modify: `server/desktop-use-bridge/**`
- Modify: `electron/services/desktop/adapter.js`
- Keep/modify: `electron/services/desktopCursorOverlay.js`
- Modify: `electron/tools/desktopClick.js`
- Modify: `electron/tools/desktopObserve.js`
- Modify: `electron/tools/desktopType.js`
- Keep/create: `electron/tools/desktopHotkey.js`
- Keep/create: `electron/tools/desktopScroll.js`
- Keep/create: `electron/tools/desktopWait.js`
- Keep/create: `electron/tools/desktopTask.js`
- Modify: `electron/tools/index.js`
- Modify: `electron/security/toolPolicy.js`
- Modify: `client/src/lib/desktopIntent.js`
- Test: `electron/__tests__/desktop-adapter.test.js`
- Test: `electron/__tests__/desktop-tools.test.js`
- Test: `electron/__tests__/desktop-cursor-overlay.test.js`
- Test: `electron/__tests__/tool-policy.test.js`
- Test: `client/src/lib/desktopIntent.test.js`
- Test: `server/desktop-use-bridge/__tests__/*.test.js`

- [ ] **Step 1: Assert desktop-use files are present**

Run:

```bash
git ls-tree --name-only HEAD server/desktop-use-bridge
git ls-tree --name-only HEAD electron/tools/desktopHotkey.js electron/tools/desktopScroll.js electron/tools/desktopWait.js electron/tools/desktopTask.js electron/services/desktopCursorOverlay.js
```

Expected: all listed files exist because the integration branch started from `g-sleeper/main`.

- [ ] **Step 2: Add regression tests for Desktop Use provider independence**

In `electron/__tests__/bridge-supervisor.test.js`, keep or add:

```js
it('starts desktop-use with explicit desktop config without Qwen or Doubao fields', async () => {
  const calls = []
  const sup = createSupervisor({
    rootDir,
    storeRef: {
      getConfig: () => ({
        browserUseApiKey: '',
        desktopUseApiKey: 'sk-desktop-relay',
        desktopUseEndpoint: 'https://desktop-relay.example/v1',
        desktopUseModel: 'openai/desktop-relay',
        desktopUseGroundingBackend: 'manual-coordinate',
        desktopUseAllowBrowserFallback: true
      })
    },
    spawnImpl: (cmd, args, options) => {
      calls.push({ cmd, args, env: options.env })
      return fakeChild()
    },
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) })
  })

  await sup.startOne('desktopUse')
  const desktopUse = calls.find((c) => c.args.some((arg) => arg.includes('desktop-use-bridge')))
  expect(desktopUse.env.DESKTOP_USE_MODEL_ENDPOINT).toBe('https://desktop-relay.example/v1')
  expect(desktopUse.env.DESKTOP_USE_MODEL_API_KEY).toBe('sk-desktop-relay')
  expect(desktopUse.env.DESKTOP_USE_MODEL_NAME).toBe('openai/desktop-relay')
  expect(desktopUse.env.DESKTOP_USE_GROUNDING_BACKEND).toBe('manual-coordinate')
  expect(desktopUse.env).not.toHaveProperty('UITARS_MODEL_API_KEY')
})
```

Use the existing fake child helper in the file. If the helper is named differently, use that helper and keep the assertions unchanged.

- [ ] **Step 3: Ensure desktop tools are registered**

In `electron/tools/index.js`, ensure `loadBuiltins()` includes:

```js
require('./desktopObserve')
require('./desktopClick')
require('./desktopType')
require('./desktopHotkey')
require('./desktopScroll')
require('./desktopWait')
require('./desktopTask')
```

- [ ] **Step 4: Ensure desktop adapter targets desktop-use bridge**

In `electron/services/desktop/adapter.js`, verify:

```js
const DEFAULT_BASE_URL = 'http://127.0.0.1:8790'
```

The execute path must send `sessionId`, abort signal, approval metadata, and user-intervention callback data as in `main`. Do not point this adapter back to `uitars-bridge`.

- [ ] **Step 5: Run desktop targeted tests**

Run:

```bash
npm test -- electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/tool-policy.test.js client/src/lib/desktopIntent.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/planner.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Desktop Use preservation**

Run:

```bash
git add package.json scripts/prepare-bridges.js server/desktop-use-bridge electron/services/desktop electron/services/desktopCursorOverlay.js electron/tools/desktopObserve.js electron/tools/desktopClick.js electron/tools/desktopType.js electron/tools/desktopHotkey.js electron/tools/desktopScroll.js electron/tools/desktopWait.js electron/tools/desktopTask.js electron/tools/index.js electron/security/toolPolicy.js client/src/lib/desktopIntent.js electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/tool-policy.test.js client/src/lib/desktopIntent.test.js
git commit -m "feat: preserve desktop computer use runtime"
```

## Task 4: Artifact Store and IPC Reconciliation

**Files:**
- Modify: `electron/store.js`
- Modify: `electron/ipc/artifacts.js`
- Modify: `client/src/lib/api.js`
- Test: `electron/__tests__/store.test.js`
- Test: `electron/__tests__/ipc.test.js`
- Test: `client/src/lib/api.test.js`

- [ ] **Step 1: Add artifact deletion/restoration tests**

In `electron/__tests__/ipc.test.js`, add:

```js
test('artifacts:delete removes active artifact and records deletion metadata', async () => {
  const ipcMain = ipc()
  artifacts.register(ipcMain)
  store.addArtifact({ id: 'artifact-1', type: 'word', title: 'Report', path: path.join(store.GENERATED_DIR, 'report.docx') })

  const deleted = await ipcMain.handlers.get('artifacts:delete')({}, { id: 'artifact-1' })

  expect(deleted.ok).toBe(true)
  expect(store.listArtifacts().some((item) => item.id === 'artifact-1')).toBe(false)
  expect(store.getData().deletedArtifacts[0].id).toBe('artifact-1')
})

test('deleted artifact is restored to active list when system-trash item still exists', () => {
  const filePath = path.join(store.GENERATED_DIR, 'restore.docx')
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, 'x')
  store.saveData({
    version: 1,
    conversations: [],
    artifacts: [],
    deletedArtifacts: [{
      id: 'artifact-restore',
      type: 'word',
      title: 'Restorable',
      path: filePath,
      deletedAt: new Date().toISOString(),
      deleteInfo: { status: 'system-trash' }
    }],
    scheduledTasks: []
  })

  expect(store.listArtifacts().map((item) => item.id)).toContain('artifact-restore')
  expect(store.getData().deletedArtifacts).toEqual([])
})
```

In `client/src/lib/api.test.js`, add:

```js
test('deleteArtifact invokes artifacts delete channel', async () => {
  await deleteArtifact('artifact-1')
  expect(window.electronAPI.invoke).toHaveBeenCalledWith('artifacts:delete', { id: 'artifact-1' })
})
```

- [ ] **Step 2: Run artifact tests and verify failure**

Run:

```bash
npm test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js client/src/lib/api.test.js
```

Expected: FAIL until delete/restoration API is merged.

- [ ] **Step 3: Add deletedArtifacts data shape**

In `electron/store.js`, ensure:

```js
const DEFAULT_DATA = {
  version: 1,
  conversations: [],
  artifacts: [],
  deletedArtifacts: [],
  scheduledTasks: []
}

function ensureDataShape(data) {
  const next = data && typeof data === 'object' ? data : clone(DEFAULT_DATA)
  if (!Array.isArray(next.conversations)) next.conversations = []
  if (!Array.isArray(next.artifacts)) next.artifacts = []
  if (!Array.isArray(next.deletedArtifacts)) next.deletedArtifacts = []
  if (!Array.isArray(next.scheduledTasks)) next.scheduledTasks = []
  return next
}
```

Use `ensureDataShape()` in `getData()` and `saveData()`.

- [ ] **Step 4: Add artifact deletion/restoration helpers**

In `electron/store.js`, add:

```js
function artifactFileExists(artifact) {
  if (!artifact?.path) return false
  try {
    const filePath = path.resolve(String(artifact.path))
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function canRestoreDeletedArtifact(artifact) {
  return artifact?.deleteInfo?.status === 'system-trash'
}
```

Update methods:

```js
addArtifact(artifact) {
  const data = this.getData()
  data.deletedArtifacts = data.deletedArtifacts.filter((item) => item.id !== artifact.id)
  data.artifacts.unshift(artifact)
  this.saveData(data)
  return artifact
},

listArtifacts() {
  const data = this.getData()
  const activeIds = new Set(data.artifacts.map((item) => item.id))
  const stillDeleted = []
  const restored = []

  for (const deleted of data.deletedArtifacts) {
    if (!deleted?.id || activeIds.has(deleted.id)) continue
    if (canRestoreDeletedArtifact(deleted) && artifactFileExists(deleted)) {
      const { deletedAt, deleteInfo, ...artifact } = deleted
      data.artifacts.unshift(artifact)
      activeIds.add(artifact.id)
      restored.push(artifact)
    } else {
      stillDeleted.push(deleted)
    }
  }

  if (restored.length || stillDeleted.length !== data.deletedArtifacts.length) {
    data.deletedArtifacts = stillDeleted
    this.saveData(data)
  }
  return data.artifacts
},

deleteArtifact(id, deleteInfo = {}) {
  const data = this.getData()
  const index = data.artifacts.findIndex((item) => item.id === id)
  if (index === -1) return null
  const [artifact] = data.artifacts.splice(index, 1)
  data.deletedArtifacts = data.deletedArtifacts.filter((item) => item.id !== id)
  data.deletedArtifacts.unshift({ ...artifact, deletedAt: new Date().toISOString(), deleteInfo })
  this.saveData(data)
  return artifact
}
```

- [ ] **Step 5: Add artifacts delete IPC**

In `electron/ipc/artifacts.js`, add:

```js
ipcMain.handle('artifacts:delete', async (_event, payload = {}) => {
  const id = String(payload.id || '').trim()
  if (!id) throw new Error('invalid artifact id')
  const artifact = store.listArtifacts().find((item) => item.id === id)
  if (!artifact) return { ok: false, warning: 'Artifact not found.' }

  let deleteInfo = { status: 'record-only' }
  if (artifact.path) {
    try {
      const filePath = path.resolve(String(artifact.path))
      if (fs.existsSync(filePath)) {
        shell.trashItem ? await shell.trashItem(filePath) : fs.unlinkSync(filePath)
        deleteInfo = { status: 'system-trash' }
      }
    } catch (error) {
      deleteInfo = { status: 'delete-failed', error: String(error.message || error) }
    }
  }

  store.deleteArtifact(id, deleteInfo)
  return {
    ok: true,
    artifact,
    warning: deleteInfo.status === 'delete-failed' ? `Artifact record removed but file deletion failed: ${deleteInfo.error}` : ''
  }
})
```

Ensure `fs`, `path`, `shell`, and `store` imports exist.

- [ ] **Step 6: Add frontend API**

In `client/src/lib/api.js`, add:

```js
export function deleteArtifact(id) {
  return invoke('artifacts:delete', { id })
}
```

Also export it from any grouped API export if the file has one.

- [ ] **Step 7: Run artifact tests**

Run:

```bash
npm test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js client/src/lib/api.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit artifact store and IPC**

Run:

```bash
git add electron/store.js electron/ipc/artifacts.js client/src/lib/api.js electron/__tests__/store.test.js electron/__tests__/ipc.test.js client/src/lib/api.test.js
git commit -m "feat: reconcile artifact deletion and restore"
```

## Task 5: Settings, Welcome, and Artifacts Tab

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/components/WelcomeSetupDialog.jsx`
- Modify: `client/src/panels/SettingsPanel.jsx`
- Modify: `client/src/components/BridgeStatusBar.jsx`
- Test: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Add Settings UI assertions**

In `client/src/components/chat/unified-chat-ui.test.js`, add:

```js
test('settings keeps artifacts tab and removes qwen doubao settings', () => {
  const settings = fs.readFileSync(path.join(repoRoot, 'client/src/pages/SettingsPage.jsx'), 'utf-8')
  expect(settings).toContain("['artifacts'")
  expect(settings).toContain('deleteArtifact')
  expect(settings).toContain('listArtifacts')
  expect(settings).toContain('agentdev:artifact-created')
  expect(settings).toContain('desktopUseApiKey')
  expect(settings).toContain('browserUseApiKey')
  expect(settings).not.toMatch(/qwenApiKey|doubaoVisionApiKey|qwenVisionApiKey/)
})

test('welcome setup does not request removed provider keys', () => {
  const welcome = fs.readFileSync(path.join(repoRoot, 'client/src/components/WelcomeSetupDialog.jsx'), 'utf-8')
  expect(welcome).toContain('browserUse')
  expect(welcome).not.toMatch(/qwenApiKey|doubaoVisionApiKey|qwenVisionApiKey/)
})
```

- [ ] **Step 2: Run UI assertions and verify failure**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL until Settings/Welcome are reconciled.

- [ ] **Step 3: Reconcile SettingsPage imports and defaults**

In `client/src/pages/SettingsPage.jsx`, ensure imports include:

```js
import { deleteArtifact, getConfig, getRuntimeStatus, listArtifacts, openFile, setConfig } from '../lib/api.js'
import { ExternalLink, FileText, Presentation, RefreshCw, Trash2, X } from 'lucide-react'
```

Use this default form shape:

```js
const DEFAULT_FORM = {
  deepseekApiKey: '',
  deepseekEndpoint: 'https://api.deepseek.com',
  deepseekPlannerModel: 'deepseek-chat',
  deepseekCodingModel: 'deepseek-coder',
  browserUseApiKey: '',
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  browserUseVisionEnabled: true,
  browserUseHeadless: false,
  desktopUseApiKey: '',
  desktopUseEndpoint: 'https://zenmux.ai/api/v1',
  desktopUseModel: 'openai/gpt-5.5',
  desktopUseGroundingBackend: 'manual-coordinate',
  desktopUseAllowBrowserFallback: true,
  dryRunEnabled: true,
  permissionMode: 'ask',
  workspaceRoot: ''
}
```

Use tabs:

```js
const TABS = [
  ['artifacts', '产物'],
  ['models', '模型'],
  ['runtime', '运行时'],
  ['safety', '安全'],
  ['about', '关于']
]
```

- [ ] **Step 4: Add Artifacts tab state and handlers**

In `SettingsPage`, add state:

```js
const [artifacts, setArtifacts] = useState([])
const [artifactsLoading, setArtifactsLoading] = useState(false)
```

Add helpers:

```js
function formatArtifactTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

function artifactTitle(artifact) {
  return artifact.title || artifact.filename || '未命名文件'
}

async function refreshArtifacts() {
  setArtifactsLoading(true)
  try {
    const result = await listArtifacts()
    setArtifacts(result.items || [])
  } catch (error) {
    setMessage(`加载产物失败：${error.message}`)
  } finally {
    setArtifactsLoading(false)
  }
}

async function openArtifact(artifact) {
  if (!artifact.path) return
  try {
    await openFile(artifact.path)
  } catch (error) {
    setMessage(`打开失败：${error.message}`)
  }
}

async function removeArtifact(artifact) {
  if (!artifact.id) return
  if (!window.confirm(`确认删除产物"${artifactTitle(artifact)}"？`)) return
  setMessage('')
  try {
    const result = await deleteArtifact(artifact.id)
    setArtifacts((current) => current.filter((item) => item.id !== artifact.id))
    setMessage(result.warning || '产物已删除')
  } catch (error) {
    setMessage(`删除失败：${error.message}`)
  }
}
```

Add effect:

```js
useEffect(() => {
  function handleArtifactCreated() {
    refreshArtifacts()
  }
  window.addEventListener('agentdev:artifact-created', handleArtifactCreated)
  return () => window.removeEventListener('agentdev:artifact-created', handleArtifactCreated)
}, [])
```

- [ ] **Step 5: Add Artifacts tab markup**

In the tab body, add this branch before models:

```jsx
{tab === 'artifacts' && (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold">已生成文件</h3>
      <button
        type="button"
        onClick={refreshArtifacts}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--border)] text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)]"
        aria-label="刷新产物列表"
        title="刷新"
      >
        <RefreshCw size={14} className={artifactsLoading ? 'animate-spin' : ''} />
      </button>
    </div>

    {artifacts.length === 0 && !artifactsLoading && (
      <div className="rounded-md border border-dashed border-[color:var(--border)] px-3 py-8 text-center text-sm text-[color:var(--text-muted)]">
        暂无生成文件
      </div>
    )}

    <div className="space-y-2">
      {artifacts.map((artifact) => {
        const Icon = artifact.type === 'ppt' ? Presentation : FileText
        return (
          <section key={artifact.id || artifact.path} className="rounded-md border border-[color:var(--border)] p-3">
            <div className="flex items-start gap-3">
              <Icon size={18} className="mt-0.5 shrink-0 text-[color:var(--accent)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{artifactTitle(artifact)}</div>
                <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">{artifact.path || artifact.filename || '路径未知'}</div>
                {formatArtifactTime(artifact.createdAt) && (
                  <div className="text-xs text-[color:var(--text-muted)]">{formatArtifactTime(artifact.createdAt)}</div>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => openArtifact(artifact)} disabled={!artifact.path} className="inline-flex h-8 items-center gap-1 rounded-md border border-[color:var(--border)] px-3 text-xs hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50">
                <ExternalLink size={13} /> 打开
              </button>
              <button type="button" onClick={() => removeArtifact(artifact)} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-3 text-xs text-red-500 hover:bg-red-50">
                <Trash2 size={13} /> 删除
              </button>
            </div>
          </section>
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 6: Remove Qwen/Doubao UI fields**

In `client/src/pages/SettingsPage.jsx`, `client/src/panels/SettingsPanel.jsx`, and `client/src/components/WelcomeSetupDialog.jsx`, remove fields and labels matching:

```text
qwenApiKey
qwenBaseUrl
qwenPrimaryModel
qwenCodingModel
qwenVisionApiKey
qwenVisionEndpoint
qwenVisionModel
doubaoVisionApiKey
doubaoVisionEndpoint
doubaoVisionModel
```

Keep Browser Use fields and add Desktop Use fields in Settings:

```jsx
<ApiKeyInput id="settings-browser-use-api-key" label="浏览器自动化 API 密钥" value={form.browserUseApiKey} onChange={(event) => patch({ browserUseApiKey: event.target.value })} placeholder={maskedKeys.browserUseApiKey || 'ZenMux API 密钥'} url="https://zenmux.ai/" savedValue={maskedKeys.browserUseApiKey} />
<ApiKeyInput id="settings-desktop-use-api-key" label="桌面自动化 API 密钥" value={form.desktopUseApiKey} onChange={(event) => patch({ desktopUseApiKey: event.target.value })} placeholder={maskedKeys.desktopUseApiKey || '可留空以复用浏览器自动化密钥'} url="https://zenmux.ai/" savedValue={maskedKeys.desktopUseApiKey} />
```

- [ ] **Step 7: Run Settings tests**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS for Settings/Welcome assertions.

- [ ] **Step 8: Commit Settings/Welcome reconciliation**

Run:

```bash
git add client/src/pages/SettingsPage.jsx client/src/components/WelcomeSetupDialog.jsx client/src/panels/SettingsPanel.jsx client/src/components/BridgeStatusBar.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: reconcile settings welcome and artifacts tab"
```

## Task 6: Chat UI and Behavior Reconciliation

**Files:**
- Modify: `client/src/hooks/useChat.js`
- Modify: `client/src/components/chat/ChatArea.jsx`
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/components/chat/MessageList.jsx`
- Modify: `client/src/components/chat/ModelSelector.jsx`
- Modify: `client/src/components/actions/ActionCard.jsx`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/ipc/chatConfirmation.js`
- Modify: `electron/services/agentLoop.js`
- Test: `client/src/components/chat/unified-chat-ui.test.js`
- Test: `electron/__tests__/chat.test.js`
- Test: `electron/__tests__/chat-confirmation.test.js`
- Test: `electron/__tests__/agent-loop.test.js`

- [ ] **Step 1: Add chat behavior assertions**

In `client/src/components/chat/unified-chat-ui.test.js`, ensure tests assert:

```js
test('chat supports browser and desktop plugin modes without qwen or doubao model chips', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'client/src/components/chat/ModelSelector.jsx'), 'utf-8')
  expect(source).toContain('browser-use')
  expect(source).toContain('desktop-use')
  expect(source).not.toMatch(/qwen/i)
  expect(source).not.toMatch(/doubao/i)
})

test('chat hook preserves approval progress cancel and ask-user event handling', () => {
  const hook = fs.readFileSync(path.join(repoRoot, 'client/src/hooks/useChat.js'), 'utf-8')
  expect(hook).toContain('approval')
  expect(hook).toContain('progress')
  expect(hook).toContain('abort')
  expect(hook).toContain('ask_user')
  expect(hook).toContain('desktop')
})
```

- [ ] **Step 2: Run chat tests and verify failure**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js electron/__tests__/chat.test.js electron/__tests__/chat-confirmation.test.js electron/__tests__/agent-loop.test.js
```

Expected: FAIL until chat UI and behavior are reconciled.

- [ ] **Step 3: Reconcile ModelSelector**

In `client/src/components/chat/ModelSelector.jsx`, keep teammate Chinese UI labels and include these options only:

```js
const MODEL_OPTIONS = [
  { id: 'deepseek-chat', label: 'DeepSeek 对话', provider: 'deepseek' },
  { id: 'deepseek-coder', label: 'DeepSeek 代码', provider: 'deepseek' }
]

const BROWSER_USE_OPTION = {
  id: 'browser-use',
  label: '浏览器自动化',
  provider: 'browser-use'
}

const DESKTOP_USE_OPTION = {
  id: 'desktop-use',
  label: '桌面自动化',
  provider: 'desktop-use'
}
```

When plugin mode is active, show the corresponding plugin option and clear plugin mode when a normal model is selected.

- [ ] **Step 4: Reconcile useChat event handling**

In `client/src/hooks/useChat.js`, start from teammate branch UI state naming, then ensure the event reducer handles these event types from `main`:

```js
case 'approval_required':
case 'approval_resolved':
case 'tool_progress':
case 'desktop_event':
case 'ask_user':
case 'task_cancelled':
case 'error':
```

The hook must expose:

```js
return {
  messages,
  input,
  setInput,
  sendMessage,
  stop,
  approveAction,
  denyAction,
  answerQuestion,
  pluginMode,
  setPluginMode,
  status,
  pendingApproval,
  pendingQuestion
}
```

Use the existing API functions in `client/src/lib/api.js`; do not call `window.electronAPI.invoke` directly inside component files.

- [ ] **Step 5: Preserve backend confirmation lifecycle**

In `electron/ipc/chat.js` and `electron/ipc/chatConfirmation.js`, keep `main` behavior for:

```text
agent:run-turn
agent:approve-tool
agent:deny-tool
agent:abort
chat confirmation pending state
question replies treated as clarification
```

Ensure no code path imports Qwen/Doubao.

- [ ] **Step 6: Run chat behavior tests**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js electron/__tests__/chat.test.js electron/__tests__/chat-confirmation.test.js electron/__tests__/agent-loop.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit chat reconciliation**

Run:

```bash
git add client/src/hooks/useChat.js client/src/components/chat/ChatArea.jsx client/src/components/chat/InputBar.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/MessageList.jsx client/src/components/chat/ModelSelector.jsx client/src/components/actions/ActionCard.jsx electron/ipc/chat.js electron/ipc/chatConfirmation.js electron/services/agentLoop.js client/src/components/chat/unified-chat-ui.test.js electron/__tests__/chat.test.js electron/__tests__/chat-confirmation.test.js electron/__tests__/agent-loop.test.js
git commit -m "feat: reconcile chat ui and automation flow"
```

## Task 7: Office Artifact Skill Layer

**Files:**
- Create: `electron/services/officeArtifactPlanner.js`
- Modify: `electron/services/pptxGen.js`
- Modify: `electron/tools/docs.js`
- Modify if present: `electron/services/docxGen.js`
- Add: `resources/skills/word-writer/templates/操作系统复习笔记.docx`
- Add: `resources/skills/word-writer/templates/算法设计与分析复习笔记.docx`
- Test: `electron/__tests__/docs-tools.test.js`
- Test: `electron/__tests__/ipc.test.js`

- [ ] **Step 1: Add Office artifact planner tests**

Create or update `electron/__tests__/office-artifact-planner.test.js`:

```js
const {
  planDocumentArtifact,
  planPresentationArtifact,
  normalizeArtifactTitle
} = require('../services/officeArtifactPlanner')

test('normalizes artifact title into safe display and filename stems', () => {
  expect(normalizeArtifactTitle('  数据库复习/总结  ')).toEqual({
    title: '数据库复习 总结',
    filenameStem: '数据库复习-总结'
  })
})

test('plans Word artifact with document type style guidance and QA checks', () => {
  const plan = planDocumentArtifact({ prompt: '生成一份操作系统复习笔记', title: '操作系统复习笔记' })
  expect(plan.kind).toBe('word')
  expect(plan.title).toBe('操作系统复习笔记')
  expect(plan.sections.length).toBeGreaterThan(0)
  expect(plan.qualityChecks).toEqual(expect.arrayContaining([
    'heading-hierarchy',
    'table-spacing',
    'artifact-registration'
  ]))
})

test('plans PPT artifact with narrative slide jobs and editable evidence guidance', () => {
  const plan = planPresentationArtifact({ prompt: '做一个算法课程汇报 PPT', title: '算法课程汇报' })
  expect(plan.kind).toBe('ppt')
  expect(plan.slideJobs.length).toBeGreaterThan(0)
  expect(plan.qualityChecks).toEqual(expect.arrayContaining([
    'one-job-per-slide',
    'editable-tables-or-charts',
    'artifact-registration'
  ]))
})
```

- [ ] **Step 2: Run planner tests and verify failure**

Run:

```bash
npm test -- electron/__tests__/office-artifact-planner.test.js
```

Expected: FAIL because planner file does not exist.

- [ ] **Step 3: Create Office artifact planner**

Create `electron/services/officeArtifactPlanner.js`:

```js
function normalizeArtifactTitle(rawTitle = '') {
  const cleaned = String(rawTitle || '未命名产物')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || '未命名产物'
  return {
    title: cleaned,
    filenameStem: cleaned.replace(/\s+/g, '-')
  }
}

function inferDocumentType(prompt = '') {
  const text = String(prompt)
  if (/报告|总结|分析/.test(text)) return 'report'
  if (/复习|笔记|知识点/.test(text)) return 'study-notes'
  if (/方案|计划/.test(text)) return 'proposal'
  return 'general-document'
}

function planDocumentArtifact({ prompt = '', title = '' } = {}) {
  const normalized = normalizeArtifactTitle(title || prompt)
  const documentType = inferDocumentType(prompt)
  return {
    kind: 'word',
    documentType,
    title: normalized.title,
    filenameStem: normalized.filenameStem,
    style: {
      language: 'zh-CN',
      headingSystem: 'numbered-clear',
      tableTreatment: 'spacious-repeat-header',
      bodyDensity: documentType === 'study-notes' ? 'medium' : 'balanced'
    },
    sections: [
      { id: 'overview', title: '概览', purpose: '说明主题、范围和读者应该先掌握的结论。' },
      { id: 'body', title: '核心内容', purpose: '按逻辑层级组织主体内容，避免长段堆叠。' },
      { id: 'summary', title: '总结', purpose: '收束要点并给出后续行动或复习建议。' }
    ],
    qualityChecks: [
      'heading-hierarchy',
      'table-spacing',
      'page-breaks',
      'font-fallback',
      'artifact-registration'
    ]
  }
}

function planPresentationArtifact({ prompt = '', title = '' } = {}) {
  const normalized = normalizeArtifactTitle(title || prompt)
  return {
    kind: 'ppt',
    title: normalized.title,
    filenameStem: normalized.filenameStem,
    narrative: {
      thesis: '先给结论，再展示证据，最后落到行动或总结。',
      density: 'live-presentation'
    },
    slideJobs: [
      { id: 'cover', job: '建立主题和语气。' },
      { id: 'context', job: '说明背景和问题。' },
      { id: 'evidence', job: '用图表、表格或结构化要点支撑核心结论。' },
      { id: 'closing', job: '总结重点并给出下一步。' }
    ],
    qualityChecks: [
      'one-job-per-slide',
      'editable-tables-or-charts',
      'text-fit',
      'visual-preview',
      'artifact-registration'
    ]
  }
}

module.exports = {
  inferDocumentType,
  normalizeArtifactTitle,
  planDocumentArtifact,
  planPresentationArtifact
}
```

- [ ] **Step 4: Wire planner into Word/PPT generation**

In `electron/tools/docs.js`, import:

```js
const { planDocumentArtifact, planPresentationArtifact } = require('../services/officeArtifactPlanner')
```

Before calling Word generation, compute:

```js
const artifactPlan = planDocumentArtifact({ prompt, title })
```

Before calling PowerPoint generation, compute:

```js
const artifactPlan = planPresentationArtifact({ prompt, title })
```

Pass `artifactPlan` into generator metadata if the generator accepts an options object. If it does not, use `artifactPlan.title` and `artifactPlan.filenameStem` when naming the artifact and keep `artifactPlan` in `metadata.officePlan`.

- [ ] **Step 5: Keep teammate Word templates**

Restore teammate templates:

```bash
git checkout g-sleeper/merge-dev-xulinjie-liushuai -- "resources/skills/word-writer/templates/操作系统复习笔记.docx" "resources/skills/word-writer/templates/算法设计与分析复习笔记.docx"
```

Expected: both DOCX files are staged or present in the working tree.

- [ ] **Step 6: Ensure generated artifacts register metadata**

In the code path that calls `store.addArtifact()`, ensure Word/PPT artifacts include:

```js
{
  id,
  type: artifactType,
  title: artifactPlan.title,
  filename,
  path: outputPath,
  createdAt: new Date().toISOString(),
  metadata: {
    officePlan: artifactPlan
  }
}
```

Preserve existing fields used by the UI.

- [ ] **Step 7: Run Office artifact tests**

Run:

```bash
npm test -- electron/__tests__/office-artifact-planner.test.js electron/__tests__/docs-tools.test.js electron/__tests__/ipc.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit Office artifact layer**

Run:

```bash
git add electron/services/officeArtifactPlanner.js electron/services/pptxGen.js electron/services/docxGen.js electron/tools/docs.js electron/__tests__/office-artifact-planner.test.js electron/__tests__/docs-tools.test.js electron/__tests__/ipc.test.js resources/skills/word-writer/templates
git commit -m "feat: add office artifact quality layer"
```

If `electron/services/docxGen.js` does not exist, omit that file from `git add`.

## Task 8: Documentation Reconciliation

**Files:**
- Modify: `README.md`
- Modify: `docs/USER_MANUAL.md`
- Modify: `docs/runtime-setup.md`
- Modify: `docs/demo-script.md`
- Modify: `docs/test-report.md`
- Keep: `docs/superpowers/specs/**`
- Keep: `docs/superpowers/plans/**`

- [ ] **Step 1: Update README product direction**

In `README.md`, update the product direction section to state:

```md
The merged V2 direction is deliberately focused:

- DeepSeek owns chat, planning, intent classification, and coding reasoning.
- Browser Use handles browser automation through the Browser Use bridge and ZenMux-compatible settings.
- Desktop/Computer Use handles real desktop automation through the desktop-use bridge.
- AionUi owns policy, confirmations, audit logging, emergency stop, setup guidance, artifacts, and runtime setup.
```

Remove active references that say Qwen or Doubao are required providers. Keep historical docs references only where explicitly described as history.

- [ ] **Step 2: Update runtime setup docs**

In `docs/runtime-setup.md`, document:

```md
## Browser Use Runtime

The Windows installer runs Browser Use dependency setup after install. Users can also run repair from Settings. The setup installs Python packages from `server/browser-use-bridge/requirements.txt` into the app-managed dependency directory and installs Playwright Chromium.

## Desktop Use Runtime

Desktop Use is supervised as `server/desktop-use-bridge` on port 8790. Configure `desktopUseApiKey`, `desktopUseEndpoint`, and `desktopUseModel`, or enable fallback to Browser Use settings.
```

- [ ] **Step 3: Update user manual for Artifacts tab**

In `docs/USER_MANUAL.md`, add:

```md
## Artifacts

Open Settings -> Artifacts to view generated Word, PowerPoint, and file outputs. The list supports refresh, open, and delete. New generated artifacts refresh the list automatically while the app is open.
```

- [ ] **Step 4: Update test report with reconciliation verification section**

In `docs/test-report.md`, add:

```md
## 2026-05-12 Main / Merge Dev Reconciliation

Verification should cover provider cleanup, Browser Use runtime install/repair, Desktop/Computer Use, chat confirmation flow, Settings Artifacts, Office artifact generation, full tests, client build, and package build where the local environment allows it.
```

- [ ] **Step 5: Run documentation grep checks**

Run:

```bash
git grep -n "Qwen\\|Doubao\\|qwenApiKey\\|doubaoVisionApiKey" -- README.md docs/USER_MANUAL.md docs/runtime-setup.md docs/demo-script.md
```

Expected: no active setup instructions requiring Qwen or Doubao. Historical mentions are acceptable only when clearly marked as historical or deprecated.

- [ ] **Step 6: Commit docs**

Run:

```bash
git add README.md docs/USER_MANUAL.md docs/runtime-setup.md docs/demo-script.md docs/test-report.md docs/superpowers/specs docs/superpowers/plans
git commit -m "docs: update reconciliation product docs"
```

## Task 9: Final Verification and Fixups

**Files:**
- Modify only files required by failed verification.

- [ ] **Step 1: Verify removed providers stay inactive**

Run:

```bash
git grep -n "require('./doubao')\\|require('../services/doubao')\\|qwenProvider\\|qwenApiKey\\|qwenVisionApiKey\\|doubaoVisionApiKey" -- electron client/src package.json ':!electron/__tests__'
```

Expected: no output.

- [ ] **Step 2: Run Browser Use installer tests**

Run:

```bash
npm test -- electron/__tests__/python-runtime-installer.test.js electron/__tests__/python-bootstrap.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js electron/__tests__/packaging.test.js
```

Expected: PASS.

- [ ] **Step 3: Run Desktop/Computer Use tests**

Run:

```bash
npm test -- electron/__tests__/desktop-adapter.test.js electron/__tests__/desktop-tools.test.js electron/__tests__/desktop-cursor-overlay.test.js electron/__tests__/tool-policy.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/driver.test.js server/desktop-use-bridge/__tests__/planner.test.js server/desktop-use-bridge/__tests__/agentRunner.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

- [ ] **Step 4: Run chat, settings, artifacts, and Office tests**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js client/src/lib/api.test.js electron/__tests__/ipc.test.js electron/__tests__/store.test.js electron/__tests__/docs-tools.test.js electron/__tests__/office-artifact-planner.test.js
```

Expected: PASS.

- [ ] **Step 5: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS. If native rebuild or local dependency setup fails, record the first actionable error in `docs/test-report.md` and continue with targeted passing suites.

- [ ] **Step 6: Run client build**

Run:

```bash
npm run build:client
```

Expected: PASS.

- [ ] **Step 7: Run package build if environment allows**

Run:

```bash
npm run electron:build
```

Expected: PASS or environment blocker documented in `docs/test-report.md`. Do not commit `dist-electron`, installers, or generated build output.

- [ ] **Step 8: Review final changed files**

Run:

```bash
git status --short --branch
git diff --stat g-sleeper/main..HEAD
git diff --name-status g-sleeper/main..HEAD
```

Expected: changed files match the reconciliation surface. No generated installer or `dist-electron` output is tracked.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes, run:

```bash
git add <changed-files>
git commit -m "test: verify main merge dev reconciliation"
```

If no files changed after verification, do not create an empty commit.

- [ ] **Step 10: Final status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -n 12
```

Expected: clean working tree on `reconcile-main-merge-dev`, with reconciliation commits after the design and plan docs.

