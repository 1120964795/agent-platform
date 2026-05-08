# AionUi V2 Test Report

Date: 2026-05-08

## Automated Verification

```text
npm test
```

Result: passed.

```text
npm run build:client
```

Result: passed.

```text
npm run electron:build
```

Result: passed. Output included `dist-electron\AionUi Setup 0.1.0.exe`.

```text
dist-electron\win-unpacked\AionUi.exe
```

Result: launch smoke passed. The packaged app process started and stayed alive for the smoke window, then was closed.

## Notes

- Initial dependency setup required using a reachable Electron mirror because the default Electron binary download failed behind TLS/proxy behavior.
- Open Interpreter and UI-TARS real external runtimes are documented and adapter-tested at the protocol boundary.
- Dry-run mode is available for complete demo flow without external runtime installs.

## Pending Release-Machine Verification

Manual in-app smoke test still recommended on the release machine:

- Normal chat.
- Dry-run Execute mode.
- Control Center approve/deny.
- Logs export.
- Outputs panel.
- Runtime setup cards.
- Emergency stop.
