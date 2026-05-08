# Test Report

Last updated: 2026-05-06.

## Automated

Command:

```powershell
npm test
```

Current result:

- 14 test files passed.
- 38 tests passed.

Covered areas:

- Electron IPC registration.
- Config, store, preload, skills, rules, and packaging.
- Local tools and document tools.
- Workflow registry, versioning, runner confirmation flow, temporary steps, package export/preview/import safety.
- `.aionbackup` export, preview, restore, secret exclusion, and path traversal rejection.
- Built-in offline Workflow template source listing.
- Packaged final delivery resources.
- DeepSeek V4 and Qwen provider routing.

## Manual Still Required

- Flask demo walkthrough.
- Vite demo walkthrough with `EADDRINUSE`.
- Java demo walkthrough with Maven/Gradle environment checks.
- Installed NSIS build launch on a clean Windows user profile.
- Live DeepSeek chat and Full Permission tool use.
- `.aionbackup` export and restore from the UI once UI controls are wired.

## Dependency Audit Note

`npm install` currently reports 15 audit findings. They were not auto-fixed in this pass because `npm audit fix --force` can introduce breaking dependency changes. Review before release.
