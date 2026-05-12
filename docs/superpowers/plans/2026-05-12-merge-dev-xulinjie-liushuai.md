# Merge Dev Xulinjie and Liushuai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Xu Linjie's Browser Use Python runtime installer to the `g-sleeper/dev` baseline while preserving Liu Shuai's DeepSeek + Browser Use product direction.

**Architecture:** Keep `dev` as the source of truth and selectively transplant runtime installer pieces from source commit `cb800555a7be523e1577f2a158e8bac20eb9ee15`. The installer prepares Python dependencies in a user-level dependency directory, `pythonBootstrap` exposes dependency readiness, `bridgeSupervisor` starts the Browser Use bridge with the prepared `PYTHONPATH`, and runtime/setup IPC exposes repair and readiness without restoring Qwen or Doubao.

**Tech Stack:** Electron 33, Node/CommonJS main process, Vitest, electron-builder NSIS, Python 3.11+, browser-use, Playwright, Selenium.

---

## File Structure

- Create `build/installer.nsh`: NSIS custom install hook that runs app installer mode.
- Create `electron/services/pythonRuntimeInstaller.js`: isolated installer for Python, Browser Use packages, Playwright Chromium, staging/rollback, and validation.
- Create `electron/__tests__/python-runtime-installer.test.js`: unit tests for staging, rollback, validation list, and publish behavior.
- Modify `package.json`: keep `dev` rebuild scripts and add `build.nsis.include`.
- Modify `scripts/prepare-bridges.js`: package Browser Use bridge source without installing Python deps during build.
- Modify `server/browser-use-bridge/requirements.txt`: add Playwright and Selenium runtime dependencies.
- Modify `electron/services/pythonBootstrap.js`: build Python env from user/bundled deps, find compatible Python, detect Browser Use dependencies.
- Modify `electron/services/browserUse/index.js`: make Runtime repair call the installer.
- Modify `electron/services/bridgeSupervisor.js`: pass Python deps into Browser Use bridge env and spawn compatible Python executable.
- Modify `electron/main.js`: add installer-only mode and pass Python bootstrap into setup status.
- Modify `electron/ipc/runtime.js`: support `runtime:bootstrap` for `browser-use`.
- Modify `electron/ipc/setupStatus.js`: expose Browser Use key/dependency readiness without Qwen/Doubao fields.
- Modify tests: `electron/__tests__/packaging.test.js`, `electron/__tests__/python-bootstrap.test.js`, `electron/__tests__/bridge-supervisor.test.js`, `electron/__tests__/runtime-ipc.test.js`, `electron/__tests__/setup-status-ipc.test.js`.

### Task 1: Packaging and Bridge Preparation

**Files:**
- Create: `build/installer.nsh`
- Modify: `package.json`
- Modify: `scripts/prepare-bridges.js`
- Modify: `server/browser-use-bridge/requirements.txt`
- Test: `electron/__tests__/packaging.test.js`

- [ ] **Step 1: Write the failing packaging tests**

Append these tests to `electron/__tests__/packaging.test.js` after `main-process runtime modules are production dependencies` and before the README test:

```js
test('browser-use bridge runtime dependencies are installed by the app installer', () => {
  const prepareScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'prepare-bridges.js'), 'utf-8')
  const requirements = fs.readFileSync(path.join(repoRoot, 'server', 'browser-use-bridge', 'requirements.txt'), 'utf-8')

  expect(prepareScript).toContain("'.deps'")
  expect(prepareScript).not.toContain('pip install -r')
  expect(prepareScript).not.toContain('--target')
  expect(prepareScript).not.toContain('playwright install chromium')
  expect(requirements).toContain('selenium')
  expect(requirements).toContain('playwright')
})

test('windows installer runs browser runtime dependency setup after app install', () => {
  const installerInclude = path.join(repoRoot, 'build', 'installer.nsh')
  const mainProcess = fs.readFileSync(path.join(repoRoot, 'electron', 'main.js'), 'utf-8')

  expect(pkg.build.nsis.include).toBe('build/installer.nsh')
  expect(fs.existsSync(installerInclude)).toBe(true)
  expect(fs.readFileSync(installerInclude, 'utf-8')).toContain('--install-browser-runtime')
  expect(mainProcess).toContain('--install-browser-runtime')
})
```

