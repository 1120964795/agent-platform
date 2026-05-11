# Browser Use ZenMux Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Browser-Use its own tested ZenMux/OpenAI-compatible model configuration, separate from Doubao Vision, and expose it cleanly in Settings.

**Architecture:** Electron owns persistent configuration and starts the Python browser-use bridge with environment variables derived from the dedicated Browser-Use fields. The Python bridge reads those variables, builds `ChatOpenAI` for ZenMux/OpenAI-compatible providers, and respects a persisted vision toggle. The React settings page shows a separate Browser Use API card, masked saved-key state, and a Runtime restart action so new configuration is applied without restarting the whole app.

**Tech Stack:** Electron IPC, Node/Vitest, React/Vite, Python FastAPI bridge, browser-use 0.12.6, OpenAI-compatible Chat Completions via ZenMux.

---

## Scope

Implement these behaviors:

- Browser-Use no longer reuses `doubaoVisionEndpoint`, `doubaoVisionApiKey`, or `doubaoVisionModel`.
- Browser-Use defaults match the working test:
  - endpoint: `https://zenmux.ai/api/v1`
  - model: `openai/gpt-5.5`
  - vision enabled: `true`
- Settings > Models has a fourth API section named `Browser Use`.
- Browser Use API key is masked after save/reload the same way as Qwen, DeepSeek, and Doubao.
- Runtime diagnostics for Browser-Use mention Browser-Use fields, not Doubao fields.
- Changing Browser-Use config can be applied by restarting the Browser-Use bridge from Settings > Runtime.
- Python bridge can run with `use_vision=true` or `use_vision=false` from environment.
- BrowserSession shutdown does not assume `.close()` exists; it tries known lifecycle methods.

Non-goals:

- Do not store the user's real ZenMux key in the repository.
- Do not remove Doubao Vision; UI-TARS still uses Doubao Vision.
- Do not add Browser Use official `ChatBrowserUse` provider in this pass. This pass targets the ZenMux/OpenAI-compatible path that was just verified.

## File Structure

- `electron/store.js`
  - Adds Browser-Use defaults and masks `browserUseApiKey`.

- `electron/ipc/config.js`
  - Sanitizes Browser-Use config patches.

- `electron/services/bridgeSupervisor.js`
  - Builds Browser-Use bridge env from dedicated Browser-Use config.
  - Reports Browser-Use-specific missing config in diagnostics.

- `server/browser-use-bridge/browser_agent.py`
  - Reads Browser-Use env defaults.
  - Adds a bool parser for `BROWSER_USE_VISION_ENABLED`.
  - Passes `use_vision` dynamically to `Agent`.
  - Adds lifecycle-safe browser closing.

- `client/src/pages/SettingsPage.jsx`
  - Adds Browser Use model config card.
  - Tracks masked Browser-Use key.
  - Deletes empty Browser-Use key from save payload.
  - Adds runtime bridge restart button and status refresh.

- `electron/__tests__/store.test.js`
  - Covers Browser-Use defaults and masked key.

- `electron/__tests__/ipc.test.js`
  - Covers Browser-Use sanitize/persist through `config:set`.

- `electron/__tests__/bridge-supervisor.test.js`
  - Covers Browser-Use env and diagnostics separation from Doubao.

- `server/browser-use-bridge/test_browser_agent.py`
  - Covers env-driven vision flag and lifecycle-safe shutdown.

- `client/src/components/chat/unified-chat-ui.test.js`
  - Covers Browser Use settings card, fourth ExternalLink API key button, masked saved key, and restart wiring.

---

### Task 1: Add Dedicated Browser-Use Config Fields

**Files:**
- Modify: `electron/store.js`
- Modify: `electron/ipc/config.js`
- Test: `electron/__tests__/store.test.js`
- Test: `electron/__tests__/ipc.test.js`

- [ ] **Step 1: Write failing store tests for Browser-Use defaults and masking**

In `electron/__tests__/store.test.js`, update the first default-config test by adding these expectations after the Doubao expectations:

```js
expect(config.browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
expect(config.browserUseApiKey).toBe('')
expect(config.browserUseModel).toBe('openai/gpt-5.5')
expect(config.browserUseVisionEnabled).toBe(true)
```

