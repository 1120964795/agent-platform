# Main and Merge Dev Reconciliation Design

Date: 2026-05-12

## Outcome

Create a compatible merged version of `g-sleeper/main` and
`g-sleeper/merge-dev-xulinjie-liushuai` by selecting the stronger behavior from
each branch module by module.

This is not a branch-priority merge. The final product keeps the broad
Desktop/Computer Use capability from `main`, the Browser Use runtime installer
and artifact improvements from `merge-dev-xulinjie-liushuai`, and the agreed
DeepSeek-only product direction.

The two branches do not share a merge base, so a direct Git merge with
`--allow-unrelated-histories` creates broad add/add conflicts across most core
files. The implementation should be a controlled module-level reconciliation,
not a direct conflict-resolution pass.

## Decisions

### Model and Provider Direction

Use DeepSeek as the only active chat, planning, and coding model provider.

Keep Browser Use as the browser automation provider. Do not restore Qwen or
Doubao as active providers, model-selector options, setup-status entries,
runtime-status entries, settings fields, or Welcome wizard fields.

If existing user config contains Qwen or Doubao keys, the merged app should
ignore or strip those deprecated fields without breaking startup.

### Browser Use Runtime

Fully keep the Browser Use runtime installer work from
`merge-dev-xulinjie-liushuai`.

The merged app should include:

- `electron/services/pythonRuntimeInstaller.js`.
- Installer and repair flow for browser-use, Playwright, Selenium, FastAPI, and
  bridge dependencies.
- `pythonBootstrap` detection for Python, Browser Use, Playwright, Selenium,
  bundled dependency paths, and user dependency paths.
- `runtime:bootstrap` support for `browser-use`.
- Browser Use bridge startup with the correct `PYTHONPATH`.
- NSIS post-install hook through `--install-browser-runtime`.
- Settings/Welcome visibility for Browser Use dependency readiness and repair.

### Desktop and Computer Use

Fully keep the Desktop/Computer Use capability from `main`.

The merged app should retain:

- `server/desktop-use-bridge`.
- Desktop plugin mode.
- `desktop_task`.
- `desktop_hotkey`, `desktop_scroll`, and `desktop_wait`.
- Existing observe/click/type desktop tools.
- Cursor overlay.
- Live desktop events.
- `ask_user` pause/resume flow.
- Desktop bridge packaging and tests.

The required adaptation is to remove Qwen/Doubao assumptions. Desktop Use should
use `desktopUse*` configuration and may fall back to Browser Use/ZenMux
configuration when that fallback is enabled.

### Chat Surface

Use the teammate branch chat UI as the visual and interaction base, because it
has the desired Chinese localization and message-status polish.

Integrate back the required behavior from `main`:

- plugin mode for browser and desktop use;
- chat-first confirmations;
- approval lifecycle;
- live progress events;
- abort/cancel behavior;
- desktop event rendering;
- `ask_user` responses.

The result should not sacrifice Desktop/Computer Use behavior for UI polish.

### Settings and Welcome

Use the broader Settings/Welcome structure from `main`, because it is already
organized around multiple runtimes and diagnostics.

Apply these changes:

- Remove Qwen and Doubao from active Settings and Welcome UI.
- Keep DeepSeek, Browser Use, Desktop Use, runtime status, diagnostics, safety,
  and about sections.
- Integrate teammate branch Chinese copy where it matches the final product
  direction.
- Integrate Browser Use install/repair readiness.
- Keep the teammate branch Artifacts tab as a first-class Settings tab.

The Artifacts tab must support listing, opening, refreshing, deleting, and
auto-refreshing after new artifact creation.

### Artifacts and Office Generation

Fully keep teammate branch artifact management:

- `artifacts:delete` IPC.
- `deleteArtifact()` frontend API.
- `deletedArtifacts` store state.
- restore-on-list behavior when a previously deleted artifact can be restored.
- Settings Artifacts tab.
- generated Word template resources.
- document and PowerPoint generation fixes.

Add an internal Office Artifact Skill Layer. This should not be a dynamic
external skill runner. Instead, internalize the useful workflow patterns from
mature DOCX/PPTX skills:

- classify the artifact type before generation;
- build a structured outline before writing files;
- choose style/template packs deliberately;
- improve heading hierarchy, tables, spacing, and metadata for DOCX;
- improve narrative, slide density, editable charts/tables, and visual QA for
  PPTX;
- add preview/render QA when the local environment supports it;
- register generated Word/PPT outputs into the same artifact list used by the
  Settings Artifacts tab.

### Packaging and Tests

Merge packaging capabilities from both branches:

- keep `desktop-use-bridge` as a workspace and packaged resource;
- keep Browser Use installer and NSIS hook;
- keep native `better-sqlite3` rebuild scripts;
- keep Browser Use requirements with Playwright and Selenium;
- avoid build-time Python dependency installation in `prepare-bridges.js`;
- do not commit generated installer artifacts.

### Documentation

Keep valuable planning and design documents from both branches.

Update the authoritative user/developer docs to match the merged product:

- `README.md`;
- `docs/USER_MANUAL.md`;
- `docs/runtime-setup.md`;
- `docs/demo-script.md`;
- `docs/test-report.md`;
- any release or developer docs touched by the final behavior.

## Architecture

Use `g-sleeper/main` as the integration base because its Desktop/Computer Use
chain has the deepest file graph and would be higher risk to reattach from the
teammate branch.

Transplant teammate branch behavior by module:

1. Remove Qwen/Doubao active source from the integration base.
2. Add Browser Use runtime installer and wire it into startup, runtime IPC,
   setup status, and packaging.
3. Preserve and adapt Desktop/Computer Use around DeepSeek plus Browser
   Use/ZenMux-compatible configuration.
4. Merge chat UI with behavior-preserving tests around plugin mode,
   confirmations, progress, cancel, and ask-user.
5. Merge Settings/Welcome with Artifacts tab, Browser Use installer status, and
   Desktop Use diagnostics.
6. Merge artifact deletion/restoration and Office generation improvements.
7. Update docs and tests.

## Data Flow

### Browser Use Runtime

Installer or Settings repair calls `installBrowserRuntime()`. The installer
finds a compatible Python, installs Browser Use dependencies into a staged
dependency directory, installs Playwright Chromium, validates imports, and then
publishes dependencies atomically.

`pythonBootstrap.detect()` reports Python and dependency readiness.
`bridgeSupervisor` starts `server/browser-use-bridge` with user and bundled
dependency paths on `PYTHONPATH`.

### Desktop and Computer Use

The renderer selects desktop plugin mode. Chat sends the user goal through the
agent loop. Electron tools call `server/desktop-use-bridge`. The bridge runs
desktop actions, streams events, pauses for `ask_user` when needed, and emits
cursor events. Electron forwards cursor events to the overlay and streams task
status back into the chat UI.

### Artifacts and Office Generation

Office generation produces Word/PPT files through the improved Office Artifact
Layer. The artifact is stored through the same store path used by existing
artifacts. The renderer dispatches or receives artifact-created events so the
Settings Artifacts tab refreshes without manual reload.

Deleting an artifact removes it from active artifacts and records it in
`deletedArtifacts`. Listing artifacts can restore records when the deleted item
was moved to system trash and the file still exists.

### Configuration

`store.getConfig()` returns DeepSeek, Browser Use, Desktop Use, runtime, safety,
and workspace configuration. Deprecated Qwen/Doubao config keys are ignored or
removed. `getMaskedConfig()` masks only active secret fields.

## Conflict Resolution Rules

- `client/src/pages/SettingsPage.jsx`: keep the broader `main` structure, add
  teammate Artifacts tab, remove Qwen/Doubao, localize active sections, and show
  Browser Use install status.
- `client/src/components/chat/*` and `client/src/hooks/useChat.js`: use teammate
  UI as the visual base, then preserve `main` plugin mode, confirmations, live
  progress, cancel, desktop events, and ask-user behavior.
- `electron/store.js`: combine teammate artifact deletion/restoration and
  deprecated provider cleanup with `main` Desktop Use config.
- `electron/services/bridgeSupervisor.js`: keep `main` Browser Use plus Desktop
  Use supervision and add teammate Browser Use Python dependency environment.
