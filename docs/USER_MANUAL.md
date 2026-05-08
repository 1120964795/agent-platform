# AionUi V2 User Manual

This manual covers the AionUi V2 desktop app: chat, execution tasks, model setup, runtime setup, confirmations, audit logs, run outputs, dry-run demos, and Windows packaging.

## What AionUi Does

AionUi is the visible control plane for agentic desktop work. Qwen plans tasks and proposes actions. AionUi validates those actions, applies safety policy, asks for confirmation when risk is medium or high, dispatches approved actions to managed runtimes, and records the full timeline.

Default runtimes:

- Qwen: required for task planning, action intent, and coding reasoning.
- DeepSeek: optional plain-chat fallback only.
- Open Interpreter: external sidecar for command, file, and code execution.
- UI-TARS: external screen-control runtime for observe, mouse, and keyboard actions.
- AionUi dry-run: deterministic demo runtime when external runtimes are missing.

## First Run

1. Open Settings.
2. Configure Qwen API key, base URL, primary model, and coding model.
3. Optionally configure DeepSeek fallback for plain chat.
4. Open Models/Runtimes and check Open Interpreter and UI-TARS status.
5. Keep dry-run enabled if the external runtimes are not installed yet.
6. Use Chat mode for normal conversation, or Execute mode for brokered task execution.

## Chat Mode

Chat mode is for normal assistant replies. It can use Qwen by default and DeepSeek only when configured as the plain-chat fallback.

Chat mode does not treat the model as an execution brain. It is safe for regular questions, coding discussion, and planning before running anything locally.

## Execute Mode

Execute mode routes the user task to Qwen planning. Qwen must return structured action proposals. AionUi then:

1. Parses and validates the action plan.
2. Rejects unknown runtimes or action types.
3. Classifies risk.
4. Blocks unsafe actions.
5. Shows pending confirmations for medium and high risk actions.
6. Dispatches approved actions to Open Interpreter, UI-TARS, or dry-run adapters.
7. Saves results to Run Outputs.
8. Appends sanitized audit events.

## Control Center

The Control Center shows current task session, pending actions, running actions, completed actions, failed actions, denied actions, blocked actions, exact sanitized payload summaries, approve and deny buttons, and emergency stop.

Emergency stop cancels queued actions and asks active runtimes to stop where possible.

## Models And Runtimes

The Models/Runtimes panel shows readiness for Qwen, DeepSeek fallback, Open Interpreter, UI-TARS, and dry-run runtime.

Each runtime card can show ready, not installed, needs configuration, disabled, or error states. Setup and repair buttons call runtime bootstrap IPC and return guidance instead of crashing the app.

## Audit Logs

Audit logs are append-only JSONL events stored under the app data directory. The UI supports filters by session, runtime, risk, phase, and text. Exported logs are sanitized.

Secrets are masked in API keys, bearer tokens, command strings, environment variables, URLs, headers, file content snippets, and runtime logs.

## Run Outputs

Run Outputs replaces the old document-first artifact surface. It stores command summaries, generated files, screenshots metadata, dry-run artifacts, and runtime result notes. Output files open through the app's safe file-open bridge.

## Open Interpreter

Open Interpreter is a default AionUi execution capability, but its AGPL source is not vendored here. Configure it as an external command, sidecar endpoint, or maintained fork outside this repository.

Supported actions include `shell.command`, `file.read`, `file.write`, `file.delete`, `code.execute`, and `runtime.setup`.

Open Interpreter never receives raw model output directly. It only executes actions approved by the broker.

### Setup

1. Install Open Interpreter outside this repository.
2. Start an AionUi-compatible sidecar or wrapper process.
3. Set `Open Interpreter endpoint` in Settings, for example `http://127.0.0.1:8756`.
4. Run a health check from Models/Runtimes.
5. Test a command action such as `npm test`, a workspace file write, and a small code execution snippet.

Every proposed command, file write, or code execution appears in Control Center and Audit Logs. Setup or install commands are high risk and require confirmation.

## UI-TARS

UI-TARS is a default screen-control capability. Configure UI-TARS Desktop, SDK, fork endpoint, or adapter service in Settings.

Supported actions include `screen.observe`, `screen.region.select`, `mouse.move`, `mouse.click`, `keyboard.type`, and `keyboard.shortcut`.

Mouse and keyboard actions require active screen authorization and normally require confirmation.

### Setup

1. Install UI-TARS Desktop, SDK, or a maintained fork.
2. Start an AionUi-compatible adapter endpoint, for example `http://127.0.0.1:8765`.
3. Set `UI-TARS endpoint` in Settings.
4. Turn on `Screen authorization active` only when the visible screen is safe for automation.
5. Test `screen.observe`, then a mouse click proposal, then a keyboard type proposal.
6. Use emergency stop before further UI action when testing interruption behavior.

All UI-TARS actions appear in Control Center and Audit Logs. Mouse and keyboard actions are denied or blocked unless screen authorization is active and the broker approves the action.

## Dry-Run Demo

Dry-run mode simulates Qwen planning, Open Interpreter execution, UI-TARS screen control, and run outputs. It is clearly labelled as dry-run and is intended for demos, tests, and first-run validation without external installs.

Try:

```text
Inspect a fake screen, propose the next click, run a fake test command, create a fake output summary, and export the logs.
```

## Risk Levels

- Low: observation and non-mutating reads.
- Medium: bounded command, file, and code work.
- High: installs, deletes, overwrites, GUI input, submissions, and sensitive system changes.
- Blocked: credential exfiltration, disk formatting, hidden background execution, disabling security tooling, and unbounded recursive delete.

High-risk actions always require confirmation. Blocked actions never run.

## Developer Commands

```powershell
npm run setup
npm test
npm run build:client
npm run electron:build
```

If Electron download fails because of TLS interception or proxy behavior, use a trusted mirror or pre-populated Electron cache before packaging.

## More Documentation

- Runtime setup: `docs/runtime-setup.md`
- Developer guide: `docs/developer-guide.md`
- Security policy: `docs/security-policy.md`
- Dry-run demo: `docs/demo-script.md`
- Release checklist: `docs/release-checklist.md`
- Test report: `docs/test-report.md`
