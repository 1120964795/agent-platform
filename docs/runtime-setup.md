# AionUi Runtime Setup

## Qwen

Use Alibaba Cloud Model Studio or DashScope OpenAI-compatible mode.

Default China Beijing base URL:

```text
https://dashscope.aliyuncs.com/compatible-mode/v1
```

Configure:

- Qwen API key.
- Primary model, for example `qwen-max-latest`.
- Coding model, for example `qwen3-coder-plus`.

Qwen is required for task planning, action intent, and coding reasoning.

## DeepSeek

DeepSeek is optional and plain-chat-only.

Configure:

- DeepSeek API key.
- Base URL, default `https://api.deepseek.com`.
- Fallback model, default `deepseek-chat`.

## Open Interpreter

Open Interpreter is external. Do not copy its AGPL source into this repository.

Recommended setup:

1. Install Open Interpreter outside the repo.
2. Start a sidecar that accepts AionUi protocol requests.
3. Configure endpoint, for example `http://127.0.0.1:8756`.
4. Run Models/Runtimes health check.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.open-interpreter.v1`.

## UI-TARS

UI-TARS is external and Apache-2.0. Configure UI-TARS Desktop, SDK, fork, or adapter service.

Recommended setup:

1. Start an adapter endpoint, for example `http://127.0.0.1:8765`.
2. Configure the endpoint in Settings.
3. Enable screen authorization only for safe visible screens.
4. Test observe, click proposal, keyboard proposal, and emergency stop.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.ui-tars.v1`.

## Dry-Run

Dry-run is enabled by default. It simulates model planning, command/file/code execution, screen observation, mouse, keyboard, outputs, and logs.
