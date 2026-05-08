# AionUi V2 Security Policy

## Execution Invariant

Model output is never executed directly.

The required path is:

```text
Qwen planner -> actionPlanner -> actionPolicy -> actionBroker -> approved adapter -> auditLog -> runOutputs
```

Any runtime adapter that is not called by the broker is outside the supported product path.

## Model Roles

- Qwen is required for task planning, action intent, and coding reasoning.
- DeepSeek is allowed only as a plain-chat fallback.
- Dry-run mode can simulate planning and execution for demos when Qwen or external runtimes are unavailable.

## Risk Levels

- Low: observation and non-mutating reads.
- Medium: bounded command, file, and code work.
- High: install, delete, overwrite, GUI input, submit, and sensitive local changes.
- Blocked: credential exfiltration, disk formatting, hidden background execution, disabling security tooling, and unbounded recursive delete.

High-risk actions always require explicit confirmation. Blocked actions never reach runtime adapters.

## Runtime Boundaries

Open Interpreter:

- External runtime only.
- AGPL source is not vendored in this repository.
- Executes only broker-approved command, file, code, or setup protocol requests.

UI-TARS:

- External Desktop, SDK, fork, or adapter service.
- Mouse and keyboard actions require active screen authorization.
- Visual/input requests stay behind `sourceBridge`.

## Audit And Export

Audit events are append-only JSONL. Events are sanitized before storage and export. Secrets are masked in command strings, environment variables, headers, URLs, logs, file snippets, and explicit credential fields.

## Emergency Stop

Emergency stop cancels queued actions, aborts broker controllers where possible, and notifies registered adapters.
