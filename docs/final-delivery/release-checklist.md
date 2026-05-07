# Release Checklist

## Automated

- [ ] `npm test`
- [ ] `npm run build:client`
- [ ] `npm run electron:build`
- [ ] Workflow security tests pass.
- [ ] Backup/restore security tests pass.

## Manual Demos

- [ ] Flask demo: project Q&A, `ModuleNotFoundError`, confirmed dependency install, `start_service`.
- [ ] Vite demo: entry-file Q&A, `npm run dev`, `EADDRINUSE`, temporary step suggestion.
- [ ] Java demo: Java/Javac/Maven/Gradle checks and build failure diagnosis.
- [ ] Workflow Runner: pause, confirm, terminate, and run record visibility.
- [ ] `.aionworkflow` export and preview.
- [ ] `.aionbackup` export, preview, and merge restore.
- [ ] Template import safety preview.

## Installer

- [ ] Fresh Windows install starts successfully.
- [ ] Built-in skills are visible.
- [ ] Built-in workflow templates are visible.
- [ ] Demo projects are present in packaged resources.
- [ ] Final delivery docs are present in packaged resources.

## Documentation

- [ ] README and user manual include final non-goals.
- [ ] Security policy is included.
- [ ] Test report is updated.
- [ ] Performance report is updated.
