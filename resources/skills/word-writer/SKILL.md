---
name: word-writer
description: Use when the user wants a Word document, report, essay, paper draft, or .docx output.
when-to-use: User asks for Word, docx, report writing, paper drafting, or a structured written document.
tools: [read_file, list_dir, generate_docx]
resources:
  - templates/report.docx
---

# Word Writer

## Workflow
1. Clarify the topic, audience, length, and required structure when missing.
2. Read any local reference files the user provided.
3. Build an outline with headings and section content.
4. Call `generate_docx` with the outline and a clear output path when requested.
5. Return the generated file path and briefly note what was included.

## Defaults
- Use the configured workspace root for outputs unless the user gives a path.
- Prefer concise section titles and complete paragraphs.