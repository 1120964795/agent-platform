# AionUi Dry-Run Demo Script

Use this script to demonstrate the reconciled product without live Browser Use or Desktop Use credentials.

## Setup

1. Start AionUi.
2. Open Settings.
3. Add a DeepSeek key if live chat is needed, or keep dry-run for a local demo.
4. Leave Browser Use and Desktop Use credentials empty when demonstrating offline behavior.
5. Confirm dry-run is ready in Settings -> Runtime.
6. Open Settings -> Artifacts so the generated output list is visible after the demo.

## Demo Prompt

```text
Inspect a fake screen, propose a safe next action, create a short Word-style output summary, and register it as an artifact.
```

## Expected Flow

1. The chat shows an action plan or dry-run summary.
2. Risky actions wait for confirmation.
3. Approving actions records audit events.
4. Generated files appear in Settings -> Artifacts.
5. Artifacts can be opened, refreshed, or deleted.
6. Emergency stop cancels queued automation.

## Live Automation Variant

When Browser Use and Desktop Use credentials are configured, repeat the demo with one browser task and one desktop observation. Keep the task bounded and visible, and verify that any high-risk GUI input still requires confirmation.