- [ ] **Step 2: Run the packaging tests and verify they fail**

Run:

```bash
npm test -- electron/__tests__/packaging.test.js
```

Expected: FAIL because `build/installer.nsh` does not exist, `pkg.build.nsis.include` is missing, `prepare-bridges.js` still installs Python deps with `pip`, and requirements do not include Playwright/Selenium.

- [ ] **Step 3: Add the NSIS installer hook**

Create `build/installer.nsh` with exactly:

```nsh
!macro customInstall
  DetailPrint "Preparing browser runtime dependencies..."
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --install-browser-runtime --silent' $0
  DetailPrint "Browser runtime dependency setup exit code: $0"
!macroend
```

- [ ] **Step 4: Wire the installer include into `package.json`**

In `package.json`, change the `build.nsis` block from:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

to:

```json
"nsis": {
  "include": "build/installer.nsh",
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true
}
```

- [ ] **Step 5: Stop build-time Python dependency installation**

In `scripts/prepare-bridges.js`, replace the whole Browser Use Python bridge section starting at `// Python bridge: copy source + install Python deps` with:

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

- [ ] **Step 6: Add Python package requirements**

Change `server/browser-use-bridge/requirements.txt` to:

```txt
browser-use>=0.10.0
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
pydantic>=2.0.0
playwright>=1.40.0
selenium>=4.20.0
```

- [ ] **Step 7: Run packaging tests and verify they pass**

Run:

```bash
npm test -- electron/__tests__/packaging.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit packaging work**

Run:

```bash
git add build/installer.nsh package.json scripts/prepare-bridges.js server/browser-use-bridge/requirements.txt electron/__tests__/packaging.test.js
git commit -m "build: install browser runtime during app install"
```

### Task 2: Python Runtime Installer Service

**Files:**
- Create: `electron/services/pythonRuntimeInstaller.js`
- Create: `electron/__tests__/python-runtime-installer.test.js`

- [ ] **Step 1: Add the installer tests**

Create `electron/__tests__/python-runtime-installer.test.js` from source commit `cb800555a7be523e1577f2a158e8bac20eb9ee15`. The test file must contain these test names:

```js
test('runtime import checks include FastAPI because the bridge imports it at startup', () => {})
test('installBrowserRuntime does not publish partial dependencies when install fails', () => {})
test('installBrowserRuntime publishes staged dependencies only after successful validation', () => {})
```

Use the exact assertions from the source branch so the tests verify:

- `REQUIRED_IMPORTS` includes `browserUse`, `playwright`, `selenium`, and `fastapi`.
- failed Playwright installation does not replace an existing dependency directory.
- successful install publishes staged deps only after validation.
- installer env sets `PYTHONUTF8`, `PYTHONIOENCODING`, and preserves existing `PYTHONPATH`.

- [ ] **Step 2: Run the installer tests and verify they fail**

Run:

```bash
npm test -- electron/__tests__/python-runtime-installer.test.js
```

Expected: FAIL with a module-not-found error for `electron/services/pythonRuntimeInstaller.js`.

- [ ] **Step 3: Create the installer service**

Create `electron/services/pythonRuntimeInstaller.js` from source commit `cb800555a7be523e1577f2a158e8bac20eb9ee15`. Keep the source branch's exported API exactly:

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

The implementation must include:

- `MIN_PYTHON = { major: 3, minor: 11 }`.
- `REQUIRED_IMPORTS` entries for `browserUse`, `playwright`, `selenium`, and `fastapi`.
- `getUserPythonDepsPath(env)` returning `AGENTDEV_PYTHON_DEPS_DIR` or `<app-data>/python/browser-use/.deps`.
- staged install to `.deps-staging-<pid>-<timestamp>`.
- rollback of existing deps if publish fails.
- `installPythonWithWinget()` guarded to Windows only.
- `installBrowserRuntime()` running `python -m pip install -r requirements.txt --target <staging> --upgrade`, then `python -m playwright install chromium`, then validation before and after publishing.

- [ ] **Step 4: Run the installer tests and verify they pass**

Run:

```bash
npm test -- electron/__tests__/python-runtime-installer.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit installer service**

