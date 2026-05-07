# AionUi V4 Final Delivery

This folder is the final delivery pack for the V4收口版本. It records what is included, how to install and verify it, and which items are intentionally out of scope.

## Included

- Electron desktop app with React renderer.
- Controlled local tool execution through Full Permission mode.
- Built-in skills and user skill management.
- Workflow Skill registry, version history, runner, `start_service`, template source listing, and `.aionworkflow` export/import preview.
- `.aionbackup` export, preview, and merge restore in the Electron main process.
- Built-in Flask, Vite, and Java demo projects under `resources/demos/`.
- Built-in official Workflow template manifest under `resources/workflow-templates/`.
- Windows NSIS packaging through `npm run electron:build`.

## Verification Gates

Run these before delivery:

```powershell
npm test
npm run build:client
npm run electron:build
```

Manual acceptance is tracked in [release-checklist.md](release-checklist.md).

## Delivery Boundaries

V4 is a Windows-only local delivery. It does not include cloud sync, account login, online marketplace publishing, automatic updates, code signing certificates, mobile support, macOS/Linux support, or autonomous multi-agent coding.
