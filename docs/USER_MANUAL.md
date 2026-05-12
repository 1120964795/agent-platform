# AionUi User Manual

This manual covers the reconciled AionUi desktop app: chat, Browser Use automation, Desktop Use automation, confirmations, runtime setup, generated artifacts, and dry-run demos.

## What AionUi Does

AionUi is the visible control plane for agentic desktop work. DeepSeek plans text work and proposes tool calls. AionUi validates those tool calls, applies safety policy, asks for confirmation when risk is medium or high, dispatches approved work to managed runtimes, and records the timeline.

Default capabilities:

- DeepSeek: chat, planning, intent classification, and coding reasoning.
- Browser Use: browser automation through the supervised Browser Use bridge.
- Desktop Use: real desktop observation and input through the supervised desktop-use bridge.
- Artifacts: generated Word, PowerPoint, and file outputs.
- Dry-run: deterministic demo runtime when external runtime configuration is missing.

## First-Time Setup

1. Install Python 3.11+ for Browser Use dependency setup.
2. Open Settings.
3. Add a DeepSeek API key.
4. Add Browser Use API key, endpoint, and model.
5. Add Desktop Use API key, endpoint, and model, or keep Browser Use fallback enabled.
6. Open Settings -> Runtime and verify Browser Use and Desktop Use bridge status.
7. Keep dry-run enabled while validating setup.

## Chat And Automation

Use the main chat surface for normal assistant replies and tool-assisted tasks. Browser Use and Desktop Use can be selected through the plugin controls. Risky actions pause for confirmation before execution.

When Desktop Use needs help, it can ask a question in chat. Reply in the chat input to let the desktop task resume.

## Runtime Diagnostics

Open Settings -> Runtime to inspect Browser Use and Desktop Use bridge state. Failed bridges show last error, log paths, and next steps when available. Use restart controls after changing configuration.

## Artifacts

Open Settings -> Artifacts to view generated Word, PowerPoint, and file outputs. The list supports refresh, open, and delete. New generated artifacts refresh the list automatically while the app is open.

Word and PowerPoint outputs are registered with artifact metadata so the UI can list them consistently.

## Safety

Risk levels:

- Low: observation and non-mutating reads.
- Medium: bounded actions that may change local state.
- High: installs, deletes, overwrites, GUI input, submissions, and sensitive system changes.
- Blocked: credential exfiltration, disk formatting, hidden background execution, disabling security tooling, and unbounded recursive delete.

High-risk actions always require confirmation. Blocked actions never run.

## Dry-Run Demo

Dry-run mode simulates tool execution. It is intended for demos, tests, and first-run validation without external runtime configuration.

Try:

```text
Inspect a fake screen, propose the next click, create a fake output summary, and show the artifact list.
```

## Developer Commands

```powershell
npm run setup
npm test
npm run build:client
npm run electron:build
```

## More Documentation

- Runtime setup: `docs/runtime-setup.md`
- Developer guide: `docs/developer-guide.md`
- Security policy: `docs/security-policy.md`
- Dry-run demo: `docs/demo-script.md`
- Release checklist: `docs/release-checklist.md`
- Test report: `docs/test-report.md`
