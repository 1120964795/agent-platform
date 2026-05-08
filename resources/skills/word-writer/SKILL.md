---
name: word-writer
description: Optional compatibility example for creating a Word document, report, essay, paper draft, or .docx output.
when-to-use: Use only when the user explicitly asks for Word/docx generation in compatibility chat mode. This is not an AionUi V2 core execution surface.
tools: [read_file, list_dir, generate_docx]
resources:
  - templates/report.docx
---

# Word Writer (Compatibility Example)

This skill remains for users who still need document generation. AionUi V2 centers on brokered Qwen planning, Open Interpreter execution, UI-TARS screen control, confirmations, audit logs, and run outputs.

## Workflow
1. Clarify the topic, audience, length, and required structure when missing.
2. Read any local reference files the user provided.
3. Build an outline with headings and section content.
4. Call `generate_docx` with the outline and a clear output path when requested.
5. Return the generated file path and briefly note what was included.

## Defaults
- Use the configured workspace root for outputs unless the user gives a path.
- Prefer concise section titles and complete paragraphs.
