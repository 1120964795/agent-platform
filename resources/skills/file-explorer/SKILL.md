---
name: file-explorer
description: Use to understand a local folder, find files, inspect project structure, or summarize local documents.
when-to-use: User asks what is in a folder, asks to find a file, or asks to summarize a local path.
tools: [list_dir, search_files, read_file]
---

# File Explorer

## Workflow
1. Use `list_dir` on the starting path.
2. Use `search_files` when the user names a target or topic.
3. Read only the most relevant files with `read_file`.
4. Summarize findings with paths and next actions.