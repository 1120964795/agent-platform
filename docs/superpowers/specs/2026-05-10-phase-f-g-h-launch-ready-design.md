# AionUi Launch-Ready: Phase F, G, H Design

> **Goal:** Make AionUi runnable end-to-end — from app launch through API key configuration to completing tasks via browser-use and UI-TARS bridges — and produce a distributable installer.

**Architecture:** Three sequential phases. Each phase produces independently testable results. Phase F (cleanup + settings), Phase G (packaging + startup flow), Phase H (UX polish).

**Tech Stack:** Electron + React/Vite/Tailwind (client/), Node.js bridges, Python browser-use sidecar, SQLite (better-sqlite3).

---

## Current State

**Working:**
- Agent loop, tool policy, all 4 tools registered (browser_task, desktop_observe/click/type)
- Browser-use bridge (Python, port 8780), UI-TARS bridge (Node, port 8765)
- IPC layer, preload, renderer communication
- SQLite conversation persistence, Python bootstrap detection
- Settings panel exists (client/src/panels/SettingsPanel.jsx) but has outdated fields
- Bridge supervisor in main.js auto-starts bridges on app launch
- Chat/agent execution via `deepseek.js` (OpenAI-compatible provider, works with Volcengine Ark)

**Broken/gaps:**
- Bridge supervisor DEFAULTS includes `oi` (Open Interpreter bridge, abandoned), causing startup failure
- Settings panel has no Doubao vision fields — users can't configure API keys for browser-use/UI-TARS
- Settings "运行时" tab shows Open Interpreter + manual UI-TARS commands instead of current auto-started bridges
- Legacy Open Interpreter code in `electron/services/openInterpreter/` (4 files) and `server/oi-bridge/`
- `sanitizeConfigPatch()` in `electron/ipc/config.js` drops doubao fields (not in allow-list)
- `getMaskedConfig()` leaks `doubaoVisionApiKey` in plaintext
- `prepare-bridges.js` only handles `oi-bridge` and `uitars-bridge` — missing `browser-use-bridge`
- `package.json` extraResources missing `browser-use-bridge`; workspaces references `server/oi-bridge`
- No Electron packaging validation
- Welcome wizard (`WelcomeSetupDialog.jsx`) uses tier-based layout, not step-based flow

---

## Phase F: Cleanup + Settings Page

### F1 — Legacy code removal (Open Interpreter only)

Remove ONLY the abandoned Open Interpreter code. **Do NOT remove `deepseek.js`** — it is the active chat/agent provider used by `chat.js`, `agentLoop.js`, and `modelRouter.js`.

| Remove | Reason |
|---|---|
| `electron/services/openInterpreter/` (4 files: adapter.js, bootstrap.js, patchManifest.js, processManager.js) | Replaced by browser-use + UI-TARS |
| `server/oi-bridge/` (entire directory) | Abandoned bridge |
| `electron/services/models/deepseekProvider.js` | Wraps deepseek.js redundantly; modelRouter can use deepseek.js directly |

Also update these non-code references:
- `package.json`: remove `"server/oi-bridge"` from `workspaces` array (line 7), remove `dist-bridges/oi-bridge` from `build.extraResources`
- `scripts/prepare-bridges.js`: change `BRIDGES` from `['oi-bridge', 'uitars-bridge']` to `['uitars-bridge']` (browser-use is Python, handled separately)
- `package-lock.json`: regenerate after workspace removal

Update references in these source files:
- `electron/store.js` — remove `openInterpreterEndpoint`, `openInterpreterCommand` from DEFAULT_CONFIG
- `electron/security/actionTypes.js` — remove openInterpreter action type entries
- `electron/services/bridgeSupervisor.js` — remove `oi` from DEFAULTS
- `electron/services/modelRouter.js` — remove `deepseekProvider` require, use `deepseek.js` directly
- `electron/ipc/config.js` — remove openInterpreter fields from sanitizeConfigPatch allow-list
- `electron/ipc/runtime.js` — remove openInterpreter runtime entries
- `electron/ipc/setupStatus.js` — remove `require('../services/openInterpreter/bootstrap')` and `oi.detect()` call; restructure computeSetupStatus to use pythonBootstrap + bridge health
- `electron/ipc/chat.js` — keep deepseek dependency (still the active chat provider)
- `electron/services/agentLoop.js` — keep deepseek dependency; remove openInterpreter tool mapping
- `client/src/panels/SettingsPanel.jsx` — remove openInterpreter form fields (openInterpreterEndpoint, openInterpreterCommand, uiTarsEndpoint, uiTarsCommand, uiTarsScreenAuthorized)

