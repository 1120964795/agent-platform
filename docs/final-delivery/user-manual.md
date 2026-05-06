# User Manual

## Main Modes

- Normal mode: text chat only, no local tool access.
- Full Permission mode: enables local files, shell commands, skills, document tools, and workflow operations.

Use Full Permission only when local work is required.

## Skills

Skills are Markdown workflows. Built-in skills are read-only; user skills can be created, copied, edited, deleted, and reloaded from the Skills panel.

Workflow Skills are structured skills with versions and executable steps. Low-risk steps can run automatically inside the runner. Medium and high-risk steps pause for confirmation.

## Backups

`.aionbackup` packages contain recoverable local metadata:

- experience cards,
- project records and summaries,
- workflow skills and versions,
- workflow run summaries,
- template source settings,
- user preferences and security settings.

They do not contain source code, `.env`, API keys, certificates, binaries, raw screenshots, raw OCR text, embeddings, SQLite index files, or full service logs.

## Demos

Three demos are included:

- `resources/demos/flask-demo`
- `resources/demos/vite-demo`
- `resources/demos/java-demo`

Use them for stable acceptance flows before trying large real projects.
