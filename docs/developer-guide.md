# AionUi Developer Guide

## Architecture

AionUi uses an agent-loop architecture:

1. **Agent Loop** (`electron/services/agentLoop.js`) — Drives the conversation: sends messages to the model, receives tool calls, evaluates policy, requests user approval, executes tools, returns results.
2. **Tool Registry** (`electron/tools/index.js`) — All available tools register here via `register(schema, handler)`. Tools are auto-discovered by the agent loop.
3. **Tool Policy** (`electron/security/toolPolicy.js`) — Classifies every tool call by risk level (low/medium/high/blocked). Low-risk auto-executes; medium/high require user approval; blocked tools never execute.
4. **Bridges** — External runtimes managed by `bridgeSupervisor.js`:
   - `oi-bridge` (port 8756) — Open Interpreter for shell/code execution
   - `uitars-bridge` (port 8765) — UI-TARS for desktop screen/mouse/keyboard
   - `browser-use-bridge` (port 8780) — Python browser-use for web automation
5. **IPC** (`electron/ipc/`) — Each IPC module registers handlers on `ipcMain`. Modules: agent, chat, config, conversations, artifacts, files, dialog, skills, rules, runtime, audit, outputs, openExternal, setupStatus.

## Key Files

| File | Purpose |
|------|---------|
| `electron/services/agentLoop.js` | Core agent loop: model call → tool calls → policy → execute → repeat |
| `electron/tools/index.js` | Tool registry: register(), execute(), getAgentLoopToolSchemas() |
| `electron/security/toolPolicy.js` | Risk classification for all tools |
| `electron/services/bridgeSupervisor.js` | Start/stop/health-check all bridge sidecars |
| `electron/main.js` | Electron main entry, window creation, bridge lifecycle |
| `electron/preload.js` | Context bridge exposing IPC to renderer |
| `electron/store.js` | Config and data persistence (JSON + SQLite) |

## Adding a New Tool

1. Create `electron/tools/yourTool.js` with a handler function and `register()` call.
2. Add `require('./yourTool')` in `electron/tools/index.js` `loadBuiltins()`.
3. Add a case in `electron/security/toolPolicy.js` `evaluateToolCall()`.
4. Write tests in `electron/__tests__/your-tool.test.js`.

## Running Tests

```bash
npm test                 # All unit tests
node scripts/smoke-*.js  # Integration smoke tests
npm run build:client     # Frontend build
```
