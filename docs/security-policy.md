# 司南 V2 Security Policy

## Execution Invariant

Model output is never executed directly.

The required path is:

```text
模型提议 → agentLoop 接收工具调用 → toolPolicy 评估风险 → 用户确认(中/高风险) → 工具执行 → 审计日志记录
```

Any tool handler that is not registered through the tool registry and evaluated by toolPolicy is outside the supported product path.

## Model Roles

- DeepSeek-V4 is required for chat, planning, intent classification, and coding reasoning.
- Doubao 1.5 vision is restricted to desktop screen control through UI-TARS on Volcengine Ark.
- Browser automation uses Python browser-use (port 8780) with vision model configurable at runtime.
- Dry-run mode can simulate tool execution for demos when external runtimes are unavailable.

## Risk Levels

- Low: observation and non-mutating reads.
- Medium: bounded command, file, and code work.
- High: install, delete, overwrite, GUI input, submit, and sensitive local changes.
- Blocked: credential exfiltration, disk formatting, hidden background execution, disabling security tooling, and unbounded recursive delete.

High-risk actions always require explicit confirmation. Blocked actions never reach tool handlers.

## Tool Risk Classification

- `desktop_observe`: low.
- `desktop_click`: high.
- `desktop_type`: medium.
- `browser_navigate`, `browser_snapshot`, `browser_screenshot`: low.
- `browser_click`, `browser_type`, `browser_scroll`: medium.
- `browser_task`: high.

All tool calls go through agentLoop, toolPolicy evaluation, and audit logging. The model never auto-runs tools without policy evaluation.

## Runtime Boundaries

Open Interpreter:

- External runtime only.
- AGPL source is not vendored in this repository.
- Executes only policy-approved command, file, code, or setup protocol requests.

UI-TARS:

- Managed `server/uitars-bridge` sidecar on `127.0.0.1:8765`.
- Uses Doubao vision on Volcengine Ark.
- Mouse and keyboard actions require active screen authorization.
- Visual/input requests stay behind the desktop adapter.

Browser-Use:

- Managed `server/browser-use-bridge` sidecar on `127.0.0.1:8780`.
- Python-based, requires Python 3.11+ and `browser-use` package.
- Browser actions use configurable vision model through LiteLLM.

## Audit And Export

Audit events are append-only JSONL. Events are sanitized before storage and export. Secrets are masked in command strings, environment variables, headers, URLs, logs, file snippets, and explicit credential fields.

## Emergency Stop

Emergency stop cancels queued actions, aborts active tool executions where possible, and notifies registered bridges.
