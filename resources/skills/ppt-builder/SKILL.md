---
name: ppt-builder
description: Optional compatibility example for creating a PowerPoint presentation, slide deck, or .pptx output.
when-to-use: Use only when the user explicitly asks for PPT/pptx generation in compatibility chat mode. This is not an AionUi V2 core execution surface.
tools: [read_file, list_dir, generate_pptx]
---

# PPT Builder (Compatibility Example)

This skill remains for users who still need slide generation. AionUi V2 centers on brokered Qwen planning, Open Interpreter execution, UI-TARS screen control, confirmations, audit logs, and run outputs.

## Workflow
1. Clarify topic, audience, slide count, and tone when missing.
2. Read reference material if the user provides local paths.
3. Draft slides with short titles and focused bullets.
4. Call `generate_pptx` with the slides and an output path when requested.
5. Return the file path and a short slide summary.