Run:

```bash
git add electron/services/pythonRuntimeInstaller.js electron/__tests__/python-runtime-installer.test.js
git commit -m "feat: add browser runtime installer"
```

### Task 3: Python Bootstrap Detection

**Files:**
- Modify: `electron/services/pythonBootstrap.js`
- Modify: `electron/__tests__/python-bootstrap.test.js`

- [ ] **Step 1: Update Python bootstrap tests**

Replace `electron/__tests__/python-bootstrap.test.js` with the source commit version from `cb800555a7be523e1577f2a158e8bac20eb9ee15`. Keep these assertions:

```js
expect(steps).toEqual(['Python runtime dependencies are ready.'])
expect(env.PYTHONPATH.split(path.delimiter)).toEqual([depsDir, 'existing'])
expect(env.PYTHONPATH.split(path.delimiter)).toEqual([installedDeps, bundledDeps, 'existing'])
expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe('0')
```

- [ ] **Step 2: Run Python bootstrap tests and verify they fail**

Run:

```bash
npm test -- electron/__tests__/python-bootstrap.test.js
```

Expected: FAIL because `buildPythonEnv` is not exported and Selenium/runtime dependency checks are not implemented.

- [ ] **Step 3: Replace Python bootstrap with installer-aware detection**

Replace `electron/services/pythonBootstrap.js` with the source commit version from `cb800555a7be523e1577f2a158e8bac20eb9ee15`. Preserve these exported names:

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

Verify the implementation:

- imports `execFileSync`, `execSync`, `fs`, `path`.
- imports `{ REQUIRED_IMPORTS, findCompatiblePython, getUserPythonDepsPath }` from `./pythonRuntimeInstaller`.
- `buildPythonEnv(rootDir, baseEnv)` prepends user deps before bundled deps and existing `PYTHONPATH`.
- `detect(options)` returns `available`, `browserUseInstalled`, `playwrightInstalled`, `seleniumInstalled`, `bundledDepsPath`, and `userDepsPath`.
- `getSetupGuide()` returns English ASCII setup messages.

- [ ] **Step 4: Run Python bootstrap tests and verify they pass**

Run:

