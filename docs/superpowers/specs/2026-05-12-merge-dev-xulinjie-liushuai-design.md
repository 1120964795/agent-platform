# Merge dev-xulinjie and dev-liushuai Design

Date: 2026-05-12

## Outcome

Create a compatible merged branch based on `g-sleeper/dev`.

`g-sleeper/dev` and `g-sleeper/dev-liushuai` currently have the same tree, so Liu Shuai's code is already the baseline. The merge keeps that product direction: DeepSeek plus Browser Use, with deprecated Qwen and Doubao provider/configuration paths removed from the active app.

The merge selectively ports Xu Linjie's browser-use runtime installer work into the `dev` baseline without reintroducing obsolete model providers or replacing Liu Shuai's UI/configuration direction.

## Scope

Keep from `g-sleeper/dev`:

- DeepSeek + Browser Use configuration model.
- Chat message status UI and copy/metadata behavior.
- Artifacts listing/open/delete flow.
- Document and PowerPoint generation fixes.
- Native `better-sqlite3` rebuild scripts.
- Existing Chinese UI strings and settings/runtime cleanup.

Port from Xu Linjie's development branch (`dev-xulinjie`):

- `electron/services/pythonRuntimeInstaller.js`.
- Python runtime detection updates in `electron/services/pythonBootstrap.js`.
- Real Browser Use repair/install path in `electron/services/browserUse/index.js`.
- Browser Use bridge `PYTHONPATH` and compatible Python spawn handling in `electron/services/bridgeSupervisor.js`.
- `--install-browser-runtime` mode in `electron/main.js`.
- `build/installer.nsh` and `package.json` NSIS include wiring.
- Requirements additions for Playwright and Selenium.
- Relevant tests for the installer, Python bootstrap, bridge supervisor, runtime IPC, and packaging behavior.

## Non-Goals

- Do not restore Qwen or Doubao providers.
- Do not restore Qwen/Doubao settings fields, tests, or docs as active functionality.
- Do not commit generated installer artifacts such as `release/*.exe`.
- Do not replace Liu Shuai's `SettingsPage` or `WelcomeSetupDialog` with Xu Linjie's older setup flow.
- Do not perform unrelated refactors outside the merge surface.

## Chosen Approach

Use a selective transplant instead of a direct Git merge from `dev-xulinjie`.

A direct merge would bring back deleted Qwen/Doubao files and configuration fields, causing conflict with the current `dev` product direction and test expectations. A selective transplant keeps `dev` as the source of truth and adds only the runtime installer capabilities that are compatible with it.

The implementation should be done in small file groups:

1. Add installer infrastructure and package wiring.
2. Update Python detection and Browser Use repair.
3. Update bridge supervisor and app installer mode.
4. Update setup/runtime status to expose Browser Use dependency readiness without Qwen/Doubao fields.
5. Update tests and docs that cover the merged behavior.

## Data Flow

Browser Use runtime readiness flows through these pieces:

1. The app or installer calls `installBrowserRuntime()`.
2. The installer finds Python 3.11+, optionally installs Python on Windows with `winget`, installs requirements into a staged dependency directory, installs Playwright Chromium, validates imports, and atomically publishes the dependency directory.
3. `pythonBootstrap.detect()` checks Python, browser-use, Playwright, Selenium, FastAPI, bundled dependencies, and user-level dependencies.
4. `bridgeSupervisor` starts the Browser Use Python bridge with `PYTHONPATH` including available dependency directories.
5. `runtime:bootstrap` for `browser-use` calls `browserUse.repair()`, which runs the installer and returns installation status.
6. UI setup/runtime status reads the dependency state and shows Browser Use readiness without requiring Qwen/Doubao configuration.

## Failure Cases

- Missing Python 3.11+: installer returns a clear runtime error; setup status marks Python unavailable.
- Package installation failure: staged dependencies are removed and existing dependencies are preserved.
- Playwright install failure: same rollback behavior as package failure.
- Bridge start failure: diagnostics include stderr/stdout log paths and missing Browser Use configuration, if any.
- Legacy config file includes Qwen/Doubao keys: store/config sanitization keeps those deprecated keys out of active config.

## Verification

Run targeted tests first:

- `npm test -- electron/__tests__/python-runtime-installer.test.js`
- `npm test -- electron/__tests__/python-bootstrap.test.js`
- `npm test -- electron/__tests__/bridge-supervisor.test.js`
- `npm test -- electron/__tests__/runtime-ipc.test.js`
- `npm test -- electron/__tests__/packaging.test.js`
- `npm test -- electron/__tests__/store.test.js electron/__tests__/ipc.test.js`
- `npm test -- client/src/components/chat/unified-chat-ui.test.js`

Then run the broader suite if dependency rebuild and local environment allow it:

- `npm test`

Record any environment-related blockers, especially native module rebuild or missing Node/Python dependencies.
