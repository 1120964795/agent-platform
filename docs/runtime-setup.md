# AionUi Runtime Setup

## DeepSeek

DeepSeek is the primary text model for chat, planning, intent classification, and coding reasoning.

Configure:

- DeepSeek API key.
- Endpoint, default `https://api.deepseek.com`.
- Planner model, default `deepseek-chat`.
- Coding model, default `deepseek-coder`.

## Browser Use Runtime

The Windows installer runs Browser Use dependency setup after install. Users can also run repair from Settings. The setup installs Python packages from `server/browser-use-bridge/requirements.txt` into the app-managed dependency directory and installs Playwright Chromium.

AionUi launches `server/browser-use-bridge` as a supervised bridge.

Configure:

- `browserUseApiKey`
- `browserUseEndpoint`, default `https://zenmux.ai/api/v1`
- `browserUseModel`, default `openai/gpt-5.5`
- Browser visibility and vision options from Settings

Detection covers:

- Compatible Python version.
- User app-data dependency directory.
- `browser_use`, `playwright`, `selenium`, and `fastapi` imports.
- Playwright browser readiness.

## Desktop Use Runtime

Desktop Use is supervised as `server/desktop-use-bridge` on port 8790. Configure `desktopUseApiKey`, `desktopUseEndpoint`, and `desktopUseModel`, or enable fallback to Browser Use settings.

Configure:

- `desktopUseApiKey`
- `desktopUseEndpoint`, default `https://zenmux.ai/api/v1`
- `desktopUseModel`, default `openai/gpt-5.5`
- `desktopUseGroundingBackend`
- `desktopUseAllowBrowserFallback`

Desktop Use can pause with `ask_user` when login, permission, ambiguity, or low confidence blocks safe execution. AionUi routes that question back into the chat input.

## Dry-Run

Dry-run is enabled by default. It simulates tool execution for demos when external runtimes are unavailable.

## Windows Scheduled Tasks

Scheduled tasks use Windows Task Scheduler entries named under `\AionUi\ScheduledTasks\`. The entry launches AionUi with `--run-scheduled-task <task-id>` and stores no API keys or secrets.

In development, Windows tasks launch Electron with the project root path before `--run-scheduled-task <task-id>`. In packaged builds, they launch `AionUi.exe` directly. This avoids Electron treating the task id as the app path when Task Scheduler starts from `C:\Windows\System32`.

If registration fails, open Settings -> Scheduled Tasks and use the task status to retry, pause, delete, or inspect the error. Scheduled task runs still use AionUi policy checks: full-trust preauthorization bypasses repeated high-risk prompts, while blocked operations remain blocked.

## Troubleshooting

- Browser Use repair fails: open Settings -> Runtime and run repair again after confirming Python 3.11+ is installed.
- Browser Use bridge fails: check bridge diagnostics in Settings -> Runtime.
- Desktop Use bridge fails: check Settings -> Runtime diagnostics, then restart the bridge.
- Automation pauses for user input: answer the prompt in chat and let the bridge resume.
