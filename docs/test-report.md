# AionUi V2 Test Report

Date: 2026-05-08

## Automated Verification

```text
npm test
```

Result: passed. Final run: 26 test files, 93 tests.

```text
npm run build:client
```

Result: passed.

```text
npm run electron:build
```

Result: passed. Output included `dist-electron\AionUi Setup 0.1.0.exe`.

```text
dist-electron\win-unpacked\AionUi.exe
```

Result: launch smoke passed after the final package build. The packaged app process started and stayed alive for the smoke window, then was closed.

## Notes

- Initial dependency setup required using a reachable Electron mirror because the default Electron binary download failed behind TLS/proxy behavior.
- Open Interpreter and UI-TARS real external runtimes are documented and adapter-tested at the protocol boundary.
- Dry-run mode is available for complete demo flow without external runtime installs.

## Pending Release-Machine Verification

Manual in-app smoke test still recommended on the release machine:

- Normal chat.
- Dry-run Execute mode.
- Control Center approve/deny.
- Logs export.
- Outputs panel.
- Runtime setup cards.
- Emergency stop.

## 2026-05-09 Tri-Model + Midscene Acceptance

Environment: Windows 11 x64 dev machine, Node.js/npm workspace, Electron Builder win target.

### Automated Verification

| Command | Result | Notes |
|---|---|---|
| `npm test` | PASS | 40 test files, 160 tests |
| `npm run build:client` | PASS | Vite production build completed |
| `npm run electron:build` | PASS | Generated `dist-electron\AionUi Setup 0.1.0.exe` |

Packaged resource verification: PASS. `dist-electron\win-unpacked\resources\server\` contains `oi-bridge`, `uitars-bridge`, and `midscene-bridge`.

### Manual Clean-VM Acceptance

Not run in this development environment. The clean Windows VM, Chrome Midscene extension connection, and live DeepSeek / Qwen3-VL / Doubao API keys are required before marking these items PASS.

| # | Action | Runtime | Result | Audit | Output panel | Notes |
|---|---|---|---|---|---|---|
| 1 | shell echo hi | OI | NOT RUN | NOT RUN | NOT RUN | Requires clean VM acceptance |
| 2 | code python 1+1 | OI | NOT RUN | NOT RUN | NOT RUN | Requires clean VM acceptance |
| 3 | file.write tmp | OI | NOT RUN | NOT RUN | NOT RUN | Requires clean VM acceptance |
| 4 | mouse.click controlled target | UI-TARS | NOT RUN | NOT RUN | NOT RUN | Requires screen authorization and Doubao Ark key |
| 5 | web.click search | Midscene | NOT RUN | NOT RUN | NOT RUN | Requires Chrome extension bridge and Qwen3-VL key |
| 6 | web.query title | Midscene | NOT RUN | NOT RUN | NOT RUN | Requires Chrome extension bridge and Qwen3-VL key |

Emergency Stop on #5: NOT RUN. Requires live Midscene browser action on the clean VM.

## 2026-05-09 UI-TARS-desktop fork spike

Scratch directory: `C:\Users\g\Desktop\ui-tars-spike`
Upstream commit: `7986f5aea500c4535c0e55dc5c5d0cda73767c45`

### A — Build/run

Result: **FAIL**

Prerequisites:
- `node -v`: `v24.14.0`
- `pnpm` was initially missing; installed with `npm i -g pnpm`
- `pnpm -v`: `9.10.0`

Actual upstream scripts:
- Root dev command: `pnpm dev:ui-tars`
- App dev command: `pnpm --filter ui-tars-desktop dev`
- App package command: `pnpm --filter ui-tars-desktop package`
- App make command: `pnpm --filter ui-tars-desktop make`
- Windows publish command: `pnpm --filter ui-tars-desktop publish:win32`

Install failed:

```text
pnpm install
ERR_PNPM_EPERM EPERM, Permission denied:
\\?\C:\Users\g\Desktop\ui-tars-spike\packages\ui-tars\electron-ipc\node_modules\electron
```

Retried with `pnpm install --package-import-method=copy --reporter=append-only`; it failed with the same `ERR_PNPM_EPERM` on the same path.

Dev mode was not run because dependency installation did not complete.

### B/C/D

Not run. Spike A failed, so the required discipline was to stop before B/C/D.

### Summary

Passed: **0/4**

Recommendation: fork plan is not viable yet in this Windows environment. Return to the v3 self-build route, or run a separate targeted Windows dependency-install investigation before reconsidering UI-TARS-desktop as a fork base.

## 2026-05-12 Main / Merge Dev Reconciliation

Verification should cover provider cleanup, Browser Use runtime install/repair, Desktop/Computer Use, chat confirmation flow, Settings Artifacts, Office artifact generation, full tests, client build, and package build where the local environment allows it.

Current targeted verification:

| Command | Result | Notes |
|---|---|---|
| `npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js client/src/lib/api.test.js` | PASS | Settings Artifacts, Welcome setup, and renderer API coverage |
| `npm.cmd test -- client/src/components/chat/unified-chat-ui.test.js electron/__tests__/chat.test.js electron/__tests__/chat-confirmation.test.js electron/__tests__/agent-loop.test.js` | PASS | Chat, confirmation, stream compatibility, and agent loop coverage |
| `npm.cmd test -- electron/__tests__/office-artifact-planner.test.js electron/__tests__/docs-tools.test.js electron/__tests__/ipc.test.js` | PASS | Office artifact planning, DOCX/PPTX artifact metadata, and IPC coverage |
| `npm.cmd run build:client` | BLOCKED | Local `client/node_modules` is missing `@vitejs/plugin-react`; `client/package.json` declares it, so dependency installation is required before build verification |