Add this new test below `setConfig persists patches`:

```js
test('getMaskedConfig masks Browser-Use API key', () => {
  store.setConfig({ browserUseApiKey: 'sk-ai-v1-abcdef1234567890' })

  expect(store.getMaskedConfig().browserUseApiKey).toBe('sk-ai***7890')
})
```

- [ ] **Step 2: Write failing IPC sanitize test**

In `electron/__tests__/ipc.test.js`, add this test after `config handlers read and patch config`:

```js
test('config handlers persist Browser-Use settings and mask key', async () => {
  const ipcMain = createIpcMain()
  registerAll(ipcMain)

  const setResult = await ipcMain.handlers.get('config:set')({}, {
    browserUseApiKey: '  sk-ai-v1-browser-use  ',
    browserUseEndpoint: '  https://zenmux.ai/api/v1  ',
    browserUseModel: '  openai/gpt-5.5  ',
    browserUseVisionEnabled: true
  })

  expect(setResult.ok).toBe(true)
  expect(setResult.config.browserUseApiKey).toBe('sk-ai***-use')
  expect(store.getConfig().browserUseApiKey).toBe('sk-ai-v1-browser-use')
  expect(store.getConfig().browserUseEndpoint).toBe('https://zenmux.ai/api/v1')
  expect(store.getConfig().browserUseModel).toBe('openai/gpt-5.5')
  expect(store.getConfig().browserUseVisionEnabled).toBe(true)
})
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
npm.cmd test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js
```

Expected: FAIL because `browserUseEndpoint`, `browserUseApiKey`, `browserUseModel`, and `browserUseVisionEnabled` do not exist or are not sanitized/masked.

- [ ] **Step 4: Add defaults and masking in `electron/store.js`**

In `DEFAULT_CONFIG`, insert this block after the Doubao Vision fields:

```js
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseApiKey: '',
  browserUseModel: 'openai/gpt-5.5',
  browserUseVisionEnabled: true,
```

In `getMaskedConfig()`, add this property after `doubaoVisionApiKey`:

```js
      browserUseApiKey: mask(config.browserUseApiKey || '')
```

Make sure the object comma placement is valid:

```js
      deepseekApiKey: mask(config.deepseekApiKey || ''),
      doubaoVisionApiKey: mask(config.doubaoVisionApiKey || ''),
      browserUseApiKey: mask(config.browserUseApiKey || '')
```

- [ ] **Step 5: Add Browser-Use sanitization in `electron/ipc/config.js`**

After the Doubao Vision sanitizer lines, add:

```js
  if (typeof input.browserUseApiKey === 'string' && input.browserUseApiKey && !input.browserUseApiKey.includes('***')) patch.browserUseApiKey = input.browserUseApiKey.trim()
  if (typeof input.browserUseEndpoint === 'string' && input.browserUseEndpoint) patch.browserUseEndpoint = input.browserUseEndpoint.trim()
  if (typeof input.browserUseModel === 'string' && input.browserUseModel) patch.browserUseModel = input.browserUseModel.trim()
  if (typeof input.browserUseVisionEnabled === 'boolean') patch.browserUseVisionEnabled = input.browserUseVisionEnabled
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```powershell
npm.cmd test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add electron/store.js electron/ipc/config.js electron/__tests__/store.test.js electron/__tests__/ipc.test.js
git commit -m "feat: add browser-use model config"
```

---

### Task 2: Wire Browser-Use Supervisor Env and Diagnostics

**Files:**
- Modify: `electron/services/bridgeSupervisor.js`
- Test: `electron/__tests__/bridge-supervisor.test.js`

- [ ] **Step 1: Write failing supervisor env test**

In `electron/__tests__/bridge-supervisor.test.js`, update `starts all bridges and waits for /health` by replacing the Browser-Use env assertions:

```js
expect(browserUse.env.BROWSER_USE_MODEL_ENDPOINT).toBe('https://zenmux.ai/api/v1')
expect(browserUse.env.BROWSER_USE_MODEL_API_KEY).toBe('')
expect(browserUse.env.BROWSER_USE_MODEL_NAME).toBe('openai/gpt-5.5')
expect(browserUse.env.BROWSER_USE_VISION_ENABLED).toBe('true')
```

Keep these UI-TARS assertions unchanged:

```js
expect(uitars.env.UITARS_MODEL_PROVIDER).toBe('volcengine')
expect(uitars.env.UITARS_MODEL_ENDPOINT).toContain('volces.com')
```

- [ ] **Step 2: Write failing diagnostics test**

Add this test before `stop() kills all children`:

```js
it('reports Browser-Use config fields separately from Doubao diagnostics', async () => {
  const sup = createSupervisor({
    spawnImpl: () => ({ on() {}, kill() {}, killed: false }),
    healthImpl: async () => ({ ok: false })
  })

  const result = await sup.start({ healthTimeoutMs: 50, maxRestarts: 0 })

  expect(result.browserUse.state).toBe('failed')
  expect(result.browserUse.diagnostics.missingConfig).toEqual(['browserUseApiKey'])
  expect(result.browserUse.diagnostics.nextSteps).toEqual(expect.arrayContaining([
    expect.stringContaining('browserUseApiKey')
  ]))
})
```

- [ ] **Step 3: Run supervisor tests and verify failure**

Run:

```powershell
npm.cmd test -- electron/__tests__/bridge-supervisor.test.js
```

Expected: FAIL because Browser-Use still uses Doubao config fields.

- [ ] **Step 4: Update `buildDiagnostics()` in `bridgeSupervisor.js`**

Replace the current missing-config block:

```js
  const missingConfig = []
  if ((key === 'uitars' || key === 'browserUse') && !config.doubaoVisionApiKey) missingConfig.push('doubaoVisionApiKey')
  if ((key === 'uitars' || key === 'browserUse') && !config.doubaoVisionEndpoint) missingConfig.push('doubaoVisionEndpoint')
  if ((key === 'uitars' || key === 'browserUse') && !config.doubaoVisionModel) missingConfig.push('doubaoVisionModel')
```

with:

```js
  const missingConfig = []
  if (key === 'uitars') {
    if (!config.doubaoVisionApiKey) missingConfig.push('doubaoVisionApiKey')
    if (!config.doubaoVisionEndpoint) missingConfig.push('doubaoVisionEndpoint')
    if (!config.doubaoVisionModel) missingConfig.push('doubaoVisionModel')
  }
  if (key === 'browserUse') {
    if (!config.browserUseApiKey) missingConfig.push('browserUseApiKey')
    if (!config.browserUseEndpoint) missingConfig.push('browserUseEndpoint')
    if (!config.browserUseModel) missingConfig.push('browserUseModel')
  }
```

- [ ] **Step 5: Update Browser-Use env in `buildEnv()`**

Replace the Browser-Use env block:

```js
    if (key === 'browserUse') {
      env.BROWSER_USE_MODEL_ENDPOINT = config.doubaoVisionEndpoint || ''
      env.BROWSER_USE_MODEL_API_KEY = config.doubaoVisionApiKey || ''
      env.BROWSER_USE_MODEL_NAME = config.doubaoVisionModel || 'doubao-seed-1-6-vision-250815'
    }
```

with:

```js
    if (key === 'browserUse') {
      env.BROWSER_USE_MODEL_ENDPOINT = config.browserUseEndpoint || 'https://zenmux.ai/api/v1'
      env.BROWSER_USE_MODEL_API_KEY = config.browserUseApiKey || ''
      env.BROWSER_USE_MODEL_NAME = config.browserUseModel || 'openai/gpt-5.5'
      env.BROWSER_USE_VISION_ENABLED = config.browserUseVisionEnabled === false ? 'false' : 'true'
    }