Remove test files:
- `electron/__tests__/open-interpreter-adapter.test.js`
- `electron/__tests__/open-interpreter-bootstrap.test.js`

Update test files that reference openInterpreter:
- `electron/__tests__/store.test.js` — remove openInterpreter assertions
- `electron/__tests__/chat.test.js` — keep deepseek mocks; remove OI agent path assertions
- `electron/__tests__/agent-loop.test.js` — remove openInterpreter tool assertions
- `electron/__tests__/model-router.test.js` — remove deepseekProvider references
- `electron/__tests__/openExternal-ipc.test.js` — remove openInterpreter URL entries
- `electron/__tests__/setup-status-ipc.test.js` — update to new tier structure
- `electron/__tests__/packaging.test.js` — update README assertions
- `electron/__tests__/preload.test.js` — remove openInterpreter channel entries

**Bridge supervisor after cleanup:**
```js
const DEFAULTS = {
  uitars: { name: 'uitars-bridge', port: 8765, dir: 'server/uitars-bridge' },
  browserUse: { name: 'browser-use-bridge', port: 8780, dir: 'server/browser-use-bridge', runtime: 'python' }
}
```

### F2 — Settings panel: Models tab

Add Doubao vision configuration section above the existing Qwen section:

**Mockup:**
```
## Doubao Vision (browser + desktop automation)
API Key:        [password input, masked like qwenApiKey]
Endpoint:       [text input, default: https://ark.cn-beijing.volces.com/api/v3]
Model Name:     [text input, default: doubao-seed-1-6-vision-250815]

## Qwen 配置 (chat/planning)
[existing fields...]

## DeepSeek 备用聊天
[existing fields, keep as-is]
```

**IPC fixes required (in `electron/ipc/config.js`):**

`sanitizeConfigPatch()` currently uses an allow-list that drops doubao fields. Must add:
```js
if (typeof input.doubaoVisionApiKey === 'string' && input.doubaoVisionApiKey && !input.doubaoVisionApiKey.includes('***'))
  patch.doubaoVisionApiKey = input.doubaoVisionApiKey.trim()
if (typeof input.doubaoVisionEndpoint === 'string' && input.doubaoVisionEndpoint)
  patch.doubaoVisionEndpoint = input.doubaoVisionEndpoint.trim()
if (typeof input.doubaoVisionModel === 'string' && input.doubaoVisionModel)
  patch.doubaoVisionModel = input.doubaoVisionModel.trim()
```

**`getMaskedConfig()` fix (in `electron/store.js`):**
Add `doubaoVisionApiKey: mask(config.doubaoVisionApiKey || '')` to the returned object.

**`DEFAULT_FORM` fix (in `client/src/panels/SettingsPanel.jsx`):**
Add to DEFAULT_FORM:
```js
doubaoVisionApiKey: '',
doubaoVisionEndpoint: 'https://ark.cn-beijing.volces.com/api/v3',
doubaoVisionModel: 'doubao-seed-1-6-vision-250815',
```
And apply the same key-masking pattern as qwenApiKey/deepseekApiKey (clear on load, mask in state, clear empty before save).

**Config store default fix (in `electron/store.js`):**
Update `doubaoVisionModel` default from `'doubao-1-5-thinking-vision-pro-250428'` (offline) to `'doubao-seed-1-6-vision-250815'`.

### F3 — Settings panel: Runtimes tab

Replace the current "外部运行时" section with bridge status display and a new IPC handler.

