# Desktop-use Agent Upgrade Design

- Date: 2026-05-11
- Status: Draft for user review
- Scope: Upgrade AionUi Computer-use while keeping the current app, chat flow, browser-use bridge, skills, policy, and audit system.

## 1. Outcome

AionUi should keep the current chat-first product and replace the thin UI-TARS-only desktop path with a stronger Computer-use runtime:

- Better general desktop control on Windows first, with a path to macOS/Linux.
- Better GUI-agent intelligence through observe-act-verify loops, reflection, and retry.
- Compatibility with GPT-compatible relay endpoints, matching the browser-use direction.
- Codex-style activation from the existing plugin menu, matching the current browser-use entry.
- Continued integration with existing tool policy, high-risk chat confirmation, abort, audit, and conversation history.

This is not a full migration to UI-TARS-desktop. The current project remains the host application.

## 2. Current State

Current Computer-use is split across:

- `electron/tools/desktopObserve.js`
- `electron/tools/desktopClick.js`
- `electron/tools/desktopType.js`
- `electron/services/desktop/adapter.js`
- `server/uitars-bridge/`

The bridge currently exposes only:

- screenshot observe
- natural-language semantic click
- direct keyboard type

`server/uitars-bridge/translator.js` explicitly marks `mouse.scroll`, `mouse.move`, and `keyboard.key` as not implemented. This is the main compatibility bottleneck: the agent can click/type, but cannot reliably perform common GUI actions or self-correct after an action.

Browser automation is already on a stronger track through `browser-use-bridge`, so this design mirrors that pattern for desktop automation.

Current browser-use activation is user-driven from the chat input plugin menu. Desktop-use must follow the same product pattern: the user opens the plugin menu, selects Computer Use / Desktop Use, and the next chat task runs with `pluginMode = 'desktop'`. It should not appear as a separate page, card workflow, or always-on automation mode.

## 3. References

These projects inform the design, but none should be copied wholesale into the app:

- Agent-S: use its GUI-agent architecture ideas, especially observe-act loops, reflection, grounding separation, local environment caveats, and multi-platform ambition.
  - https://github.com/simular-ai/Agent-S
- CUA by trycua: use its runtime/driver abstraction ideas for future sandbox or full-desktop backends.
  - https://github.com/trycua/cua
- OmniParser: use the screen parsing idea as an optional grounding backend for visible UI elements.
  - https://github.com/microsoft/OmniParser
- UI-TARS-desktop: keep as a reference for multimodal desktop agent stack and grounding, but do not migrate the whole app.
  - https://github.com/bytedance/UI-TARS-desktop

## 4. Chosen Approach

Build a new `desktop-use-bridge` and route Computer-use tools through it.

The bridge owns desktop runtime details. Electron owns product policy, user confirmation, model configuration, and chat streaming.

```
Chat input
  -> plugin menu selects desktop-use
  -> electron/services/agentLoop.js
  -> desktop tool call
  -> electron/services/desktop/adapter.js
  -> server/desktop-use-bridge
  -> runtime backend
       - local Windows driver
       - optional UI-TARS grounding
       - optional OmniParser grounding
       - future sandbox/CUA backend
  -> observation/action result
  -> agentLoop continues or retries
```

The current `uitars-bridge` can remain temporarily as a backend during migration, but it should no longer be the public Computer-use abstraction.

### 4.1 Activation Model

Desktop-use is started the same way current browser-use is started:

1. User opens the `+` menu in the chat input.
2. User enters the `插件` submenu.
3. User selects `Computer Use` / `Desktop Use`.
4. `InputBar` sets `pluginMode` to `desktop`.
5. `ChatArea` sends the user's message with `{ pluginMode: 'desktop' }`.
6. `electron/ipc/chat.js` routes that turn to the desktop runtime by forcing `desktop_task` or enabling the desktop tool catalog for that turn.

This mirrors the Codex-style plugin picker: explicit mode selection, then natural-language chat. The user should not need to type a slash command to activate Computer-use, though slash skills may still coexist.