```

- [ ] **Step 6: Run supervisor tests and verify pass**

Run:

```powershell
npm.cmd test -- electron/__tests__/bridge-supervisor.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add electron/services/bridgeSupervisor.js electron/__tests__/bridge-supervisor.test.js
git commit -m "feat: pass browser-use config to bridge"
```

---

### Task 3: Make Python Browser-Use Bridge Use Env Vision and Safe Lifecycle

**Files:**
- Modify: `server/browser-use-bridge/browser_agent.py`
- Test: `server/browser-use-bridge/test_browser_agent.py`

- [ ] **Step 1: Write failing test for `BROWSER_USE_VISION_ENABLED=false`**

In `server/browser-use-bridge/test_browser_agent.py`, add this test after `test_run_task_marks_blank_browser_result_incomplete`:

```python
def test_run_task_respects_vision_disabled_env(monkeypatch):
    import browser_agent

    captured = {}

    class FakeHistory:
        def urls(self):
            return ["https://example.com/"]

        def final_result(self):
            return "Example Domain"

        def number_of_steps(self):
            return 1

        def total_duration_seconds(self):
            return 0.5

        def is_successful(self):
            return True

    class FakeAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, max_steps):
            return FakeHistory()

    reset_fake_browser()
    monkeypatch.setenv("BROWSER_USE_VISION_ENABLED", "false")
    monkeypatch.setattr(browser_agent, "Browser", FakeBrowser)
    monkeypatch.setattr(browser_agent, "Agent", FakeAgent)
    monkeypatch.setattr(BrowserAgentPool, "_build_llm", lambda self: object())

    result = asyncio.run(BrowserAgentPool().run_task(BrowserTask(
        goal="Open https://example.com and tell me the title.",
        start_url="https://example.com",
    )))

    assert result.success is True
    assert captured["use_vision"] is False
```

- [ ] **Step 2: Write failing test for browser lifecycle fallback**

Add this test after `test_recreates_browser_when_headless_mode_changes`:

```python
def test_recreates_browser_using_kill_when_close_is_missing(monkeypatch):
    import browser_agent

    class KillOnlyBrowser:
        instances = []

        def __init__(self, headless=True):
            self.requested_headless = headless
            self.killed = False
            KillOnlyBrowser.instances.append(self)

        async def kill(self):
            self.killed = True

    monkeypatch.setattr(browser_agent, "Browser", KillOnlyBrowser)
    pool = BrowserAgentPool()

    first = asyncio.run(pool._ensure_browser(True))
    second = asyncio.run(pool._ensure_browser(False))

    assert second is not first
    assert first.killed is True
    assert second.requested_headless is False
```

- [ ] **Step 3: Run Python tests and verify failure**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py
```

Expected: FAIL because `use_vision` is hard-coded to `True` and `_ensure_browser()` calls `.close()` directly.

- [ ] **Step 4: Add env defaults, bool parser, vision method, and lifecycle helper**

In `server/browser-use-bridge/browser_agent.py`, add these constants after the imports:

```python
DEFAULT_BROWSER_USE_ENDPOINT = "https://zenmux.ai/api/v1"
DEFAULT_BROWSER_USE_MODEL = "openai/gpt-5.5"
```

Add this function before `BrowserAgentPool`:

```python
def env_bool(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}
```

In `BrowserAgentPool`, add this method after `_build_llm()`:

```python
    def _use_vision(self) -> bool:
        return env_bool("BROWSER_USE_VISION_ENABLED", True)
```

Add this async method after `_use_vision()`:

```python
    async def _close_browser(self):
        if not self._browser:
            return
        for method_name in ("close", "kill", "stop", "reset"):
            method = getattr(self._browser, method_name, None)
            if not callable(method):
                continue
            result = method()
            if hasattr(result, "__await__"):
                await result
            return
```

- [ ] **Step 5: Update `_build_llm()` defaults**

Replace:

```python
        endpoint = os.environ.get("BROWSER_USE_MODEL_ENDPOINT", "")
        api_key = os.environ.get("BROWSER_USE_MODEL_API_KEY", "")
        model_name = os.environ.get("BROWSER_USE_MODEL_NAME", "doubao-seed-1-6-vision-250815")
```

with:

```python
        endpoint = os.environ.get("BROWSER_USE_MODEL_ENDPOINT", DEFAULT_BROWSER_USE_ENDPOINT)
        api_key = os.environ.get("BROWSER_USE_MODEL_API_KEY", "")
        model_name = os.environ.get("BROWSER_USE_MODEL_NAME", DEFAULT_BROWSER_USE_MODEL)
```

