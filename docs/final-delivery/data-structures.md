# Data Structures

## `.aionbackup`

```text
aion-backup/
  manifest.json
  experiences.json
  projects.json
  project-profiles.json
  workflow-skills/
  workflow-runs-summary.json
  template-sources.json
  user-settings.json
  security-settings.json
```

`manifest.json` includes schema version, app version, created time, username, content counts, and explicit excludes.

`user-settings.json` excludes `apiKey`.

`workflow-runs-summary.json` stores step status, timing, exit code, and confirmation state only. It does not store full stdout/stderr logs.

## Workflow Skill

```json
{
  "id": "workflow_x",
  "name": "Flask 本地启动助手",
  "description": "检查 Python、安装依赖、启动 Flask。",
  "currentVersion": "1.0.0",
  "technologyStack": ["Python", "Flask"],
  "riskSummary": {
    "maxRiskLevel": "medium",
    "hasNetworkCommand": true,
    "hasPatchStep": false,
    "hasStartService": true
  }
}
```

Versions live under `versions/<version>.json` and contain executable steps.

## Workflow Step

Required fields:

- `id`
- `type`
- `title`
- `riskLevel`
- `requiresConfirmation`

Command steps also include `command` and optional `cwd`.