```bash
npm test -- electron/__tests__/python-bootstrap.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Python bootstrap work**

Run:

```bash
git add electron/services/pythonBootstrap.js electron/__tests__/python-bootstrap.test.js
git commit -m "feat: detect browser runtime dependencies"
```

### Task 4: Bridge Supervisor and Main Installer Mode

**Files:**
- Modify: `electron/services/bridgeSupervisor.js`
- Modify: `electron/main.js`
- Modify: `electron/__tests__/bridge-supervisor.test.js`
- Modify: `electron/__tests__/packaging.test.js`

- [ ] **Step 1: Add bridge supervisor tests**

In `electron/__tests__/bridge-supervisor.test.js`, add tests that verify:

```js
it('adds packaged browser-use Python deps to the bridge environment', async () => {})
it('uses a compatible Python executable when starting the browser-use bridge', async () => {})
```

The tests should create temporary `.deps` directories under `rootDir/server/browser-use-bridge/.deps` and/or `AGENTDEV_PYTHON_DEPS_DIR`, start a supervisor with fake `spawnImpl`, and assert:

```js
expect(browserUse.env.PYTHONPATH.split(path.delimiter)).toEqual([installedDeps, bundledDeps])
expect(browserUse.env.PLAYWRIGHT_BROWSERS_PATH).toBe('0')
expect(browserUse.cmd).toContain('python')
expect(browserUse.args).toEqual(expect.arrayContaining(['-u']))
```

Do not add any expectation for `UITARS_MODEL_PROVIDER`, `doubaoVisionApiKey`, or Qwen/Doubao fields.

- [ ] **Step 2: Run bridge supervisor tests and verify they fail**

Run:

```bash
npm test -- electron/__tests__/bridge-supervisor.test.js
```

Expected: FAIL because `bridgeSupervisor` does not yet call `buildPythonEnv()` or `findCompatiblePython()`.

- [ ] **Step 3: Inject Python dependency env into Browser Use bridge**

In `electron/services/bridgeSupervisor.js`, add:

```js
const { buildPythonEnv, findCompatiblePython } = require('./pythonBootstrap')
```

Change the first line inside `buildEnv(key)` from:

```js
const env = { ...process.env }
```

to:

```js
const env = key === 'browserUse' ? buildPythonEnv(rootDir, process.env) : { ...process.env }
```

Add this helper before `snapshot()`:

```js
function resolvePythonSpawn() {
  const python = findCompatiblePython(process.env)
  return python ? { command: python.command, args: python.args || [] } : { command: 'python', args: [] }
}
```

Inside `startOneLocked`, before spawning a child, add:

```js
const pythonSpawn = runtime === 'python' ? resolvePythonSpawn() : null
```

Change the Python spawn branch from:

```js
? spawnImpl('python', ['-u', path.join(rootDir, cfg.dir, 'main.py'), String(cfg.port)], spawnOptions)
```

to:

```js
? spawnImpl(pythonSpawn.command, [...pythonSpawn.args, '-u', path.join(rootDir, cfg.dir, 'main.py'), String(cfg.port)], spawnOptions)
```

- [ ] **Step 4: Add main process installer mode test**

The packaging test added in Task 1 already checks `main.js` for `--install-browser-runtime` and `setBridgeContext({ pythonBootstrap, supervisor })`. Keep that test and do not add a duplicate test file.

- [ ] **Step 5: Add installer mode to `electron/main.js`**

In `electron/main.js`, add imports:

```js
const pythonBootstrap = require('./services/pythonBootstrap')
const { installBrowserRuntime } = require('./services/pythonRuntimeInstaller')
```

Add after `shouldOpenDevTools`:

```js
const installBrowserRuntimeOnly = process.argv.includes('--install-browser-runtime')
```

Wrap the existing `app.whenReady().then(async () => { ... })` block with:

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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}
```

Make sure the old line `setBridgeContext({ pythonBootstrap: null, supervisor })` is removed.

- [ ] **Step 6: Run bridge and packaging tests**

Run:

```bash
npm test -- electron/__tests__/bridge-supervisor.test.js electron/__tests__/packaging.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit bridge/main work**

Run:

```bash
git add electron/services/bridgeSupervisor.js electron/main.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/packaging.test.js
git commit -m "feat: wire browser runtime into bridge startup"
```

### Task 5: Runtime Repair and Setup Status

**Files:**
- Modify: `electron/services/browserUse/index.js`
- Modify: `electron/ipc/runtime.js`
- Modify: `electron/ipc/setupStatus.js`
- Modify: `electron/__tests__/runtime-ipc.test.js`
- Modify: `electron/__tests__/setup-status-ipc.test.js`

- [ ] **Step 1: Add runtime repair tests**

In `electron/__tests__/runtime-ipc.test.js`, add:

```js
test('runtime bootstrap repairs browser-use runtime', async () => {
  const browserUse = require('../services/browserUse')
  const repairSpy = vi.spyOn(browserUse, 'repair').mockResolvedValue({
    runtime: 'browser-use',
    state: 'installed',
    depsPath: 'C:\\deps',
    python: 'C:\\Python312\\python.exe',
    pythonVersion: '3.12.0'
  })

  const ipcMain = ipc()
  runtime.register(ipcMain)
  const result = await ipcMain.handlers.get('runtime:bootstrap')({}, { runtime: 'browser-use' })

  expect(result.ok).toBe(true)
  expect(result.runtime.state).toBe('installed')
  expect(repairSpy).toHaveBeenCalled()
})
```

- [ ] **Step 2: Add setup status dependency tests**

In `electron/__tests__/setup-status-ipc.test.js`, update the Browser tier tests to include Browser Use key and Selenium:

```js
it('reports browser tier ready when keys and python deps are available', async () => {
  const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', browserUseApiKey: 'b' }) }
  setBridgeContext({
    pythonBootstrap: { detect: async () => ({ available: true, browserUseInstalled: true, playwrightInstalled: true, seleniumInstalled: true, userDepsPath: 'deps' }) },
    supervisor: null
  })
  const status = await computeSetupStatus({ storeRef: fakeStore })
  expect(status.tiers.browser.ready).toBe(true)
  expect(status.deps.browserUseKey).toBe(true)
  expect(status.deps.selenium).toBe(true)
  expect(status.deps.pythonDepsInstalled).toBe(true)
})

