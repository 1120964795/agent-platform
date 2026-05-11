# Desktop-use Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Computer Use / Desktop Use plugin mode that routes desktop automation through a new `desktop-use-bridge` with broader action support and a basic multi-step `desktop_task`.

**Architecture:** Keep the existing Electron chat-first app. Add `server/desktop-use-bridge` as the public desktop runtime bridge, route Electron desktop tools through it, and keep `uitars-bridge` only as a future/internal grounding backend. Desktop-use is activated from the existing chat plugin menu like browser-use, setting `pluginMode = 'desktop'`.

**Tech Stack:** Electron IPC/tools, React chat input components, Node/Express sidecar, `screenshot-desktop`, `@nut-tree-fork/nut-js`, Vitest, Superpowers TDD loop.

---

## File Structure

- Create `server/desktop-use-bridge/package.json`: sidecar package and dependencies.
- Create `server/desktop-use-bridge/index.js`: Express health/execute/cancel API.
- Create `server/desktop-use-bridge/driver.js`: local desktop driver wrapper.
- Create `server/desktop-use-bridge/translator.js`: validate and classify desktop action payloads.
- Create `server/desktop-use-bridge/agentRunner.js`: basic multi-step `desktop.task` loop.
- Create `server/desktop-use-bridge/__tests__/translator.test.js`: action validation tests.
- Create `server/desktop-use-bridge/__tests__/execute.test.js`: bridge endpoint tests.
- Create `electron/__tests__/desktop-adapter.test.js`: Electron adapter contract tests.
- Modify `electron/services/desktop/adapter.js`: target `desktop-use-bridge` on port 8790.
- Modify `electron/services/bridgeSupervisor.js`: supervise `desktopUse` sidecar and pass desktop-use env vars.
- Modify `electron/store.js`: add desktop-use config defaults and masking.
- Modify `electron/ipc/config.js`: sanitize desktop-use settings.
- Create `electron/tools/desktopHotkey.js`, `desktopScroll.js`, `desktopWait.js`, `desktopTask.js`: new desktop tools.
- Modify `electron/tools/index.js`: register new desktop tools.
- Modify `electron/security/toolPolicy.js` and tests: risk policy for new tools.
- Modify `electron/services/agentLoop.js` and tests: support `forceTool: 'desktop_task'`.
- Modify `electron/ipc/chat.js` and tests: route `pluginMode === 'desktop'` to desktop task.
- Modify `client/src/components/chat/InputBar.jsx`, `ModelSelector.jsx`, `ChatArea.jsx`, and `unified-chat-ui.test.js`: plugin menu activation and desktop chip.
- Modify `package.json`: add `server/desktop-use-bridge` workspace and bridge build resource later if needed.

## Task 1: Desktop-use Bridge Shell

**Files:**
- Create: `server/desktop-use-bridge/package.json`
- Create: `server/desktop-use-bridge/translator.js`
- Create: `server/desktop-use-bridge/driver.js`
- Create: `server/desktop-use-bridge/index.js`
- Create: `server/desktop-use-bridge/__tests__/translator.test.js`
- Create: `server/desktop-use-bridge/__tests__/execute.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write translator tests**

Create tests that assert:
- `desktop.observe`, `desktop.click`, `desktop.type`, `desktop.hotkey`, `desktop.scroll`, `desktop.wait`, `desktop.task` are supported.
- missing click coordinates and target are rejected.
- `desktop.task` requires a non-empty goal.

Run:

```powershell
npm.cmd exec vitest run server/desktop-use-bridge/__tests__/translator.test.js
```

Expected: FAIL because files do not exist.

- [ ] **Step 2: Implement translator and package**

Implement `classify(action)` returning `{ backend, ... }` for:
- `observe`
- `coordinate-click`
- `semantic-click`
- `type`
- `hotkey`
- `scroll`
- `wait`
- `task`
- `invalid`

Add `server/desktop-use-bridge/package.json` with `express`, `supertest`, `screenshot-desktop`, and `@nut-tree-fork/nut-js`.

- [ ] **Step 3: Write bridge endpoint tests**

Tests should call `createApp({ driver, agentRunner })` and verify:
- `GET /health` reports `{ ok: true, runtime: 'desktop-use' }`.
- `/execute` rejects `approved: false`.
- `desktop.observe` returns screenshot metadata.
- `desktop.click` uses coordinate click.
- `desktop.type`, `desktop.hotkey`, `desktop.scroll`, and `desktop.wait` call the driver.
- `desktop.task` calls the agent runner.
- `POST /cancel` calls agent runner cancellation.

- [ ] **Step 4: Implement bridge and driver**

Implement `createApp`, `start`, `wireDefaultRuntime`, and a driver factory. The default driver uses lazy `require()` so tests can inject fakes without native dependency loading.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec vitest run server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js
```