When desktop-use is selected, the model chip should show a compact desktop runtime label, similar to the existing browser-use model chip. Leaving desktop-use or switching model should clear `pluginMode`, consistent with browser-use behavior.

## 5. Components

### 5.1 `server/desktop-use-bridge`

New sidecar service, Node first for compatibility with the current app.

Endpoints:

- `GET /health`
- `POST /sessions`
- `POST /execute`
- `POST /cancel`

The bridge should support one active desktop session initially. Multi-session orchestration is out of scope.

Action protocol:

```json
{
  "actionId": "desktop-...",
  "sessionId": "default",
  "type": "desktop.click",
  "payload": {},
  "approved": true
}
```

Result protocol:

```json
{
  "ok": true,
  "durationMs": 123,
  "metadata": {
    "screenshotBase64": "...",
    "screen": { "width": 1920, "height": 1080, "scaleFactor": 1 },
    "action": {}
  },
  "error": null
}
```

### 5.2 Desktop Driver Interface

Create a stable internal interface:

```js
driver.observe()
driver.click({ x, y, button })
driver.type({ text })
driver.hotkey({ keys })
driver.scroll({ x, y, direction, amount })
driver.drag({ from, to })
driver.wait({ ms })
driver.getActiveWindow()
```

Windows implementation can continue to use `@nut-tree-fork/nut-js` plus `screenshot-desktop` initially. If reliability issues appear, swap only the driver, not Electron or agent code.

### 5.3 Grounding Backends

Grounding means translating a natural-language target into coordinates or UI elements.

Backends:

- `uitars`: current `@ui-tars/sdk` behavior, retained as the first backend.
- `omniparser`: optional future backend for screen element parsing.
- `gpt-vision`: GPT-compatible relay endpoint for direct target grounding when parser/model supports image input.
- `manual-coordinate`: fallback for explicit `{ x, y }`.

Grounding input:

```json
{
  "instruction": "click the Settings button",
  "screenshotBase64": "...",
  "screen": { "width": 1920, "height": 1080 }
}
```

Grounding output:

```json
{
  "ok": true,
  "target": {
    "x": 1200,
    "y": 860,
    "confidence": 0.82,
    "label": "Settings"
  }
}
```

### 5.4 Desktop Agent Loop

Add a small desktop-specific loop inside the sidecar, not inside the renderer.

For high-level desktop goals:

1. Observe screen.
2. Ask planner model for next action.
3. Ground target if needed.
4. Execute action.
5. Observe again.
6. Verify progress.
7. Continue, retry, ask user, or finish.

The loop should have a hard cap:

- default `maxSteps = 12`
- default `maxActionRetries = 2`
- default session timeout `5 minutes`

The planner can use GPT relay-compatible OpenAI Chat Completions with image input. It should be configurable separately from browser-use:

- `desktopUseEndpoint`
- `desktopUseApiKey`
- `desktopUseModel`
- `desktopUseGroundingBackend`

If these fields are empty, desktop-use can initially fall back to the browser-use endpoint/key only when the user explicitly enables that fallback in settings. The default settings copy should keep them separate so browser and desktop failures are easier to diagnose.

### 5.5 Electron Tool Surface

Keep existing tool names for compatibility, but route them to the new adapter:

- `desktop_observe`
- `desktop_click`
- `desktop_type`

Add new tools after the bridge is stable:

- `desktop_hotkey`
- `desktop_scroll`
- `desktop_drag`
- `desktop_wait`
- `desktop_task`

`desktop_task` is the high-level multi-step Computer-use tool. The existing low-level tools remain useful for simple calls and tests.

## 6. Risk And Confirmation Policy

Existing chat confirmation policy stays authoritative.

Suggested risk levels:

- `desktop_observe`: low, no confirmation
- `desktop_wait`: low, no confirmation
- `desktop_click`: high, confirmation required
- `desktop_type`: high if text is non-empty user-visible input
- `desktop_hotkey`: medium by default, high for destructive shortcuts
- `desktop_scroll`: medium
- `desktop_drag`: high
- `desktop_task`: high, confirmation required before task starts

The sidecar should never execute an action unless Electron passes `approved: true`.

## 7. Failure Handling

Common failures and behavior:

- Bridge offline: show runtime diagnostics and keep the chat turn alive with a clear error.
- Screenshot permission missing: return `SCREEN_PERMISSION_REQUIRED` with setup guidance.
- Grounding confidence below threshold: do not click; ask user or retry with a new screenshot.
- Action executes but screen does not change: retry once, then ask user.
- Planner returns unsupported action: convert to `UNSUPPORTED_ACTION`, not raw crash.
- User aborts: cancel active sidecar task and stop the loop.
- Multi-monitor detected: initially require single-monitor or primary-monitor-only mode, matching Agent-S constraints.

## 8. Migration Plan

Phase 1: Bridge shell

- Add `server/desktop-use-bridge`.
- Implement health, observe, click by coordinates, type, hotkey, scroll, wait.
- Add adapter tests and bridge tests.
- Keep old `uitars-bridge` untouched.

Phase 2: Route current tools

- Update `electron/services/desktop/adapter.js` to target `desktop-use-bridge`.
- Keep response shape compatible with existing `desktopObserve/Click/Type`.
- Verify current chat/tool tests still pass.

Phase 2.5: Plugin menu activation

- Add a `Computer Use` / `Desktop Use` item beside the existing browser-use plugin entry.
- Set `pluginMode = 'desktop'` when selected.
- Show a compact desktop runtime chip in the model selector area.
- Send `{ pluginMode: 'desktop' }` with the chat payload.
- Route `pluginMode === 'desktop'` to `desktop_task` or equivalent desktop-enabled agent behavior.

Phase 3: Grounding

- Add grounding interface.
- Wrap existing UI-TARS semantic click as a grounding backend.
- Add confidence threshold and no-click-on-low-confidence behavior.

Phase 4: High-level `desktop_task`

- Add observe-act-verify loop.
- Use GPT relay-compatible planner.
- Stream progress into the existing chat stream.
- Support abort and timeout.

Phase 5: Cleanup

- Deprecate direct `uitars-bridge` usage.
- Keep it as an internal optional backend for one release.
- Update runtime settings and diagnostics copy.

## 9. Acceptance Criteria

The upgrade is complete when:

1. `desktop_observe` returns screenshot metadata through the new bridge.
2. `desktop_click` can click explicit coordinates and natural-language targets.
3. `desktop_type` works in a focused text field.
4. `desktop_hotkey`, `desktop_scroll`, and `desktop_wait` exist and pass bridge tests.
5. `desktop_task` can perform a simple multi-step task: open Notepad, type a short sentence, and stop.
6. Low-confidence grounding does not click.
7. User abort stops an active desktop task.
8. High-risk actions pause for chat confirmation.
9. Existing browser-use flow remains unchanged.
10. User can activate desktop-use from the same plugin menu pattern as browser-use.
11. Switching away from desktop-use clears `pluginMode`.
12. Focused tests and renderer build pass.

## 10. Non-goals

- Do not migrate the whole project to UI-TARS-desktop.
- Do not add VM/sandbox execution in this iteration.
- Do not require a local open-source vision model.
- Do not remove current `desktop_observe`, `desktop_click`, and `desktop_type` tool names.
- Do not change browser-use behavior.
- Do not create a separate Computer-use page or card-first workflow; activation belongs in the chat plugin menu.

## 11. Open Implementation Choices

Default choices for implementation unless changed later:

- Node sidecar first, because current desktop bridge is already Node.
- GPT relay-compatible planner for `desktop_task`.
- UI-TARS grounding first, because current project already depends on it.
- OmniParser integration later, behind the same grounding interface.
- Single monitor / primary monitor mode first.
