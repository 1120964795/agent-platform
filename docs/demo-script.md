# AionUi V2 Dry-Run Demo Script

Use this script to demonstrate the full product without Qwen, Open Interpreter, or UI-TARS installed.

## Setup

1. Start AionUi.
2. Open Settings.
3. Leave Qwen API key empty.
4. Enable dry-run mode.
5. Open Models/Runtimes and confirm `aionui-dry-run` is ready.
6. Switch the chat input to Execute mode.

## Demo Prompt

```text
Inspect a fake screen, propose a click, run a fake npm test command, write a fake output summary, and export the logs.
```

## Expected Flow

1. The chat shows a dry-run action plan.
2. Control Center shows proposed actions.
3. Medium and high risk dry-run actions wait for approval.
4. Approving actions records audit events.
5. Run Outputs shows dry-run command/file/screen output metadata.
6. Logs can be filtered and exported.
7. Emergency stop cancels any queued dry-run actions.

## Qwen Configured Variant

When Qwen is configured, keep Open Interpreter and UI-TARS unconfigured, leave dry-run enabled, and ask for the same demo. Qwen can plan the task, while dry-run adapters keep execution safe and local.