Expected: PASS.

Commit:

```powershell
git add package.json server/desktop-use-bridge
git commit -m "feat: add desktop-use bridge shell"
```

## Task 2: Electron Desktop Adapter And Tool Surface

**Files:**
- Create: `electron/__tests__/desktop-adapter.test.js`
- Create: `electron/tools/desktopHotkey.js`
- Create: `electron/tools/desktopScroll.js`
- Create: `electron/tools/desktopWait.js`
- Create: `electron/tools/desktopTask.js`
- Modify: `electron/services/desktop/adapter.js`
- Modify: `electron/tools/index.js`
- Modify: `electron/security/toolPolicy.js`
- Modify: `electron/__tests__/tool-policy.test.js`

- [ ] **Step 1: Write adapter and policy tests**

Adapter tests should assert `execute()` posts to `http://127.0.0.1:8790/execute`, propagates `sessionId`, and calls `/cancel` on abort.

Policy tests should assert:
- `desktop_observe` and `desktop_wait` are low risk.
- `desktop_click`, `desktop_drag`, and `desktop_task` are high risk.
- `desktop_hotkey` and `desktop_scroll` are medium risk.
- `desktop_type` is high risk.

- [ ] **Step 2: Implement adapter port and cancellation**

Update `electron/services/desktop/adapter.js` to:
- use port `8790`
- normalize bridge result shape
- call `/cancel` if the abort signal fires

- [ ] **Step 3: Add new tools**

Add `desktop_hotkey`, `desktop_scroll`, `desktop_wait`, and `desktop_task` wrappers. Each tool health-checks the bridge, validates minimal arguments, calls the adapter, and returns normalized output.

- [ ] **Step 4: Register tools and policy**

Register new tool modules in `electron/tools/index.js` and update `toolPolicy.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/desktop-adapter.test.js electron/__tests__/tool-policy.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/desktop/adapter.js electron/tools/desktopHotkey.js electron/tools/desktopScroll.js electron/tools/desktopWait.js electron/tools/desktopTask.js electron/tools/index.js electron/security/toolPolicy.js electron/__tests__/desktop-adapter.test.js electron/__tests__/tool-policy.test.js
git commit -m "feat: route desktop tools through desktop-use"
```

## Task 3: Supervisor And Config

**Files:**
- Modify: `electron/services/bridgeSupervisor.js`
- Modify: `electron/store.js`
- Modify: `electron/ipc/config.js`
- Modify: `electron/__tests__/bridge-supervisor.test.js`
- Modify: `electron/__tests__/config.test.js` if present, otherwise existing config tests.

- [ ] **Step 1: Write failing supervisor/config tests**

Assert:
- supervisor contains `desktopUse` with port `8790`
- env includes `DESKTOP_USE_MODEL_ENDPOINT`, `DESKTOP_USE_MODEL_API_KEY`, `DESKTOP_USE_MODEL_NAME`, `DESKTOP_USE_GROUNDING_BACKEND`
- masked config includes `desktopUseApiKey`
- config sanitizer accepts desktop-use fields

