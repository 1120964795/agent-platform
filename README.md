# AionUi

AionUi is a Windows desktop control plane for agentic work. It keeps the model, browser automation, desktop automation, confirmations, audit logs, generated artifacts, and runtime setup in one visible Electron app.

The merged V2 direction is deliberately focused:

- DeepSeek owns chat, planning, intent classification, and coding reasoning.
- Browser Use handles browser automation through the Browser Use bridge and ZenMux-compatible settings.
- Desktop/Computer Use handles real desktop automation through the desktop-use bridge.
- AionUi owns policy, confirmations, audit logging, emergency stop, setup guidance, artifacts, and runtime setup.

The model proposes actions. AionUi validates and classifies them. The user approves risky work. Adapters execute only approved actions. Every meaningful event is recorded in the audit log.

## Features

- Unified chat surface with DeepSeek text reasoning.
- Browser Use bridge for browser tasks, snapshots, navigation, and web interaction.
- Desktop Use bridge for real desktop observation and input with confirmation controls.
- Scheduled Tasks plugin for natural-language task creation, one-time full-trust confirmation, Windows Task Scheduler wake-up, and task-owned chat history.
- Settings pages for API keys, runtime diagnostics, safety policy, and generated artifacts.
- Artifacts list for generated Word, PowerPoint, and file outputs with open/delete actions.
- Browser Use dependency install and repair through the app-managed Python runtime setup.
- Desktop/Computer Use bridge packaged as a managed sidecar.
- Dry-run runtime for demos when external runtime configuration is unavailable.
- Windows NSIS packaging through electron-builder.

## Architecture

```text
React UI
  -> Electron IPC
  -> DeepSeek model path
  -> Agent loop and tool policy
  -> Confirmation, audit, and artifact registration
  -> Runtime bridges
       -> Browser Use bridge  -> server/browser-use-bridge
       -> Desktop Use bridge  -> server/desktop-use-bridge
       -> Dry-run helpers
  -> Generated artifacts
```

Hard boundaries:

- Model output never executes commands or GUI input directly.
- High-risk actions require explicit confirmation.
- Browser Use Python dependencies are installed into app-managed dependency storage.
- Desktop input is supervised by the desktop-use bridge and can pause for user input.
- Generated Office and file outputs are registered as artifacts.

## Prerequisites

- Windows 10/11 x64.
- Node.js and npm for development.
- Python 3.11+ for Browser Use runtime installation.
- DeepSeek API key for chat and planning.
- ZenMux-compatible API key for Browser Use and Desktop Use automation.

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

- Add a DeepSeek API key.
- Add Browser Use endpoint, model, and API key.
- Add Desktop Use endpoint, model, and API key, or enable Browser Use key fallback.
- Review runtime diagnostics for Browser Use and Desktop Use bridges.
- Open Settings -> Artifacts to inspect generated Word, PowerPoint, and file outputs.
- Open Settings -> Scheduled Tasks to pause, run, delete, and inspect preauthorized scheduled tasks.
- Keep dry-run enabled when external runtime settings are not available.

## Browser Use Runtime

AionUi launches `server/browser-use-bridge` and can repair Browser Use Python dependencies from Settings or during Windows install. The dependency set comes from `server/browser-use-bridge/requirements.txt`.

## Desktop Use Runtime

AionUi launches `server/desktop-use-bridge` for real desktop automation. Desktop Use can use its own ZenMux-compatible settings or reuse Browser Use settings when fallback is enabled.

## Safety Model

Risk levels:

- `low`: safe observation, status checks, and non-mutating reads.
- `medium`: bounded actions that may change local state.
- `high`: installs, deletes, overwrites, GUI input, submissions, or other impactful work.
- `blocked`: credential exfiltration, formatting disks, disabling security tooling, hidden background execution, and unbounded recursive delete.

Medium and high risk actions pause for confirmation. Blocked actions never reach runtime adapters.

## Documentation

- Dry-run demo script: `docs/demo-script.md`
- User manual: `docs/USER_MANUAL.md`
- Runtime setup: `docs/runtime-setup.md`
- Developer guide: `docs/developer-guide.md`
- Release checklist: `docs/release-checklist.md`
- Test report: `docs/test-report.md`
