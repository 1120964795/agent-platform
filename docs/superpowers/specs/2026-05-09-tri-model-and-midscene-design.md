# Tri-Model Routing + Midscene Bridge Design

- Date: 2026-05-09
- Status: Approved (for codex execution)
- Supersedes: positioning aspects of `docs/superpowers/specs/2026-05-09-bridge-sidecars-design.md`
  (its bridge-sidecars architecture remains in force; this spec ADDS the Midscene
  bridge and PIVOTS the model-routing roles)
- Audience: codex (executor)

## 0. Why

Three concurrent decisions, taken together:

1. **Model role pivot** — DeepSeek-V4 becomes primary planner/chat/code; Qwen
   collapses to "Midscene's vision model only"; Doubao 1.5 vision becomes
   "UI-TARS's vision model only". Each model does one thing well, on a Chinese
   endpoint, with no cross-border egress.
2. **Midscene runtime added** — for browser/web tasks where Midscene + Qwen3-VL
   wins decisively over UI-TARS + nutjs. Runs in **Bridge Mode** so users keep
   their logged-in browser sessions.
3. **Finish leftover work** — the previous bridge-sidecars plan still has
   Tasks 12–15 open (adapter healthy/offline/5xx tests, packaging
   `extraResources`, README prerequisites, acceptance run). Bundle that here so
   codex executes one coherent plan.

## 1. End-state architecture

```
Electron Main
 ├─ modelRouter.js  ─── chat/plan/code/intent ──▶ DeepSeek-V4 (官方 API)
 │                  ─── Midscene vision ────────▶ Qwen3-VL (DashScope)
 │                  ─── UI-TARS vision ─────────▶ 豆包 1.5 vision (火山方舟)
 │
 └─ bridgeSupervisor (3 sidecars now)
      ├─ openInterpreter/adapter ─HTTP─▶ server/oi-bridge        (existing, unchanged)
      ├─ uiTars/adapter ──────────HTTP─▶ server/uitars-bridge    (existing, model swap)
      └─ midscene/adapter ────────HTTP─▶ server/midscene-bridge  (NEW)
                                          └─ Bridge Mode → user's Chrome (extension)
```

Hard boundaries kept from prior spec:
- All bridges bind `127.0.0.1` only.
- No source vendoring of OI / UI-TARS. Midscene is npm-installable, vendored
  via `node_modules` (Apache-2.0, fine).
- `protocol.js` and `adapter.js` files for OI/UI-TARS: still untouched.

## 2. Model routing pivot

### What changes in `electron/services/modelRouter.js`

Today: route logic prefers Qwen for plan/intent/code, falls back to DeepSeek
for plain chat.

After: **DeepSeek-V4 is primary for everything text-shaped**:
- Chat turns
- Action planning (mapping user goals → action proposals)
- Action intent classification
- Code reasoning / generation

Qwen and Doubao **never appear in modelRouter**. They are visual models
consumed inside their respective bridges, not routed by AionUi.

### Settings schema (in `electron/store.js`)

Add:
```
deepseekChatEndpoint    : string  // OpenAI-compatible, default https://api.deepseek.com
deepseekApiKey          : string
deepseekPlannerModel    : string  // default deepseek-chat (or v4-pro per user setup)
deepseekCodingModel     : string  // default deepseek-coder
qwenVisionEndpoint      : string  // DashScope, default https://dashscope.aliyuncs.com/compatible-mode/v1
qwenVisionApiKey        : string
qwenVisionModel         : string  // default qwen3-vl-plus
doubaoVisionEndpoint    : string  // Volcengine Ark, default https://ark.cn-beijing.volces.com/api/v3
doubaoVisionApiKey      : string
doubaoVisionModel       : string  // default doubao-1-5-thinking-vision-pro-250428
```

Deprecate (read-only kept for one release, no longer wired):
```
qwenApiKey, qwenBaseUrl, qwenPlannerModel, qwenCodingModel
```

### README / USER_MANUAL re-positioning (must rewrite, not patch)

Replace the V2 product-direction bullet list. New canonical wording:

> AionUi V2 routes work to three Chinese-cloud models, each on its strongest
> task: DeepSeek-V4 for chat/planning/coding, Qwen3-VL for browser vision via
> Midscene, and Doubao 1.5 vision for desktop vision via UI-TARS. AionUi owns
> policy, confirmations, audit logging, emergency stop, setup guidance, and run
> outputs.

## 3. Midscene runtime

### Action types (extend `electron/security/actionTypes.js`)

```
RUNTIME_NAMES.MIDSCENE = 'midscene'
ACTION_TYPES.WEB_OBSERVE     = 'web.observe'      // capture page screenshot + URL
ACTION_TYPES.WEB_CLICK       = 'web.click'        // payload.target (NL string)
ACTION_TYPES.WEB_TYPE        = 'web.type'         // payload.text into focused/last-targeted field
ACTION_TYPES.WEB_QUERY       = 'web.query'        // payload.question → structured answer (aiQuery)
```

Out of scope for v1: `web.scroll`, `web.hover`, `web.assert`, `web.wait`.

### `electron/services/midscene/` (NEW, mirrors uiTars layout)

```
adapter.js          # HTTP POST to bridge — same shape as uiTars/adapter
bootstrap.js        # detect: bridge /health + extension status
processManager.js   # not used (bridge launched by supervisor); export status only
protocol.js         # aionui.midscene.v1 — frozen contract
```