it('reports browser tier not ready when Browser Use key is missing', async () => {
  const fakeStore = { getConfig: () => ({ deepseekApiKey: 'k', browserUseApiKey: '' }) }
  setBridgeContext({
    pythonBootstrap: { detect: async () => ({ available: true, browserUseInstalled: true, playwrightInstalled: true, seleniumInstalled: true }) },
    supervisor: null
  })
  const status = await computeSetupStatus({ storeRef: fakeStore })
  expect(status.tiers.browser.ready).toBe(false)
  expect(status.deps.browserUseKey).toBe(false)
})
```

Update the help-link test expected value to:

```js
expect(status.helpLinks).toEqual({
  deepseekKey: 'https://platform.deepseek.com/api_keys',
  browserUseKey: 'https://zenmux.ai/'
})
```

Update the `setup:set-key updates the matching store field` test to also assert:

```js
expect(handlers.get('setup:set-key')({}, { dep: 'browserUseKey', value: '  sk-browser  ' })).toEqual({ ok: true })
expect(setConfig).toHaveBeenCalledWith({ browserUseApiKey: 'sk-browser' })
```

- [ ] **Step 3: Run runtime/setup tests and verify they fail**

Run:

```bash
npm test -- electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js
```

Expected: FAIL because Browser Use repair and setup status Browser Use dependency fields are not implemented.

- [ ] **Step 4: Make Browser Use repair call the installer**

In `electron/services/browserUse/index.js`, add:

```js
const { installBrowserRuntime } = require('../pythonRuntimeInstaller')
```

Replace `repair()` with:

```js
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

Update `getSetupGuide()` steps to mention installer/runtime repair and Browser Use API key. Keep the active provider as Browser Use/ZenMux, not Doubao.

- [ ] **Step 5: Add Browser Use bootstrap support**

In `electron/ipc/runtime.js`, add:

```js
const browserUse = require('../services/browserUse')
```

Inside `bootstrapRuntime`, add before dry-run:

```js
if (runtime === 'browser-use') return browserUse.repair()
```

Do not add Qwen or Doubao runtime entries.

- [ ] **Step 6: Expand setup status without Qwen/Doubao**

In `electron/ipc/setupStatus.js`, change `KEY_FIELD_MAP` to:

```js
const KEY_FIELD_MAP = {
  deepseekKey: 'deepseekApiKey',
  browserUseKey: 'browserUseApiKey'
}
```

Change `deps` initialization to:

```js
const deps = {
  deepseekKey: Boolean(cfg.deepseekApiKey),
  browserUseKey: Boolean(cfg.browserUseApiKey)
}
```

When Python detection succeeds, set:

```js
deps.python = Boolean(pyResult.available ?? pyResult.python)
deps.browserUse = Boolean(pyResult.browserUseInstalled ?? pyResult.browserUse)
deps.playwright = Boolean(pyResult.playwrightInstalled ?? pyResult.playwright)
deps.selenium = Boolean(pyResult.seleniumInstalled ?? pyResult.selenium)
deps.pythonDepsBundled = Boolean(pyResult.bundledDepsPath)
deps.pythonDepsInstalled = Boolean(pyResult.userDepsPath)
```

Change browser tier to:

```js
browser: {
  label: '浏览器自动化',
  requires: ['deepseekKey', 'browserUseKey'],
  ready: Boolean(deps.deepseekKey && deps.browserUseKey && deps.python && deps.browserUse && deps.playwright && deps.selenium),
  recommended: true
}
```

Change help links to:

```js
helpLinks: {
  deepseekKey: 'https://platform.deepseek.com/api_keys',
  browserUseKey: 'https://zenmux.ai/'
}
```

- [ ] **Step 7: Run runtime/setup tests and verify they pass**

Run:

```bash
npm test -- electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit runtime/setup work**

Run:

```bash
git add electron/services/browserUse/index.js electron/ipc/runtime.js electron/ipc/setupStatus.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js
git commit -m "feat: repair browser runtime from settings"
```

### Task 6: Targeted Regression Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Verify removed providers stay removed**

Run:

```bash
git grep -n "require('./doubao')\\|require('../services/doubao')\\|qwenProvider\\|doubaoVisionApiKey\\|qwenApiKey" -- electron client/src package.json
```

Expected: no active source references except tests asserting legacy keys are stripped. If this command reports only files under `electron/__tests__`, rerun the active-source check with:

```bash
git grep -n "require('./doubao')\\|require('../services/doubao')\\|qwenProvider\\|doubaoVisionApiKey\\|qwenApiKey" -- electron client/src package.json ':!electron/__tests__'
```

Expected for the second command: no output. If references appear in active source, remove them before continuing.

- [ ] **Step 2: Run targeted backend/runtime tests**

Run:

```bash
npm test -- electron/__tests__/python-runtime-installer.test.js electron/__tests__/python-bootstrap.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/runtime-ipc.test.js electron/__tests__/setup-status-ipc.test.js electron/__tests__/packaging.test.js electron/__tests__/store.test.js electron/__tests__/ipc.test.js
```

Expected: PASS.

- [ ] **Step 3: Run targeted frontend/chat tests**

Run:

```bash
npm test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 4: Run full suite if environment allows**

Run:

```bash
npm test
```

Expected: PASS. If native rebuild or local dependency issues block the full suite, record the exact command, exit code, and first actionable error.

- [ ] **Step 5: Review final diff**

Run:

```bash
git diff --stat g-sleeper/dev..HEAD
git diff --name-status g-sleeper/dev..HEAD
```

Expected: changed files match the plan surface. No `release/*.exe` file is present.

- [ ] **Step 6: Commit any verification-only corrections**

If Task 6 required source/test fixes, commit them:

```bash
git add <changed-files>
git commit -m "test: verify browser runtime merge"
```

If no fixes were needed, do not create an empty commit.

### Task 7: Completion Review

**Files:**
- No source edits expected.

- [ ] **Step 1: Self-review correctness**

Check these outcomes manually:

- `g-sleeper/dev-liushuai` content remains represented because `g-sleeper/dev` and `g-sleeper/dev-liushuai` had identical trees before implementation.
- `electron/services/doubao.js` and `electron/services/models/qwenProvider.js` are not reintroduced.
- `runtime:bootstrap` handles `browser-use`.
- installer mode exits with `0` on successful runtime install and `2` on failure.
- `prepare-bridges.js` does not install Python packages during build.
- setup status can report Python, Browser Use, Playwright, Selenium, bundled deps, and user deps.

- [ ] **Step 2: Produce final status**

Run:

```bash
git status --short --branch
git log --oneline --decorate -n 8
```

Expected: clean working tree on `merge-dev-xulinjie-liushuai` with implementation commits after the design/plan commits.
