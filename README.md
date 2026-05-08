# AionUi

AionUi is a Windows desktop control plane for agentic work. It keeps the model, local execution, screen control, confirmations, audit logs, and runtime setup in one visible Electron app.

The V2 product direction is deliberately narrow:

- Qwen is the primary planner for task execution, action intent, and coding reasoning.
- DeepSeek remains available as an optional plain-chat fallback only.
- Open Interpreter is integrated as a managed external runtime for command, file, and code work.
- UI-TARS is integrated as a managed runtime for screen observation, mouse, and keyboard actions.
- AionUi owns policy, confirmations, audit logging, emergency stop, setup guidance, and run outputs.

The model proposes actions. AionUi validates and classifies them. The user approves risky work. Adapters execute only approved actions. Every meaningful event is recorded in the audit log.

Security review details live in `docs/security-policy.md`. The short version is: model output must pass through the action planner, policy engine, broker, confirmation path, adapter boundary, audit log, and run output storage.

## Features

- Chat and Execute modes in the main conversation surface.
- Models and Runtimes setup for Qwen, optional DeepSeek, Open Interpreter, UI-TARS, and dry-run demos.
- Control Center for pending, running, completed, failed, denied, blocked, and cancelled actions.
- Structured confirmation UI for medium and high risk actions.
- Sanitized append-only audit logs with filters and export.
- Run Outputs panel for command summaries, generated files, screenshots, and demo artifacts.
- Dry-run runtime so the full flow can be demonstrated without external installs.
- Windows NSIS packaging through electron-builder.

## Architecture

```text
React UI -> Electron IPC -> Model Router -> Qwen Planner
                                      -> Action Planner
                                      -> Action Broker
                                      -> Policy + Confirmation + Audit
                                      -> Open Interpreter / UI-TARS / Dry Run adapters
                                      -> Run Outputs
```

Hard boundaries:

- Open Interpreter source is not vendored in this repository.
- UI-TARS input actions require active screen authorization.
- Model output never executes commands directly.
- High-risk actions always require explicit confirmation.
- Legacy Office, diagnostics, and workflow surfaces are compatibility helpers, not the product center.

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

- Add a Qwen API key, base URL, primary model, and coding model.
- Optionally configure DeepSeek as a plain-chat fallback.
- Configure Open Interpreter as an external sidecar command or endpoint.
- Configure UI-TARS Desktop, SDK, fork endpoint, or adapter service.
- Pick a workspace root for command/file context.
- Keep dry-run enabled when external runtimes are not installed.

## Open Interpreter Runtime

AionUi treats Open Interpreter as an external default capability. Install and run Open Interpreter outside this repository, then expose an AionUi-compatible sidecar endpoint such as `http://127.0.0.1:8756`. The adapter posts approved protocol requests to `/execute`.

Open Interpreter's AGPL source is not vendored here. Setup commands are high risk and must be confirmed through AionUi before running.

## UI-TARS Runtime

UI-TARS is the default screen-control capability. Configure UI-TARS Desktop, SDK, a maintained fork, or an adapter service endpoint such as `http://127.0.0.1:8765`. Screen authorization must be active before observe, mouse, or keyboard actions run.

Mouse and keyboard proposals are high risk by default and appear in Control Center. Emergency stop cancels queued UI actions and notifies the adapter.

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
