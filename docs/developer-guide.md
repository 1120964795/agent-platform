# AionUi V2 Developer Guide

## Local Setup

```powershell
npm run setup
npm test
npm run build:client
npm run electron:dev
```

## Main Process Modules

- `electron/services/models/*`: Qwen, DeepSeek fallback, model roles, and routing.
- `electron/services/actionPlanner.js`: validates structured Qwen proposals.
- `electron/security/actionPolicy.js`: pure risk classification and blocking.
- `electron/security/actionBroker.js`: queue, approvals, adapter dispatch, cancellation, emergency stop.
- `electron/security/auditLog.js`: sanitized JSONL audit events.
- `electron/services/openInterpreter/*`: external Open Interpreter runtime boundary.
- `electron/services/uiTars/*`: external UI-TARS bridge boundary.
- `electron/services/dryRunRuntime.js`: deterministic demo runtime.
- `electron/services/taskOrchestrator.js`: Execute mode orchestration.
- `electron/services/runOutputs.js`: run output index.

## IPC

Renderer access goes through preload and IPC modules:

- Runtime: `runtime:status`, `runtime:configure`, `runtime:bootstrap`, `runtime:start`, `runtime:stop`.
- Actions: `actions:list`, `actions:approve`, `actions:deny`, `actions:cancel`, `actions:emergencyStop`.
- Audit: `audit:list`, `audit:export`.
- Outputs: `outputs:list`, `outputs:open`, `outputs:export`.

Expected IPC failures return `{ ok: false, error }`.

## Adding Action Types

1. Add the type to `electron/security/actionTypes.js`.
2. Add validation support in `actionPlanner`.
3. Add risk behavior in `actionPolicy`.
4. Add adapter support or explicitly reject it.
5. Add broker, adapter, IPC, and UI tests as needed.

## Verification

```powershell
npm test
npm run build:client
npm run electron:build
```
