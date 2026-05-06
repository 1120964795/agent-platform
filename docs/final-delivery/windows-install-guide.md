# Windows Install Guide

## Build

```powershell
npm run setup
npm run electron:build
```

The NSIS installer is written to `dist-electron/`.

## Install

1. Run the generated `.exe`.
2. Choose the installation directory.
3. Keep the desktop and Start Menu shortcuts enabled unless testing a minimal install.
4. Start AgentDev Lite after installation.

## Packaged Resources

The installer must include:

- Renderer bundle: `client/dist`.
- Built-in skills: `skills`.
- Built-in demos: `demos`.
- Built-in workflow templates: `workflow-templates`.
- Final delivery docs: `docs/final-delivery`.

## Signing And Metadata

V4 does not require a code signing certificate. The Windows build sets `win.signAndEditExecutable=false` so unsigned installer builds can run in restricted Windows user profiles that cannot extract electron-builder's winCodeSign symlink payload.

## Clean Machine Smoke Test

1. Launch the installed app.
2. Open Settings and confirm the built-in skills list loads.
3. Confirm the Workflow template list shows Flask, Vite, and Java official templates.
4. Configure a DeepSeek API key only if live chat testing is required.
5. Run a local, low-risk command through a workflow and confirm medium-risk steps pause for approval.