- [ ] **Step 6: Replace direct browser close calls**

In `_ensure_browser()`, replace:

```python
            try:
                await self._browser.close()
            except Exception:
                pass
```

with:

```python
            try:
                await self._close_browser()
            except Exception:
                pass
```

In `close()`, replace:

```python
            try:
                await self._browser.close()
            except Exception:
                pass
```

with:

```python
            try:
                await self._close_browser()
            except Exception:
                pass
```

- [ ] **Step 7: Pass env-driven vision flag to `Agent`**

Replace:

```python
                use_vision=True,
```

with:

```python
                use_vision=self._use_vision(),
```

- [ ] **Step 8: Run Python tests and verify pass**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add server/browser-use-bridge/browser_agent.py server/browser-use-bridge/test_browser_agent.py
git commit -m "feat: configure browser-use vision runtime"
```

---

### Task 4: Add Browser Use API Card to Settings > Models

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`
- Test: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing UI wiring assertions**

In `client/src/components/chat/unified-chat-ui.test.js`, update `SettingsPage shows external-link buttons for all model API keys`:

```js
expect(settings.match(/<ApiKeyInput /g)).toHaveLength(4)
expect(settings).toContain('id="settings-browser-use-api-key"')
expect(settings).toContain("browserUseApiKey: ''")
expect(settings).toContain('https://zenmux.ai/')
```

Keep the Qwen, DeepSeek, and Doubao assertions.

In `SettingsPage keeps masked API key state visible after save or reload`, add:

```js
expect(settings).toContain("placeholder={maskedKeys.browserUseApiKey || 'ZenMux API Key'}")
expect(settings).toContain('savedValue={maskedKeys.browserUseApiKey}')
```

Add this new test below the masked-key test:

```js
test('SettingsPage exposes Browser Use endpoint model and vision toggle', () => {
  const settings = readProjectFile('client/src/pages/SettingsPage.jsx')

  expect(settings).toContain('Browser Use')
  expect(settings).toContain('browserUseEndpoint')
  expect(settings).toContain('browserUseModel')
  expect(settings).toContain('browserUseVisionEnabled')
  expect(settings).toContain('https://zenmux.ai/api/v1')
  expect(settings).toContain('openai/gpt-5.5')
})
```

- [ ] **Step 2: Run UI test and verify failure**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because the Browser Use card does not exist.

- [ ] **Step 3: Add Browser-Use defaults and link**

In `client/src/pages/SettingsPage.jsx`, add these fields to `DEFAULT_FORM` after Doubao fields:

```js
  browserUseEndpoint: 'https://zenmux.ai/api/v1',
  browserUseModel: 'openai/gpt-5.5',
  browserUseApiKey: '',
  browserUseVisionEnabled: true,
```

Add this link to `API_KEY_LINKS`:

```js
  browserUse: 'https://zenmux.ai/'
```

The final object should be:

```js
const API_KEY_LINKS = {
  qwen: 'https://bailian.console.aliyun.com/',
  deepseek: 'https://platform.deepseek.com/api_keys',
  doubao: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
  browserUse: 'https://zenmux.ai/'
}
```

- [ ] **Step 4: Track masked Browser-Use key**

In `applyConfig(config = {})`, update `setMaskedKeys`:

```js
    setMaskedKeys({
      qwenApiKey: config.qwenApiKey || '',
      deepseekApiKey: config.deepseekApiKey || config.apiKey || '',
      doubaoVisionApiKey: config.doubaoVisionApiKey || '',
      browserUseApiKey: config.browserUseApiKey || ''
    })
```

Update the `setForm` call:

```js
    setForm(current => ({
      ...current,
      ...config,
      qwenApiKey: '',
      deepseekApiKey: '',
      doubaoVisionApiKey: '',
      browserUseApiKey: ''
    }))
```

- [ ] **Step 5: Preserve saved Browser-Use key when input is blank**

In `save()`, after the Doubao deletion line, add:

```js
      if (!payload.browserUseApiKey) delete payload.browserUseApiKey
```

- [ ] **Step 6: Add Browser Use card**

In the Models tab, after the Doubao Vision section, insert:

