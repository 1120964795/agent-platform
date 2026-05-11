# AionUi

AionUi is a Windows desktop control plane for agentic work. It keeps the model, local execution, screen control, confirmations, audit logs, and runtime setup in one visible Electron app.

The V2 product direction is deliberately narrow:

- DeepSeek-V4 owns chat, planning, intent classification, and coding reasoning.
- Open Interpreter remains the managed local runtime for command, file, and code work.
- AionUi owns policy, confirmations, audit logging, emergency stop, setup guidance, and run outputs.

The model proposes actions. AionUi validates and classifies them. The user approves risky work. Adapters execute only approved actions. Every meaningful event is recorded in the audit log.

Security review details live in `docs/security-policy.md`. The short version is: model output must pass through the action planner, policy engine, broker, confirmation path, adapter boundary, audit log, and run output storage.

## Features

- Chat and Execute modes in the main conversation surface.
- Models and Runtimes setup for DeepSeek, Browser Use, Open Interpreter, UI-TARS, and dry-run demos.
- Control Center for pending, running, completed, failed, denied, blocked, and cancelled actions.
- Structured confirmation UI for medium and high risk actions.
- Sanitized append-only audit logs with filters and export.
- Run Outputs panel for command summaries, generated files, screenshots, and demo artifacts.
- Dry-run runtime so the full flow can be demonstrated without external installs.
- Windows NSIS packaging through electron-builder.

## Architecture

```text
React UI
  -> Electron IPC
  -> Model Router -> DeepSeek-V4 (chat / plan / intent / code)
  -> Action Planner
  -> Action Broker
  -> Policy + Confirmation + Audit
  -> Runtime Adapters
       -> Open Interpreter adapter -> 127.0.0.1:8756 -> server/oi-bridge -> external Open Interpreter
       -> UI-TARS adapter          -> 127.0.0.1:8765 -> server/uitars-bridge
       -> Browser Use adapter      -> 127.0.0.1:8780 -> server/browser-use-bridge
       -> Dry Run adapter
  -> Run Outputs
```

Hard boundaries:

- Open Interpreter source is not vendored in this repository.
- Midscene is consumed from npm; the Chrome extension is installed manually by the user.
- UI-TARS input actions require active screen authorization.
- Model output never executes commands directly.
- High-risk actions always require explicit confirmation.
- Legacy Office, diagnostics, and workflow surfaces are compatibility helpers, not the product center.

## Prerequisites

- Windows 10/11 x64
- Python 3.10+ with `pip install open-interpreter`
- Google Chrome for Browser Use automation
- API keys for the active model endpoints:
  - DeepSeek (https://platform.deepseek.com)
  - Browser Use provider configured in Settings

## Install

```powershell
npm run setup
```

If Electron binary download fails behind a corporate proxy, retry with a reachable mirror or a local Electron cache before packaging.

## Development

```powershell
npm run electron:dev
```

## Test

```powershell
npm test
npm run build:client
```

## Package

```powershell
npm run electron:build
```

The Windows installer is written to `dist-electron/`.

## Configuration

Open Settings inside the app:

- Add a DeepSeek API key and keep the default mainland endpoint unless your deployment differs.
- Add Browser Use settings if you want browser automation.
- Configure Open Interpreter if you want shell, file, and code actions.
- Pick a workspace root for command/file context.
- Keep dry-run enabled when external runtimes are not installed.

## Open Interpreter Runtime

AionUi launches the managed `server/oi-bridge` sidecar on `127.0.0.1:8756`. Install Open Interpreter outside this repository with Python, then let the sidecar call the external runtime for approved shell, file, and code actions.

Open Interpreter's AGPL source is not vendored here. Setup commands are high risk and must be confirmed through AionUi before running.

## UI-TARS Runtime

UI-TARS is the desktop screen-control capability. AionUi launches `server/uitars-bridge` on `127.0.0.1:8765`. Screen authorization must be active before observe, mouse, or keyboard actions run.

Mouse and keyboard proposals are high risk by default and appear in Control Center. Emergency stop cancels queued UI actions and notifies the adapter.

## Browser Use Runtime

Browser Use is the browser automation capability. AionUi launches `server/browser-use-bridge` on `127.0.0.1:8780`; the bridge uses the Browser Use settings configured in the app.

Browser actions still pass through policy, confirmation, audit logging, and run outputs.

## Safety Model

Risk levels:

- `low`: safe observation, status checks, and non-mutating reads.
- `medium`: local command/file/code work that is bounded but may change the workspace.
- `high`: install, delete, overwrite, GUI input, submit, or other impactful work.
- `blocked`: credential exfiltration, formatting disks, disabling security tooling, hidden background execution, and unbounded recursive delete.

Medium and high risk actions pause in the Control Center until approved or denied. Blocked actions never reach runtime adapters.

## Documentation

- Final delivery plan: `docs/superpowers/plans/2026-05-08-aionui-v2-final-delivery-plan.md`
- Dry-run demo script: `docs/demo-script.md`
- User manual: `docs/USER_MANUAL.md`
- Runtime setup: `docs/runtime-setup.md`
- Developer guide: `docs/developer-guide.md`
- Release checklist: `docs/release-checklist.md`
- Test report: `docs/test-report.md`
