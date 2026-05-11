# Fork UI-TARS-desktop Implementation Plan

> **For codex (executor):** Spec: `docs/superpowers/specs/2026-05-09-fork-ui-tars-desktop-design.md`. **This replaces all previous v1/v2/v3 agent-loop plans.** We're abandoning the self-build path and adopting bytedance/UI-TARS-desktop as the new base.

**Decision:** Fresh repo seeded from UI-TARS-desktop (not a true git fork). Vendor their code, brand as AionUi, port your differentiating features (SKILL.md skills + Open Interpreter integration) on top.

**Estimated total work:** 6-8 days for one engineer. Phases below.

**Workspace:** new project at `C:\Users\g\Desktop\aionui` (sibling to current `agent-lite`). Current `agent-lite` is preserved unchanged — it's the source we port from.

---

## Phase 0: Environment + repo bootstrap

### 0.1 Toolchain prerequisites

UI-TARS-desktop requires:
- Node.js >= 22 (you have 24 — fine)
- pnpm (install: `npm i -g pnpm`)
- Python 3.11+ (for the browser-side tooling they may bundle)
- Windows Build Tools (for native modules)

- [ ] Install pnpm globally if not present.
- [ ] Verify `node -v`, `pnpm -v`, `python --version`.

### 0.2 Clone + prove it builds

- [ ] Clone reference into a scratch dir:
  ```
  cd C:\Users\g\Desktop
  git clone https://github.com/bytedance/UI-TARS-desktop.git ui-tars-reference
  ```
- [ ] In the scratch clone, follow their README:
  ```
  cd ui-tars-reference
  pnpm install
  pnpm dev
  ```
