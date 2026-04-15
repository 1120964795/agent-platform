---
name: ppt-builder
description: Use when the user wants a PowerPoint presentation, slide deck, or .pptx output.
when-to-use: User asks for PPT, slides, presentation, talk outline, or .pptx generation.
tools: [read_file, list_dir, generate_pptx]
---

# PPT Builder

## Workflow
1. Clarify topic, audience, slide count, and tone when missing.
2. Read reference material if the user provides local paths.
3. Draft slides with short titles and focused bullets.
4. Call `generate_pptx` with the slides and an output path when requested.
5. Return the file path and a short slide summary.