- [ ] **Step 2: Implement config defaults and masking**

Add:
- `desktopUseEndpoint`
- `desktopUseApiKey`
- `desktopUseModel`
- `desktopUseGroundingBackend`
- `desktopUseAllowBrowserFallback`

- [ ] **Step 3: Implement supervisor entry**

Add `desktopUse` to bridge defaults and diagnostics.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/bridge-supervisor.test.js electron/__tests__/config.test.js
```

Expected: PASS, or if `config.test.js` does not exist, run the closest config-related test suite and the focused desktop adapter tests.

Commit:

```powershell
git add electron/services/bridgeSupervisor.js electron/store.js electron/ipc/config.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/config.test.js
git commit -m "feat: configure desktop-use runtime"
```

## Task 4: Desktop Plugin Mode Routing

**Files:**
- Modify: `electron/services/agentLoop.js`
- Modify: `electron/ipc/chat.js`
- Modify: `electron/__tests__/agent-loop.test.js`
- Modify: `electron/__tests__/chat.test.js`

- [ ] **Step 1: Write failing backend tests**

Add tests:
- `forceTool: 'desktop_task'` creates a `desktop_task` tool call using latest user content as `goal`.
- `pluginMode: 'desktop'` passes `forceTool: 'desktop_task'` to `runTurn`.
- forced skill still runs before desktop task when both are present.

- [ ] **Step 2: Implement agent loop force tool support**

Generalize `createForcedToolCall()` so it supports:
- `browser_task` with `{ goal }`
- `desktop_task` with `{ goal }`

- [ ] **Step 3: Implement chat IPC routing**

Update `electron/ipc/chat.js`:
- `pluginMode === 'browser'` forces `browser_task`
- `pluginMode === 'desktop'` forces `desktop_task`

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm.cmd exec vitest run electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
```

Expected: PASS.

Commit:

```powershell
git add electron/services/agentLoop.js electron/ipc/chat.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js
git commit -m "feat: route desktop plugin mode to desktop task"
```

## Task 5: Renderer Plugin Menu

**Files:**
- Modify: `client/src/components/chat/InputBar.jsx`
- Modify: `client/src/components/chat/ModelSelector.jsx`
- Modify: `client/src/components/chat/unified-chat-ui.test.js`

- [ ] **Step 1: Write failing UI wiring tests**

Assert:
- InputBar contains `Computer Use` / `Desktop Use`
- plugin item sets mode `desktop`
- ModelSelector contains a desktop-use chip
- switching model clears plugin mode, matching browser-use behavior

- [ ] **Step 2: Implement menu and chip**

Add a desktop plugin item beside browser-use. Add a desktop-use option/chip to ModelSelector.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
npm.cmd exec vitest run client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

Commit:

```powershell
git add client/src/components/chat/InputBar.jsx client/src/components/chat/ModelSelector.jsx client/src/components/chat/unified-chat-ui.test.js
git commit -m "feat: add desktop-use plugin picker"
```

## Task 6: Final Verification And Startup

**Files:** Verify only.

- [ ] **Step 1: Run focused suite**

Run:

```powershell
npm.cmd exec vitest run server/desktop-use-bridge/__tests__/translator.test.js server/desktop-use-bridge/__tests__/execute.test.js electron/__tests__/desktop-adapter.test.js electron/__tests__/tool-policy.test.js electron/__tests__/bridge-supervisor.test.js electron/__tests__/agent-loop.test.js electron/__tests__/chat.test.js client/src/components/chat/unified-chat-ui.test.js
```

Expected: PASS.

- [ ] **Step 2: Build renderer**

Run:

```powershell
npm.cmd --prefix client run build
```

Expected: PASS.

- [ ] **Step 3: Start project**

Run:

```powershell
npm.cmd run electron:dev
```

Expected: Electron opens from the current worktree. The plugin menu shows Browser Use and Computer Use / Desktop Use.