- [ ] Verify the dev mode launches their Electron app on Windows. If something breaks (they're a Mac-first project), open issues; document workarounds.
- [ ] Note: this scratch clone is throwaway. Don't commit it.

### 0.3 Create fresh AionUi repo

- [ ] Make new dir: `C:\Users\g\Desktop\aionui`. `git init`.
- [ ] Copy the reference's contents (excluding `.git`) into `aionui/`:
  ```bash
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='dist' \
        ui-tars-reference/ aionui/
  ```
- [ ] In `aionui/`, replace `LICENSE` with the upstream Apache-2.0 (already present); add `NOTICE` file:
  ```
  AionUi
  Copyright 2026 <your name>

  This product includes software developed by ByteDance Ltd.,
  available at https://github.com/bytedance/UI-TARS-desktop, licensed
  under Apache-2.0. See LICENSE for full terms.
  ```
- [ ] Initial commit: `chore: vendor UI-TARS-desktop@<sha> as base for AionUi`. Note the upstream commit SHA in the message — this is your rebase anchor.
- [ ] Commit pnpm-lock.yaml for reproducibility.

---

## Phase 1: Build + brand

### 1.1 Identity

- [ ] Search-and-replace tool to update name across the codebase. Targets:
  - `apps/ui-tars/package.json` — `name`, `productName`, `description`
  - `apps/ui-tars/electron-builder.yml` (or `forge.config.ts`) — `appId`, `productName`, NSIS title
  - Window title strings in `apps/ui-tars/src/main/window/*`
  - Tray title, menu strings
  - CSS/HTML in renderer where the UI shows "UI-TARS"
- [ ] Replace icons: `apps/ui-tars/build/icon.*` → AionUi icon assets (use existing `agent-lite/resources/skills/.../icon.png` or similar; create one if absent).
- [ ] Adjust user-data dir name in Electron app config so settings don't collide with a real UI-TARS-desktop install (`getPath('userData')` should resolve to `AionUi` not `UI-TARS-desktop`).

### 1.2 First Windows build

- [ ] `pnpm install` (full).
- [ ] `pnpm dev` — verify dev mode runs.
- [ ] `pnpm make:win` (or whatever electron-forge target builds Windows x64 NSIS).
- [ ] Install the resulting installer on a clean VM. Verify it launches as "AionUi", not "UI-TARS-desktop".
- [ ] Commit: `feat(brand): rename to AionUi, replace icons, update product strings`

---

## Phase 2: Configure default model providers (Doubao + DeepSeek)

UI-TARS-desktop already supports Volcengine/Doubao natively. We just need:
- Pre-fill Doubao endpoint as default
- Add/keep DeepSeek as a chat-only provider option

### 2.1 Inventory their settings UI

- [ ] Read `apps/ui-tars/src/main/services/` and renderer settings panel files. Find where model provider config is read/written.
- [ ] Find where the model API key is stored (likely Electron store / config.json).

### 2.2 Pre-fill Doubao

- [ ] Set the default `provider: 'volcengine'` and `model: 'ep-...'` (point at user's existing Doubao seed-1.6-vision endpoint, OR document that user enters in Settings).
- [ ] Default base URL: `https://ark.cn-beijing.volces.com/api/v3`.
- [ ] If UI-TARS-desktop's settings UI is English-first, add Chinese strings (their i18n likely supports `zh-CN`).

### 2.3 Verify chat works end-to-end

- [ ] Configure Doubao key in Settings.
- [ ] Type "你好" in chat.
- [ ] Confirm response returns. Confirm history persists across restart.

- [ ] Commit: `feat(config): default to Volcengine Doubao + agent-tars chat verified`

---

## Phase 3: Wire Open Interpreter as a custom tool

UI-TARS-desktop has shell/file tools but not OI. We register OI as additional tool in agent-tars.

### 3.1 Vendor oi-bridge sidecar

- [ ] Copy `agent-lite/server/oi-bridge/` into `aionui/server/oi-bridge/`.
- [ ] Add to root pnpm workspace if needed (or keep as standalone Node project).
- [ ] Confirm it builds + runs standalone: `cd server/oi-bridge && npm install && node index.js --port 8756`.

### 3.2 Bridge supervisor

- [ ] Port `agent-lite/electron/services/bridgeSupervisor.js` (the Phase 5.5f-fixed version with in-memory tokens). Or write a new simpler one targeted at oi-bridge only since UI-TARS-desktop manages its own gui-agent.
- [ ] In `apps/ui-tars/src/main/main.ts` (or wherever services init), call `bridgeSupervisor.start({ oi: true })` after app ready.

### 3.3 Register oi tools with agent-tars

agent-tars likely has a tool registration API (per their MCP integration). Investigate `multimodal/agent-tars/` for the tool definition pattern. Then:

- [ ] Create `apps/ui-tars/src/main/tools/oiTools.ts`:
  - Register `run_shell_command`, `read_file`, `write_file`, `edit_file`, `delete_path` (use existing AionUi tool name conventions).
  - Each tool's `invoke` → HTTP POST to oi-bridge `/execute` with proper sidecar token.
  - Use agent-tars's tool schema (likely Zod or JSON schema).

- [ ] Test: ask agent "在桌面创建 hello.txt 写入 hello world" → tool called → file appears.

- [ ] Commit: `feat(tools): wire Open Interpreter sidecar as agent-tars custom tools`

---

## Phase 4: Port SKILL.md prompt skills

UI-TARS-desktop uses MCP tools (executable). Your existing skills are markdown prompt-loaders. Adapt:

### 4.1 Vendor skills + loader

- [ ] Copy `agent-lite/resources/skills/` into `aionui/resources/skills/` (the 5 SKILL.md skills: dep-installer, file-explorer, ppt-builder, study-helper, word-writer).
- [ ] Port `agent-lite/electron/skills/loader.js` and `registry.js` into `aionui/apps/ui-tars/src/main/skills/`.

### 4.2 Register `load_skill` tool

- [ ] Create `apps/ui-tars/src/main/tools/loadSkillTool.ts`:
  - Registers `load_skill` tool with agent-tars.
  - On invoke `{name}`, reads `resources/skills/<name>/SKILL.md` and returns its content as the tool result.
  - The agent puts that content into its context and follows the workflow described in the markdown.

### 4.3 Skills UI

- [ ] In their settings/skills panel (if exists), list available SKILL.md skills with toggles. If they don't have a skills panel, add a minimal one.

- [ ] Test: "use file-explorer skill to list my Downloads" → `load_skill('file-explorer')` invoked → markdown loaded → agent uses described workflow.

- [ ] Commit: `feat(skills): port SKILL.md prompt-skill system as load_skill tool`

---

## Phase 5: Verify history + bootstrap (likely no-op)

UI-TARS-desktop already has Event Stream + history persistence. Just confirm it works for AionUi:

- [ ] Have a 5-message chat (mix of pure chat + tool calls + browser task).
- [ ] Close + reopen AionUi.
- [ ] Verify the conversation reloads from sidebar.
- [ ] Verify their database/storage location is in our renamed `userData` folder, not the old UI-TARS one.

For bootstrap (Python deps for browser-use): UI-TARS-desktop's hybrid browser agent likely doesn't need Python at all (TypeScript-based, uses Playwright via Node). Confirm this — if so, the Phase 4-bootstrap nightmare from the v3 plan disappears entirely.

- [ ] Read `multimodal/agent-tars/` browser-related code. Confirm it's pure Node/TypeScript.
- [ ] If pure Node: no Python bootstrap needed. Update the Welcome dialog tier-checks accordingly (drop "Python installed" requirement).
- [ ] If somehow needs Python: implement the uv-based bootstrap from v3 spec §6, but only as an optional component.

- [ ] Commit: `chore(history): verify event stream + persistence work in fork; remove Python bootstrap if not needed`

---

## Phase 6: Welcome dialog + Chinese UX

UI-TARS-desktop's UX is English-first. Polish for AionUi:

### 6.1 Welcome dialog

- [ ] Port the 3-tier Welcome dialog content from `agent-lite/client/src/components/WelcomeSetupDialog.jsx`. Map to UI-TARS-desktop's onboarding flow (likely a settings wizard already).
- [ ] Tier 1 (lite): DeepSeek key only.
- [ ] Tier 2 (recommended): + Doubao key.
- [ ] Tier 3 (full): + screen authorization for desktop tools.

### 6.2 Strings + i18n

- [ ] If UI-TARS-desktop has `zh-CN` resources, audit and update.
- [ ] If not, hard-code Chinese strings in renderer (acceptable for v1).

### 6.3 Default skills enabled

- [ ] Match agent-lite default state: 5 SKILL.md skills installed but enabled per user choice.

- [ ] Commit: `feat(ux): port AionUi 3-tier Welcome + Chinese UX`

---

## Phase 7: Acceptance — clean Windows VM

Use the same scenarios from agent-loop v3 spec §10.1, adjusted for the new base:

1. **Pure chat**: agent answers "中国地质大学有几个校区？" without tools.
2. **Pure shell**: "在桌面创建 hello.txt 写入 hello world" → `write_file` (their tool or our oi-bridge wrapper). User approves.
3. **Multi-tool**: write + read same file.
4. **Browser task on stable site**: "用浏览器打开 example.com 告诉我标题" → result mentions "Example Domain".
5. **Desktop screenshot**: "看下我屏幕" → screenshot captured.
6. **SKILL.md load**: "use file-explorer skill to list Downloads" → workflow loaded.
7. **History**: chat → restart → conversation reloads.
8. **Branding**: title bar / about dialog / installer all say AionUi.
9. **Cancel mid-browser-task**: click stop within 5s → completes within 2s.
10. **No Python required** (assumption from Phase 5; if false, this changes).

Append results to `docs/test-report.md` under `## 2026-05-09 Fork acceptance`.

If all PASS → tag v0.1.0-fork. If anything FAILs → file an issue, address before tagging.

- [ ] Commit: `docs(test-report): fork acceptance results`

---

## Definition of Done

- AionUi.exe NSIS installer builds via `pnpm make:win`.
- Clean Windows VM install: app launches, Welcome dialog asks for keys, user enters DeepSeek + Doubao, all 7 pillars work.
- 5 existing SKILL.md skills still loadable via `load_skill` tool.
- oi-bridge integrated as agent-tars tool — shell/file/code work.
- Browser tasks work on example.com via UI-TARS-desktop's hybrid browser agent.
- Desktop control works (screenshot + click) via gui-agent.
- Conversation history persists.
- Apache-2.0 LICENSE + NOTICE file in repo.
- README updated to identify AionUi as a fork of UI-TARS-desktop with attribution.
- Old `agent-lite/` repo preserved as backup (not deleted; it's the source we ported from).

## Backout plan

If after Phase 2 it's clear UI-TARS-desktop's architecture is too painful
to fork (TypeScript barrier, electron-forge issues, missing key features),
abandon the fork and return to v3 self-build plan in `agent-lite`. The new
`aionui` directory is just throwaway clone work at that point.

The decision point is end of **Phase 2** — if dev mode runs + Doubao chat
works there, the rest is bolt-ons. If Phase 2 fails, fork is not viable for us.
