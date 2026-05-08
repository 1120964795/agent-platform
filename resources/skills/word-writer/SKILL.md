---
name: word-writer
description: 可选兼容示例，用于创建 Word 文档、报告、文章、论文草稿或 .docx 输出。
when-to-use: 仅当用户在兼容聊天模式中明确要求生成 Word/docx 时使用。这不是 AionUi V2 的核心执行界面。
tools: [read_file, list_dir, generate_docx]
resources:
  - templates/report.docx
---

# Word 写作器（兼容示例）

此技能保留给仍需要文档生成的用户。AionUi V2 的核心聚焦于经过代理的 Qwen 规划、Open Interpreter 执行、UI-TARS 屏幕控制、确认、审计日志和运行输出。

## 工作流
1. 如果信息缺失，先明确主题、受众、篇幅和结构要求。
2. 读取用户提供的本地参考文件。
3. 用标题和章节内容构建大纲。
4. 用户要求时，使用大纲和清晰的输出路径调用 `generate_docx`。
5. 返回生成文件路径，并简要说明包含了哪些内容。

## 默认规则
- 除非用户给出路径，否则使用已配置的工作区根目录输出。
- 优先使用简洁的小节标题和完整段落。