```jsx
              <section className="space-y-3 rounded-md border border-[color:var(--border)] p-3">
                <h3 className="text-sm font-medium">Browser Use</h3>
                <ApiKeyInput id="settings-browser-use-api-key" label="Browser Use API Key" value={form.browserUseApiKey} onChange={(event) => patch({ browserUseApiKey: event.target.value })} placeholder={maskedKeys.browserUseApiKey || 'ZenMux API Key'} url={API_KEY_LINKS.browserUse} savedValue={maskedKeys.browserUseApiKey} />
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Endpoint<input value={form.browserUseEndpoint} onChange={(event) => patch({ browserUseEndpoint: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="block space-y-1 text-xs text-[color:var(--text-muted)]">Model<input value={form.browserUseModel} onChange={(event) => patch({ browserUseModel: event.target.value })} className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--bg-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--accent)]" /></label>
                <label className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
                  <input type="checkbox" checked={form.browserUseVisionEnabled !== false} onChange={(event) => patch({ browserUseVisionEnabled: event.target.checked })} />
                  Vision enabled
                </label>
              </section>
```

- [ ] **Step 7: Run UI test and verify pass**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 8: Build client**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add client/src/pages/SettingsPage.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: add browser-use settings card"
```

---

### Task 5: Add Browser-Use Bridge Restart Control in Settings > Runtime

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`
- Test: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing restart wiring assertions**

In `client/src/components/chat/unified-chat-ui.test.js`, add these assertions to `bridge failures navigate to runtime diagnostics`:

```js
expect(settings).toContain('restartBridge')
expect(settings).toContain("window.electronAPI?.invoke?.('bridge:restart'")
expect(settings).toContain('onRestart')
expect(settings).toContain('bridgeKey="browserUse"')
expect(settings).toContain('bridgeKey="uitars"')
```

- [ ] **Step 2: Run UI test and verify failure**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: FAIL because `restartBridge` does not exist in `SettingsPage.jsx`.

- [ ] **Step 3: Add restart props to `BridgeDetailCard`**

Change the component signature:

```js
function BridgeDetailCard({ label, bridge = {}, bridgeKey, onRestart, restarting = false }) {
```

Inside the header `div`, replace the state label:

```jsx
        <div className={`text-xs ${stateClass}`}>{stateLabel}</div>
```

with:

```jsx
        <div className="flex items-center gap-2">
          <div className={`text-xs ${stateClass}`}>{stateLabel}</div>
          {bridgeKey && (
            <button type="button" onClick={() => onRestart?.(bridgeKey)} disabled={restarting} className="h-7 rounded-md border border-[color:var(--border)] px-2 text-xs text-[color:var(--text-muted)] hover:bg-[color:var(--bg-tertiary)] disabled:opacity-50">
              {restarting ? 'Restarting' : 'Restart'}
            </button>
          )}
        </div>
```

- [ ] **Step 4: Add restart state and helpers to `SettingsPage`**

After the `saving` state, add:

```js
  const [restartingBridge, setRestartingBridge] = useState('')
```

Add this helper inside `SettingsPage`, before `save()`:

```js
  async function refreshBridgeStatus() {
    const result = await window.electronAPI?.invoke?.('bridge:status')
    setBridges(result?.bridges || {})
  }
```

Add this function before `save()`:

```js
  async function restartBridge(key) {
    setRestartingBridge(key)
    setMessage('')
    try {
      await window.electronAPI?.invoke?.('bridge:restart', { key })
      await refreshBridgeStatus()
      setMessage(`${key} restarted`)
    } catch (error) {
      setMessage(`Restart failed: ${error.message}`)
    } finally {
      setRestartingBridge('')
    }
  }
```

- [ ] **Step 5: Wire runtime cards to restart**

Replace:

```jsx
                <BridgeDetailCard label="Browser-Use Bridge" bridge={bridges.browserUse} />
                <BridgeDetailCard label="UI-TARS Bridge" bridge={bridges.uitars} />
```

with:

