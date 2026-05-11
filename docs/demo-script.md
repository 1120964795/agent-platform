# AionUi V2 Dry-Run Demo Script

Use this script to demonstrate the full product without Open Interpreter or UI-TARS installed.

## Setup

1. Start AionUi.
2. Open Settings.
3. Configure DeepSeek if you want live text reasoning, or keep dry-run enabled for a local-only demo.
4. Open Models/Runtimes and confirm `aionui-dry-run` is ready.
5. Use the chat input for the demo prompt.

## Demo Prompt

```text
Inspect a fake screen, propose a click, run a fake npm test command, write a fake output summary, and export the logs.
```

## Expected Flow

1. The chat shows a dry-run action plan.
2. Medium and high risk dry-run actions wait for approval.
3. Approving actions records audit events.
4. Run Outputs shows dry-run command/file/screen output metadata.
5. Logs can be filtered and exported.
6. Emergency stop cancels any queued dry-run actions.