- `electron/ipc/setupStatus.js` and `electron/ipc/runtime.js`: remove Qwen/Doubao
  active entries, add Browser Use installer readiness, keep Desktop Use status.
- `package.json` and `scripts/prepare-bridges.js`: keep desktop-use packaging and
  add Browser Use installer behavior without build-time Python dependency
  installation.
- Tests should be merged by behavior rather than branch ownership.

## Verification

Run verification in layers.

### Provider Cleanup

Search active source for Qwen/Doubao provider references. Active source should
not require `qwenProvider`, require `doubao`, expose Qwen/Doubao settings, or
show Qwen/Doubao runtime status. Tests may keep legacy cleanup assertions.

### Browser Use Installer

Run targeted tests:

- `npm test -- electron/__tests__/python-runtime-installer.test.js`
- `npm test -- electron/__tests__/python-bootstrap.test.js`
- `npm test -- electron/__tests__/runtime-ipc.test.js`
- `npm test -- electron/__tests__/setup-status-ipc.test.js`
- `npm test -- electron/__tests__/bridge-supervisor.test.js`
- `npm test -- electron/__tests__/packaging.test.js`

### Desktop and Computer Use

Run targeted tests:

- `npm test -- electron/__tests__/desktop-adapter.test.js`
- `npm test -- electron/__tests__/desktop-tools.test.js`
- `npm test -- electron/__tests__/desktop-cursor-overlay.test.js`
- `npm test -- electron/__tests__/agent-loop.test.js`
- `npm test -- electron/__tests__/chat.test.js`
- `npm test -- server/desktop-use-bridge/__tests__/translator.test.js`
- `npm test -- server/desktop-use-bridge/__tests__/driver.test.js`
- `npm test -- server/desktop-use-bridge/__tests__/planner.test.js`
- `npm test -- server/desktop-use-bridge/__tests__/agentRunner.test.js`
- `npm test -- server/desktop-use-bridge/__tests__/execute.test.js`

### Chat, Settings, and Artifacts

Run targeted tests:

- `npm test -- client/src/components/chat/unified-chat-ui.test.js`
- `npm test -- client/src/lib/api.test.js`
- `npm test -- electron/__tests__/ipc.test.js`
- `npm test -- electron/__tests__/store.test.js`

Verify the Settings Artifacts tab lists, opens, refreshes, deletes, and
auto-refreshes artifacts.

### Office Artifact Layer

Run Word/PPT generation tests and at least one Word and one PowerPoint sample
generation path. Confirm generated files are registered in artifacts.

When local render tooling exists, render previews for DOCX/PPTX samples and
inspect them for layout issues. If render tooling is not available, record the
environment limitation and do not claim visual QA passed.

### Whole Project

Run:

- `npm test`
- `npm run build:client`
- `npm run electron:build` when local native and Electron dependencies allow it.

Record any environment-related blocker with the exact command, exit code, and
first actionable error.

## Failure Cases

- Browser Use installer fails: preserve existing dependency directory, surface
  repair failure in Settings/runtime diagnostics, and avoid publishing partial
  dependencies.
- Python is missing or too old: setup status marks Browser Use dependency
  readiness false and provides repair guidance.
- Desktop bridge missing config: diagnostics name `desktopUse*` or fallback
  Browser Use fields, not Qwen/Doubao fields.
- Chat UI merge loses behavior: plugin mode, approval lifecycle, live progress,
  abort, cursor overlay, and ask-user tests should catch it.
- Artifact deletion fails at filesystem level: keep store state consistent and
  return a warning instead of silently dropping the artifact record.
- DOCX/PPTX render QA is unavailable: generation can still proceed, but the app
  and docs should not claim visual QA passed.

## Non-Goals

- Do not restore Qwen or Doubao as active providers.
- Do not implement a dynamic external skill runner for Office artifacts in this
  merge.
- Do not vendor third-party agent skill packages into the Electron app.
- Do not submit generated installers or `dist-electron` outputs.
- Do not rewrite unrelated UI or runtime areas outside the reconciliation scope.

