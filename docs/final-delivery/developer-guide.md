# Developer Guide

## Architecture

The current app is Electron-first. The React renderer talks to the main process through `window.electronAPI.invoke/on`; the legacy `server/` folder is not part of the active desktop runtime.

Important paths:

- `electron/ipc/`: IPC channel registration.
- `electron/tools/`: local tool schemas and handlers.
- `electron/skills/`: Markdown skill registry.
- `electron/workflows/`: Workflow Skill registry, versions, runner, template sources, and package handling.
- `electron/backup/`: `.aionbackup` export, preview, and restore.
- `client/src/`: renderer UI.
- `resources/`: packaged built-in skills, demos, and workflow templates.

## Adding IPC

1. Create a module under `electron/ipc/`.
2. Export `register(ipcMain, deps)`.
3. Add the module to `electron/ipc/index.js`.
4. Add a focused Vitest test.
5. Add renderer API helpers in `client/src/lib/api.js` only when the UI needs the channel.

## Workflow Rules

- Every executable workflow step must have a risk level.
- `confirm_command`, `apply_patch`, and `start_service` require confirmation by default.
- Template packages are previewed in isolation before import.
- Official templates require a present signature marker; community templates require strong confirmation.

## Backup Rules

- Do not add source files, database files, binary files, keys, or raw logs to `.aionbackup`.
- Always preview before restore.
- Restore merges by default.
- Same workflow ID conflicts create a restored copy.
