# Security Policy

## Local Data Boundaries

Backups and workflow packages are metadata-only. The app must not include project source code, secrets, certificates, raw screenshots, raw OCR text, embeddings, SQLite indexes, database files, binaries, or full service logs in backup archives.

## Confirmation Rules

- High-risk commands require explicit Yes/No confirmation.
- Medium-risk workflow steps pause for confirmation.
- `start_service` is visible and stoppable.
- Background workflow autorun is not allowed.
- Destructive file operations require confirmation.

## Import Rules

- `.aionworkflow` and `.aionbackup` files are parsed before restore/import.
- Path traversal and zip slip entries are rejected.
- Workflow template packages reject `.exe`, `.bat`, `.ps1`, `.cmd`, `.dll`, `.sh`, `.jar`, `.msi`, scripts, nested zip files, and unknown package files.
- Official template manifests require a signature marker.
- Community templates remain untrusted unless the user confirms.

## Automated Coverage

Current automated security coverage includes:

- forbidden files in workflow packages,
- `.aionbackup` secret exclusion,
- `.aionbackup` path traversal/zip slip rejection,
- merge restore without project source writes,
- workflow confirmation behavior for medium-risk steps.