```jsx
                <BridgeDetailCard label="Browser-Use Bridge" bridge={bridges.browserUse} bridgeKey="browserUse" onRestart={restartBridge} restarting={restartingBridge === 'browserUse'} />
                <BridgeDetailCard label="UI-TARS Bridge" bridge={bridges.uitars} bridgeKey="uitars" onRestart={restartBridge} restarting={restartingBridge === 'uitars'} />
```

- [ ] **Step 6: Run UI test and verify pass**

Run:

```powershell
npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add client/src/pages/SettingsPage.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: restart bridges from settings"
```

---

### Task 6: Full Verification and Real Browser-Use Smoke

**Files:**
- No source changes unless a verification failure identifies a specific bug.

- [ ] **Step 1: Run focused JS tests**

Run:

```powershell
npm.cmd test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/browser-adapter.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 2: Run Python bridge tests**

Run:

```powershell
python -m pytest server/browser-use-bridge/test_browser_agent.py
```

Expected: PASS.

- [ ] **Step 3: Build frontend**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected: PASS.

- [ ] **Step 4: Run real Browser-Use ZenMux smoke without committing keys**

Set these environment variables only in the current shell session:

```powershell
$env:BROWSER_USE_MODEL_ENDPOINT='https://zenmux.ai/api/v1'
$env:BROWSER_USE_MODEL_API_KEY='<paste-user-zenmux-key-in-terminal-only>'
$env:BROWSER_USE_MODEL_NAME='openai/gpt-5.5'
$env:BROWSER_USE_VISION_ENABLED='true'
```

Run this Python one-liner from `C:\Users\g\Desktop\sinan`:

```powershell
python -c "import asyncio, json, sys; sys.path.insert(0, r'C:\Users\g\Desktop\sinan\server\browser-use-bridge'); from browser_agent import BrowserAgentPool, BrowserTask; async def main(): p=BrowserAgentPool(); r=await p.run_task(BrowserTask(goal='Open https://example.com and tell me the exact page title only.', max_steps=6, start_url='https://example.com', headless=True)); await p.close(); print(json.dumps({'success': r.success, 'summary': r.summary, 'final_url': r.final_url, 'error': r.error}, ensure_ascii=False)); asyncio.run(main())"
```

Expected output contains:

```json
{"success": true, "summary": "Example Domain", "final_url": "https://example.com/", "error": null}
```

- [ ] **Step 5: Start app and manually verify settings**

Run:

```powershell
npm.cmd run electron:dev
```

Expected:

- Settings > Models shows Qwen, DeepSeek, Doubao Vision, and Browser Use cards.
- Browser Use card has an API key input with an ExternalLink button.
- Browser Use defaults are `https://zenmux.ai/api/v1`, `openai/gpt-5.5`, and Vision enabled.
- Saving with a Browser Use key clears the input and leaves a masked saved indicator.
- Settings > Runtime has Restart buttons for Browser-Use Bridge and UI-TARS Bridge.

- [ ] **Step 6: Commit verification-only test fixes if any were needed**

If no source changes were made during verification, skip this commit. If a specific verification bug required a fix, commit only those changed files:

```powershell
git add <changed-files-from-verification-fix>
git commit -m "fix: stabilize browser-use settings verification"
```

---

## Self-Review

Spec coverage:

- Dedicated Browser-Use config: Task 1.
- ZenMux defaults: Task 1 and Task 4.
- Supervisor env separation from Doubao: Task 2.
- Python bridge model and vision behavior: Task 3.
- API configuration panel: Task 4.
- Runtime restart after config change: Task 5.
- Verification with existing unit tests and real browser-use smoke: Task 6.

Placeholder scan:

- No plan step contains forbidden placeholder tokens or an unspecified test instruction.
- Every code-changing step includes exact code blocks or exact replacements.

Type consistency:

- Config keys are consistent across tasks: `browserUseEndpoint`, `browserUseApiKey`, `browserUseModel`, `browserUseVisionEnabled`.
- Env keys are consistent across Electron and Python: `BROWSER_USE_MODEL_ENDPOINT`, `BROWSER_USE_MODEL_API_KEY`, `BROWSER_USE_MODEL_NAME`, `BROWSER_USE_VISION_ENABLED`.
- Bridge keys are consistent with existing supervisor state: `browserUse` and `uitars`.