`protocol.js` defines `toMidsceneRequest` / `normalizeMidsceneResult` exactly
mirroring oi-bridge's protocol shape. The adapter sends to
`http://127.0.0.1:8770/execute`.

### `server/midscene-bridge/` (NEW Node sidecar)

```
package.json        # express, @midscene/web (Bridge Mode), node-fetch
index.js            # /health, /execute, /stop
bridgeMode.js       # singleton @midscene/web AgentOverChromeBridge w/ Qwen3-VL config
translator.js       # action ↔ Midscene SDK calls
__tests__/*
```

Bridge launches an `AgentOverChromeBridge` from `@midscene/web` with config
sourced from env vars `MIDSCENE_QWEN_ENDPOINT`, `MIDSCENE_QWEN_API_KEY`,
`MIDSCENE_QWEN_MODEL` injected by `bridgeSupervisor`.

### User setup (Midscene Bridge Mode)

1. Install Chrome extension "Midscene" once (link in USER_MANUAL).
2. Click the extension icon → "Allow Bridge Connection".
3. AionUi shows green "Browser ready" in Settings.
4. Web actions now operate on the user's logged-in tab.

### First-run Welcome / Setup dialog

On first launch (and reopenable from `Settings → 初始设置向导`), AionUi shows a
modal with three usage tiers and live ✓/✗ for each dependency:

| Tier | Required | Status detected from |
|------|----------|----------------------|
| **轻量：仅聊天** | DeepSeek API Key | `store.getConfig().deepseekApiKey` non-empty |
| **中等：+浏览器自动化** | + Qwen Key + Chrome Midscene 扩展已连接 | `qwenVisionApiKey` set + midscene `/health` reports `extensionConnected:true` |
| **完整：+桌面 + 本地执行** | + Doubao Key + Python OI 已装 + 屏幕授权已开 | `doubaoVisionApiKey` set + oi-bridge reports `oiReady` after first ensure + `uiTarsScreenAuthorized:true` |

The dialog never blocks the app — users can dismiss it and use whichever tier
they have ready. A "First-run shown" flag is stored in `electron/store.js` so
it doesn't reappear unsolicited; reopening from Settings is always allowed.

If extension not installed/connected, `web.*` actions return
`{ ok:false, metadata:{ recoverable:true, requiresExtension:true, guidance:{...} } }`
— same recoverable pattern as OI/UI-TARS.

## 4. v1 acceptance set (replaces prior §8)

Six end-to-end actions across three runtimes:

| # | Runtime | Action | Verifies |
|---|---------|--------|----------|
| 1 | OI | `shell.command "echo hi"` | OI bridge alive, Doubao not involved |
| 2 | OI | `code.execute python "print(1+1)"` | code path |
| 3 | OI | `file.write` to temp | direct fs path |
| 4 | UI-TARS | `screen.observe` + `mouse.click "桌面回收站"` (dry-run first, then live) | Doubao vision wired |
| 5 | Midscene | `web.click "搜索按钮"` on baidu.com via Bridge Mode | Qwen vision wired |
| 6 | Midscene | `web.query "页面标题是什么？"` | aiQuery path |

All six must appear in audit log with correct policy class. Emergency Stop
must terminate any of them. Each result must show in Run Outputs panel.

## 5. Risks & red lines for codex

1. **Do not edit** `electron/services/openInterpreter/protocol.js`,
   `electron/services/uiTars/protocol.js`, `server/oi-bridge/translator.js`,
   `server/uitars-bridge/translator.js`. They are frozen contracts.
2. **Do not auto-install Chrome extension.** USER_MANUAL documents the
   manual install. AionUi only checks `/extension-status`.
3. **Bridges bind `127.0.0.1` only.** Verified in tests (already done for
   oi/uitars; replicate for midscene).
4. **`@midscene/web` API churn risk** — pin exact resolved version. Upgrades
   are separate PRs.
5. **DeepSeek pivot must NOT break existing chat tests.** `model-router.test.js`
   needs updates, not deletion. If a test currently asserts "Qwen primary",
   flip it; do not remove it.
6. **No cross-border egress.** All three endpoints default to mainland-China
   reachable hosts. README states this explicitly.
7. Bundle size: bridges ship via `extraResources`. Midscene + chromium
   driver footprint stays out — Bridge Mode does NOT bundle Playwright/Chromium.
8. v1 returns `notImplemented` for: `web.scroll`, `web.hover`, `web.assert`,
   `web.wait`, plus the previously listed OI/UI-TARS notImplemented set.

## 6. Definition of Done

- All new + modified tests pass: `npm test`.
- `npm run build:client` clean.
- `npm run electron:build` produces a Windows installer that includes all
  three bridges in `resources/server/`.
- Acceptance §4 (6 items) passes on a clean Windows VM with: Python +
  open-interpreter installed, Chrome with Midscene extension, three API keys
  configured.
- README, USER_MANUAL, runtime-setup.md updated with new tri-model positioning
  and Bridge Mode setup steps.
- `docs/test-report.md` appended with a 2026-05-09 acceptance run.
- `git diff main -- electron/services/openInterpreter/protocol.js
  electron/services/uiTars/protocol.js
  server/oi-bridge/translator.js
  server/uitars-bridge/translator.js` is empty.
