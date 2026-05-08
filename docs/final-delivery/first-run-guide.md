# First Run Guide

## Default Posture

The first-run default is conservative:

- Embedding is off.
- Advanced risk execution is off.
- Background workflow autorun is off.
- Project indexing starts only after a user adds a project.
- Community workflow sources are not trusted by default.

## Suggested Onboarding Copy

1. Welcome: AionUi is a local development assistant.
2. Permissions: diagnostics, project indexing, command execution, and workflows require user confirmation for risky actions.
3. Data: local experiences, settings, and workflows stay on this machine by default.
4. Security: sensitive files are excluded; high-risk operations require Yes/No confirmation with No as the safe choice.
5. Start mode: chat only, enable companion diagnostics, or add a demo project.

## First Manual Check

Use the Vite demo:

```powershell
cd resources\demos\vite-demo
npm install
npm run dev
```

Ask where the entry file is. The expected answer should cite `package.json` and `src/main.jsx`.