**New IPC handler:** `electron/ipc/bridgeStatus.js`
- Exports `register(ipcMain)` function
- Handler `getBridgeStatus` returns `{ bridges: { uitars: { state, error }, browserUse: { state, error } } }`
- Reads from `bridgeSupervisor.getState()` (supervisor instance passed via dependency injection or module-level setter)
- Handler `restartBridge` takes `{ key }` and calls `supervisor.startOne(key)`

**UI mockup:**
```
## Bridge 状态
Browser-Use (浏览器自动化)    ● Running  | Python | port 8780
UI-TARS (桌面控制)            ● Running  | Node.js | port 8765

Failed state:
Browser-Use (浏览器自动化)    ● Failed  | Python | port 8780
  Error: Python not found on PATH
  [重新启动]
```

**Polling mechanism:** Renderer uses `setInterval` every 5s calling `getBridgeStatus` IPC, same pattern as existing `WelcomeSetupDialog.jsx` line 207. Stops on component unmount.

**Fields removed from DEFAULT_FORM and UI:**
- `openInterpreterEndpoint`, `openInterpreterCommand`
- `uiTarsEndpoint`, `uiTarsCommand`, `uiTarsScreenAuthorized`

**`writeBridgeState()` in `bridgeSupervisor.js`:**
Add a module-level event emitter. `startOne()` emits `'change'` after each state transition. `getState()` now also includes `lastError` per bridge (populated when bridge fails).

---

## Phase G: Packaging + Startup Flow

### G1 — Electron packaging

**`scripts/prepare-bridges.js` update:**
- Change `BRIDGES` to `['uitars-bridge']` (removing `oi-bridge`; browser-use is Python, copied separately)
- Add Python bridge preparation: copy `server/browser-use-bridge/` to `dist-bridges/browser-use-bridge/`, run `pip install -r requirements.txt` if Python available

**`package.json` updates:**
- `build.extraResources`: replace `dist-bridges/oi-bridge` with `dist-bridges/browser-use-bridge`
- Verify `dist-bridges/uitars-bridge` entry remains
- Ensure `client/dist/` is bundled via the existing `build.files` config

**Validation steps:**
- Run `npm run build:bridges` — verify both bridges land in `dist-bridges/`
- Run `npm run build` — verify installer is produced
- Test installed app: bridges auto-start on launch, bridge supervisor reads config correctly

### G2 — Welcome wizard rewrite

The current `WelcomeSetupDialog.jsx` (279 lines) uses a tier-based layout (lite/browser/full). Replace with a step-based sequential wizard.

**New flow (4 steps):**

Step 1 — "配置 Doubao API Key"
- Input: API key (password), endpoint (default prefilled), model name (default prefilled)
- "跳过" button (app still usable for chat via DeepSeek fallback)

Step 2 — "检测运行环境"
- Calls `pythonBootstrap.detect()` via IPC
- Shows: Python path + version, browser-use installed?, playwright installed?
- Missing items show install command + "Copy" button

Step 3 — "启动 Bridge"
- Calls `getBridgeStatus` IPC, shows status of each bridge
- "重新检测" button to re-check
- Shows error details if bridge fails to start

Step 4 — "一切就绪"
- Summary of what's configured
- "开始使用" button → close wizard, enter main chat

Skip-able, re-openable from Settings.

### G3 — Bridge startup error visibility

`bridgeSupervisor.js` changes:
- `startOne()`: capture and store `lastError` per bridge on failure
- Emit events on state transitions (using Node EventEmitter or a simple callback)
- `getState()` includes `lastError` per bridge

`electron/ipc/bridgeStatus.js`:
- Register `getBridgeStatus` and `restartBridge` handlers (as defined in F3)
- Registered in `main.js` alongside other IPC handlers

Settings panel "运行时" tab:
- Red text for failed state with `lastError.message`
- "重新启动" button calls `restartBridge` IPC

---

## Phase H: UX Polish

### H1 — Bridge status bar (in-window, not system tray)

Add a thin status bar at the bottom of the main window (not system tray — that requires .ico files, tray-specific lifecycle management, and is overscoped for this phase):

