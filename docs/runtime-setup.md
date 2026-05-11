# 司南 Runtime Setup

## DeepSeek

DeepSeek-V4 is the primary text model for chat, planning, intent classification, and coding reasoning.

Configure:

- DeepSeek API key.
- Base URL, default `https://api.platform.deepseek.com`.
- Chat model, default `deepseek-chat`.
- Coding model, default `deepseek-coder`.

## Doubao Vision

Doubao 1.5 vision is consumed by `server/uitars-bridge` for desktop screen control through UI-TARS.

Default Volcengine Ark endpoint:

```text
https://ark.cn-beijing.volces.com/api/v3
```

Configure:

- Doubao vision API key in `doubaoVisionApiKey`.
- Doubao model, default `doubao-1-5-thinking-vision-pro-250428`.
- Screen authorization in 司南 before real desktop input.

## Open Interpreter

Open Interpreter is external. Do not copy its AGPL source into this repository. 司南 launches the managed `server/oi-bridge` sidecar on `127.0.0.1:8756`.

Recommended setup:

1. Install Open Interpreter outside the repo.
2. Confirm Python can run `interpreter`.
3. Run Models/Runtimes health check.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.open-interpreter.v1`.

## UI-TARS

UI-TARS is the desktop screen-control runtime. 司南 launches `server/uitars-bridge` on `127.0.0.1:8765` and injects Doubao Volcengine Ark settings.

Recommended setup:

1. Configure `doubaoVisionApiKey`.
2. Keep `doubaoVisionEndpoint` at the default unless your Ark deployment differs.
3. Enable screen authorization only for safe visible screens.
4. Test observe, click proposal, keyboard proposal, and emergency stop.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.ui-tars.v1`.

## Browser Automation (browser-use)

Browser-use is a Python-based browser automation runtime. 司南 launches `server/browser-use-bridge` on `127.0.0.1:8780`.

### Prerequisites

1. Install Python 3.11+ from https://python.org/downloads/
2. Ensure Python is on PATH (verify with `python --version`)
3. Install browser-use: `pip install browser-use`
4. Install Playwright browsers: `playwright install chromium`
5. (Optional) Install uv for faster package management: `pip install uv`

### Recommended setup

1. Verify Python 3.11+: `python --version`
2. Install browser-use: `pip install browser-use`
3. Install browsers: `playwright install chromium`
4. Configure vision model API key for LiteLLM (browser-use uses this internally)
5. Run Models/Runtimes health check — 司南 auto-detects Python and browser-use readiness
6. Test with a simple `browser_navigate` or `browser_snapshot` before using `browser_task`

### Detection

司南 automatically detects:
- Python 3.11+ installation and path
- uv availability (optional acceleration)
- browser-use package installation
- Playwright chromium browser installation

Setup guidance appears in Models/Runtimes when components are missing.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.browser-use.v1`.

## Dry-Run

Dry-run is enabled by default. It simulates tool execution for demos when external runtimes are unavailable.
