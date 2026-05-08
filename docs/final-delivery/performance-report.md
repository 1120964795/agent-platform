# Performance Report

Last updated: 2026-05-06.

## Automated Build Measurements

Renderer build command:

```powershell
npm run build:client
```

Observed result during this pass:

- Vite production build completed successfully.
- Bundle output was about 217 kB JavaScript before gzip and 64 kB after gzip.

Test command:

```powershell
npm test
```

Observed result:

- Vitest completed in about 1 second on the development machine.

Windows installer build command:

```powershell
npm run electron:build
```

Observed result:

- NSIS installer build completed successfully.
- Output: `dist-electron\AgentDev Lite Setup 0.1.0.exe`.
- Code signing was skipped because no signing certificate is configured.

## V4 Thresholds To Validate Manually

- App cold start to main UI: no more than 5 seconds.
- Diagnostics panel open: no more than 500 ms.
- Workflow Runner start: no more than 1 second.
- `start_service` first visible output: no more than 1 second.
- Template source list refresh: no more than 3 seconds.
- `.aionbackup` 10 MB preview: no more than 3 seconds.

## Stability Expectations

- OCR/UIA failures must not block the UI.
- Template source failures must preserve the last usable local state.
- Workflow step failures must not crash the runner.
- Service processes must be visible and stoppable.
