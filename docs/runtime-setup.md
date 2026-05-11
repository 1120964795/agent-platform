# AionUi Runtime Setup

## DeepSeek

DeepSeek-V4 is the primary text model for chat, planning, intent classification, and coding reasoning.

Configure:

- DeepSeek API key.
- Base URL, default `https://api.deepseek.com`.
- Chat model, default `deepseek-chat`.
- Coding model, default `deepseek-coder`.

## Open Interpreter

Open Interpreter is external. Do not copy its AGPL source into this repository. AionUi launches the managed sidecar on `127.0.0.1:8756`.

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

UI-TARS is the desktop screen-control runtime. AionUi launches `server/uitars-bridge` on `127.0.0.1:8765`.

Recommended setup:

1. Enable screen authorization only for safe visible screens.
2. Test observe, click proposal, keyboard proposal, and emergency stop.
3. Keep desktop input behind AionUi policy and confirmation prompts.

Endpoint contract:

```text
POST /execute
```

Body protocol: `aionui.ui-tars.v1`.

## Browser Automation (browser-use)

Browser-use is a Python-based browser automation runtime. AionUi launches `server/browser-use-bridge` on `127.0.0.1:8780`.

### Prerequisites

1. Install Python 3.11+ from https://python.org/downloads/
2. Ensure Python is on PATH (verify with `python --version`)
3. Install browser-use: `pip install browser-use`
4. Install Playwright browsers: `playwright install chromium`
5. Configure Browser Use API key, endpoint, and model in Settings

### Recommended setup

1. Verify Python 3.11+: `python --version`
2. Install browser-use: `pip install browser-use`
3. Install browsers: `playwright install chromium`
4. Run Models/Runtimes health check. AionUi auto-detects Python and browser-use readiness.
5. Test with a simple browser task before using richer automation.

### Detection

AionUi automatically detects:

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
