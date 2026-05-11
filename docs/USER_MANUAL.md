# 司南 V2 User Manual

This manual covers the 司南 V2 desktop app: chat, tool execution, model setup, runtime setup, confirmations, audit logs, run outputs, dry-run demos, and Windows packaging.

## What 司南 Does

司南 is the visible control plane for agentic desktop work. DeepSeek-V4 plans text work and proposes tool calls. 司南 validates those tool calls, applies safety policy, asks for confirmation when risk is medium or high, dispatches approved tool calls to managed runtimes, and records the full timeline.

Default runtimes:

- DeepSeek-V4: required for chat, planning, intent classification, and coding reasoning.
- UI-TARS + Doubao vision: desktop screen observation, mouse, and keyboard actions.
- Browser-Use: Python-based browser automation (navigate, snapshot, click, type, task).
- Open Interpreter: managed sidecar for command, file, and code execution.
- 司南 dry-run: deterministic demo runtime when external runtimes are missing.

## First-Time Setup

1. Install Python 3.11+ (required for browser-use and Open Interpreter):

```powershell
# Download from https://python.org/downloads/
python --version  # verify 3.11+
```

2. Install browser-use for web automation:

```powershell
pip install browser-use
playwright install chromium
```

3. Install Open Interpreter (optional, for shell/code execution):

```powershell
pip install open-interpreter
```

4. Open Settings and fill in the API keys:
   - DeepSeek API Key. Default endpoint: `https://api.platform.deepseek.com`.
   - Doubao on Volcengine Ark: set `doubaoVisionApiKey` for desktop control.
   - Vision model API key for browser-use (LiteLLM compatible).
5. Open Models/Runtimes and wait until Open Interpreter, UI-TARS, and Browser-Use show ready or show actionable setup guidance.
6. Run one dry-run task before real automation.

### Troubleshooting

- UI-TARS is not ready: confirm the Doubao Volcengine Ark API key is set and screen authorization is enabled only when the visible desktop is safe.
- Browser-Use is not ready: check Python 3.11+ is installed and `pip install browser-use` succeeded. Run `python -c "import browser_use"` to verify.
- Open Interpreter is not ready: confirm Python can run `interpreter` from a terminal and then restart 司南.
- If a managed runtime will not start, check `%TEMP%\aionui-logs\<bridge>-stderr.log`, for example `%TEMP%\aionui-logs\browser-use-stderr.log`.

## First Run

1. Open Settings.
2. Configure DeepSeek and Doubao API keys.
3. Verify Python 3.11+ is installed for browser-use.
4. Open Models/Runtimes and check Open Interpreter, UI-TARS, and Browser-Use status.
5. Keep dry-run enabled if the external runtimes are not installed yet.
6. Use Chat mode for normal conversation, or agent mode for tool-assisted task execution.

## Chat Mode

Chat mode is for normal assistant replies. It uses DeepSeek-V4 through the text model router.

Chat mode does not invoke tools. It is safe for regular questions, coding discussion, and planning before running anything locally.

## Agent Mode

Agent mode routes the user task to DeepSeek-V4 with tool access. The model may propose tool calls. 司南 then:

1. Receives tool calls from the model.
2. Classifies risk via toolPolicy.
3. Blocks unsafe tools.
4. Shows pending confirmations for medium and high risk tool calls.
5. Dispatches approved tool calls to Open Interpreter, UI-TARS, Browser-Use, or dry-run.
6. Returns tool results to the model for continued reasoning.
7. Saves results to Run Outputs.
8. Appends sanitized audit events.

## Control Center

The Control Center shows current session, pending tool calls, running tool calls, completed, failed, denied, and blocked actions, exact sanitized payload summaries, approve and deny buttons, and emergency stop.

Emergency stop cancels queued tool calls and asks active runtimes to stop where possible.

## Models And Runtimes

The Models/Runtimes panel shows readiness for DeepSeek, Doubao vision, Open Interpreter, UI-TARS, Browser-Use, and dry-run runtime.

Each runtime card can show ready, not installed, needs configuration, disabled, or error states. Setup and repair buttons provide guidance instead of crashing the app.

## Audit Logs

Audit logs are append-only JSONL events stored under the app data directory. The UI supports filters by session, runtime, risk, and text. Exported logs are sanitized.

Secrets are masked in API keys, bearer tokens, command strings, environment variables, URLs, headers, file content snippets, and runtime logs.

## Run Outputs

Run Outputs stores command summaries, generated files, screenshots metadata, dry-run artifacts, and runtime result notes. Output files open through the app's safe file-open bridge.

## Open Interpreter

Open Interpreter is a default 司南 execution capability, but its AGPL source is not vendored here. Configure it as an external command, sidecar endpoint, or maintained fork outside this repository.

Supported actions include `shell.command`, `file.read`, `file.write`, `file.delete`, `code.execute`, and `runtime.setup`.

Open Interpreter never receives raw model output directly. It only executes tool calls approved through toolPolicy.

### Setup

1. Install Open Interpreter outside this repository.
2. Start an 司南-compatible sidecar or wrapper process.
3. Set `Open Interpreter endpoint` in Settings, for example `http://127.0.0.1:8756`.
4. Run a health check from Models/Runtimes.
5. Test a command action such as `npm test`, a workspace file write, and a small code execution snippet.

Every proposed command, file write, or code execution appears in Control Center and Audit Logs. Setup or install commands are high risk and require confirmation.

## UI-TARS (Desktop Control)

UI-TARS is the desktop screen-control capability. 司南 launches the managed `uitars-bridge` automatically and injects the Doubao Volcengine Ark endpoint from Settings.

Supported tools include `desktop_observe`, `desktop_click`, and `desktop_type`.

Mouse and keyboard actions require active screen authorization and normally require confirmation.

### Setup

1. Create or reuse a Volcengine Ark endpoint for `doubao-1-5-thinking-vision-pro-250428`.
2. Set `doubaoVisionApiKey` in Settings.
3. Keep the default endpoint `https://ark.cn-beijing.volces.com/api/v3` unless your Ark deployment differs.
4. Turn on `Screen authorization active` only when the visible screen is safe for automation.
5. Test `desktop_observe`, then a click proposal, then a keyboard type proposal.
6. Use emergency stop before further UI action when testing interruption behavior.

All UI-TARS actions appear in Control Center and Audit Logs. Mouse and keyboard actions are denied or blocked unless screen authorization is active.

## Browser-Use (Web Automation)

Browser-Use is the Python-based browser automation capability. 司南 launches the managed `browser-use-bridge` automatically on port 8780.

Supported tools include `browser_navigate`, `browser_snapshot`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_scroll`, and `browser_task`.

### Setup

1. Install Python 3.11+ from https://python.org/downloads/.
2. Run `pip install browser-use`.
3. Run `playwright install chromium`.
4. Configure vision model API key for LiteLLM in Settings.
5. Test `browser_navigate` or `browser_snapshot` before `browser_click` or `browser_type`.

All Browser-Use actions appear in Control Center and Audit Logs. 司南 auto-detects Python and browser-use readiness.

## Dry-Run Demo

Dry-run mode simulates tool execution. It is clearly labelled as dry-run and is intended for demos, tests, and first-run validation without external installs.

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