```
● Browser-Use: Running | ● UI-TARS: Running
```

- Green dot + "Running" per bridge
- Yellow dot + "Starting..." per bridge
- Red dot + "Failed — click for details" per bridge (clickable, opens Settings → Runtimes tab)

### H2 — Bridge auto-restart with backoff

Enhance `bridgeSupervisor.startOne()`:
- Current: immediate retry up to 3 times
- New: exponential backoff — 1s, 2s, 4s between retries
- After first failure: emit event for UI toast ("Browser-use 连接断开，正在重连...")
- After all retries exhausted: state = 'failed', emit event for persistent error display

### H3 — First-run flow

Combine G2 welcome wizard + Python detection + API key config into a single guided flow. Same 4-step design as G2. On first launch (no config found), auto-open the wizard. On subsequent launches, skip unless explicitly opened from Settings.

### H4 — Final E2E validation

Manual test plan:
1. Delete config (`%APPDATA%/AionUi/config.json`) to simulate fresh install
2. Launch app → welcome wizard appears
3. Enter Doubao API key → next
4. Python detection runs → shows results
5. Bridges auto-start → status shows green
6. Send a chat message: "Navigate to example.com and tell me the page title"
7. Agent loop → browser_task tool call → bridge execute → result returned to chat
8. Repeat with desktop task: "Take a screenshot of my desktop"
9. Verify all 235 unit tests still pass

---

## Files Changed (by phase)

### Phase F
- **Remove:** `electron/services/openInterpreter/` (4 files), `server/oi-bridge/`, `electron/services/models/deepseekProvider.js`
- **Remove tests:** `electron/__tests__/open-interpreter-adapter.test.js`, `electron/__tests__/open-interpreter-bootstrap.test.js`
- **New:** `electron/ipc/bridgeStatus.js`
- **Modify:** `electron/services/bridgeSupervisor.js`, `electron/store.js`, `electron/security/actionTypes.js`, `electron/services/modelRouter.js`, `electron/ipc/config.js`, `electron/ipc/runtime.js`, `electron/ipc/setupStatus.js`, `electron/ipc/chat.js`, `electron/services/agentLoop.js`, `client/src/panels/SettingsPanel.jsx`, `package.json`, `scripts/prepare-bridges.js`, `electron/main.js` (register bridgeStatus IPC + remove oi from imports)
- **Modify tests:** `electron/__tests__/store.test.js`, `electron/__tests__/chat.test.js`, `electron/__tests__/agent-loop.test.js`, `electron/__tests__/model-router.test.js`, `electron/__tests__/openExternal-ipc.test.js`, `electron/__tests__/setup-status-ipc.test.js`, `electron/__tests__/packaging.test.js`, `electron/__tests__/preload.test.js`

### Phase G
- **Modify:** `package.json` (build.extraResources), `scripts/prepare-bridges.js` (add Python bridge), `client/src/components/WelcomeSetupDialog.jsx` (rewrite to step-based), `electron/ipc/config.js` (double-check sanitizer)
- **New tests:** packaging smoke test, welcome wizard flow test

### Phase H
- **Modify:** `electron/main.js` (status bar), `electron/services/bridgeSupervisor.js` (backoff, events), `client/src/panels/SettingsPanel.jsx`, `client/src/components/WelcomeSetupDialog.jsx`
- **New tests:** bridge restart/backoff test, first-run flow test

---

## Testing Strategy

Run after each phase: `npm test` (currently 235 tests, should not regress below this count).

**Phase F:**
- Remove 2 test files (open-interpreter-*.test.js), update ~8 test files
- Add bridgeStatus IPC tests
- Net test count: ~230+ (slight drop from removed test files, offset by new IPC tests)

**Phase G:**
- Add packaging smoke test (verify dist-bridges/ contents)
- Add welcome wizard flow test (step navigation, form values)

**Phase H:**
- Add bridge restart/backoff unit tests
- Add first-run detection test

**After Phase G:** Full E2E manual validation (fresh install → configure → execute task).
