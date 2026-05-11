# Migrate to UI-TARS-desktop Fork (Path X)

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Audience: codex (executor)
- Supersedes: agent-loop v1/v2/v3 (we've decided NOT to self-build the agent core)

## 0. Why this exists

After three rounds of independent code review, AionUi's self-built agent
loop kept hitting issues that bytedance has already solved in their open
project. Continuing to self-build is reinventing the wheel poorly.

## 1. UI-TARS-desktop survey (verified)

[github.com/bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop)

| | UI-TARS-desktop |
|---|---|
| License | Apache-2.0 |
| Stars / commits | 31.2k stars / 1,108 commits |
| Latest version | v0.3.0 (Nov 2025) |
| Stack | TypeScript, Electron 34, Node >= 22, electron-vite, electron-forge, pnpm + turbo monorepo |
| Targets | macOS arm64+x64, Windows arm64+x64 |
| Native model providers | **Volcengine/Doubao** (`doubao-1-5-thinking-vision-pro-250428`), Anthropic Claude, UI-TARS proprietary (Seed-1.5-VL/1.6) |
| Agent architecture | Event Stream protocol; native tool calling; MCP (Model Context Protocol) integration for mounting tools |
| Browser | "Hybrid browser agent" — DOM + GUI vision combined |
| Computer Use | Local + remote operators with screenshot + mouse/keyboard control |

## 2. Repo layout

```
UI-TARS-desktop/                       (pnpm + turbo monorepo)
├── apps/
│   └── ui-tars/                       Electron desktop UI shell
│       ├── src/main/                  main process: agent/, services/, store/, ipcRoutes/, ...
│       ├── src/preload/
│       └── src/renderer/              React UI
├── multimodal/                        the actual agent framework
│   ├── agent-tars/                    core agent loop + tool calling
│   ├── gui-agent/                     screen/mouse/keyboard primitives
│   ├── omni-tars/                     omnidirectional variant
│   └── tarko/                         CLI variant
├── packages/                          shared utilities
└── infra/
```

The agent loop **lives in `multimodal/agent-tars/`**, not in `apps/ui-tars/`.
The desktop app is a thin shell over the framework.

## 3. Your 7 pillars vs what UI-TARS-desktop already provides

| Pillar | UI-TARS-desktop status | Action |
|---|---|---|
| 屏幕监视 | ✅ built-in (gui-agent screenshot) | use as-is |
| 鼠键控制 | ✅ built-in (gui-agent mouse/keyboard) | use as-is |
| skill/plugin 机制 | ⚠️ MCP tools (industry-standard); no SKILL.md prompt skills | **port your SKILL.md system as wrapper tools** |
| 浏览器自动化 | ✅ built-in (hybrid browser agent: DOM + GUI) | use as-is, replaces all our Midscene work |
| 直接操作本地资源 | ⚠️ basic file/shell via tools; no Open Interpreter integration | **port your oi-bridge as custom tool** |
| 保留历史对话 | ✅ Event Stream + conversation persistence (verify SQLite/disk format) | adopt theirs |
| 本地 exe | ✅ electron-forge → Windows installer | use as-is |

**Net new code in your fork:** SKILL.md adapter + oi-bridge tool + branding. The agent loop, browser tools, screen control, history persistence, settings UI are all already there.

## 4. Strategic decisions

### 4.1 Fork vs new repo with their code as base

**Choose: fresh repo, vendor their code**, not a true fork.

Reasons:
- You want to brand it as AionUi, not "UI-TARS-desktop my-build"
- Your customizations may diverge significantly (skills, OI integration, Chinese-language UX)
- License (Apache-2.0) requires attribution but allows this

Implication: you don't get automatic upstream merges. Periodically
manually rebase against their main if needed.

### 4.2 Which UI-TARS-desktop features to keep / drop

| Feature | Keep | Drop |
|---|---|---|
| Electron app shell | ✅ keep | |
| agent-tars framework | ✅ keep | |
| gui-agent (screen/mouse) | ✅ keep | |
| Browser agent (hybrid) | ✅ keep | |
| MCP tool integration | ✅ keep | |
| Event Stream + history | ✅ keep | |
| Settings UI | ✅ keep, customize copy/strings to AionUi branding | |
| Their tray/menu/window code | ✅ keep | |
| Anthropic Claude provider | ⚠️ keep but unused | |
| Their default models | replace defaults with your Doubao endpoint IDs | |
| Their starter/example skills | ✅ keep as reference | |

### 4.3 What from current AionUi to port forward

| AionUi current | Migration |
|---|---|
| `electron/skills/loader.js` + `resources/skills/*/SKILL.md` | port — wrap each SKILL.md as an MCP tool that returns the markdown content; agent-tars consumes naturally |
| `electron/services/openInterpreter/` + `server/oi-bridge/` | port — register `run_shell_command`, `read_file`, `write_file`, `code_execute` as custom agent-tars tools that POST to the existing oi-bridge sidecar |
| `electron/store.js` config schema (DeepSeek + Doubao keys) | partial — UI-TARS-desktop has its own settings store; merge field names where compatible |
| `electron/security/actionPolicy.js` regex constants | partial — agent-tars has its own policy hooks; port the patterns into their hook system |
| `client/src/` React UI | drop most — UI-TARS-desktop has its own React renderer. Port only your Welcome dialog content + branding |
| `electron/services/midscene/` and `server/midscene-bridge/` | DROP — replaced by UI-TARS-desktop's hybrid browser agent |
| `electron/services/uiTars/` and `server/uitars-bridge/` | DROP — UI-TARS-desktop has native gui-agent |
| `electron/services/visionPlanner.js`, `actionPlanner.js`, `agentLoop.js`, `taskOrchestrator.js` | DROP — agent-tars replaces |

**Net: ~70% of current AionUi code retires. Only OI integration and SKILL.md system port forward as application-layer extensions.**

## 5. Brand + identity

Customizable in fork:
- App name `AionUi` (in package.json, electron-builder config, app menu)
- Icon (replace default UI-TARS icon with your asset)
- Default model selection (Doubao seed-1.6-vision endpoint pre-filled)
- Welcome dialog content (Chinese-first, your 3-tier setup wizard)
- Skills panel (lists SKILL.md skills + native tools)
- Default skill set (your 5 SKILL.md skills: dep-installer, file-explorer, ppt-builder, study-helper, word-writer)

Required by Apache-2.0:
- Keep `LICENSE` and copyright notices
- Add a `NOTICE` file attributing UI-TARS-desktop and ByteDance
- Don't claim original authorship of agent core

## 6. Acceptance criteria

The fork is "done" when:

1. **Builds**: `pnpm install && pnpm build:dist && pnpm make:win` produces an AionUi.exe NSIS installer.
2. **Runs**: clean Windows VM install → app launches → Welcome dialog appears → user enters DeepSeek + Doubao keys → Settings panel reflects values.
3. **Browser task works**: "用浏览器打开 example.com 告诉我标题" → agent-tars completes the task using browser agent → result text contains "Example Domain".
4. **Desktop task works**: "看一下当前屏幕" → desktop_observe equivalent fires → screenshot captured.
5. **Shell tool**: ask "运行 dir 看下当前目录" → run_shell_command via oi-bridge → directory listing returned.
6. **SKILL.md skill**: ask "use file-explorer skill to list my Downloads" → SKILL.md content loaded into context → agent uses it.
7. **History**: chat 5 messages, restart, conversation reloads.
8. **Branding**: app name, icon, splash all show AionUi.
9. **Default tier-1 setup works**: Doubao key configured, browser_task runs without further setup.

## 7. Red lines

1. Apache-2.0: keep LICENSE + add NOTICE. **No license violation.**
2. Don't fork as `UI-TARS-desktop-aionui`; create a new repo with attribution.
3. Don't modify `multimodal/agent-tars/` core unless absolutely necessary; extend via MCP tool registration.
4. Don't try to merge upstream automatically; manual rebase only when needed.
5. Existing 5 SKILL.md skills must still work post-migration. Same files (`resources/skills/*/SKILL.md`) — only the loader changes.
6. oi-bridge stays as-is (Node + express). Just register it as a tool in agent-tars.
7. Final installer must be Windows x64 NSIS, single .exe like today.
