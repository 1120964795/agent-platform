---
name: word-writer
description: 当用户需要 Word 文档、报告、论文草稿、学习材料或 .docx 文件时使用。
when-to-use: 用户提到 Word、docx、报告、论文、策划书、周报、学习文档、生成文档或结构化写作。
tools: [read_file, list_dir, generate_docx]
---

# Word 文档写作助手

## 工作流程
1. 缺少信息时，先补全主题、读者、篇幅、格式和保存位置。
2. 用户提供本地资料时，先读取相关文件。
3. 先写出完整中文内容，再组织成 outline；每个章节都必须包含有意义的 heading 和 paragraph-style content。
4. 调用 `generate_docx` 时，不能传 `Section 1`、`Section 2` 这类占位标题，不能传空正文或只有关键词的正文。
5. 用户只说“保存到 D 盘”时，传入 `D:\` 即可；工具会自动保存到 `D:\AgentDevLiteGenerated\`。
6. 只有工具返回真实路径和 `bytes_written > 0` 后，才说明生成成功。

## 内容质量要求
- 中文文档要使用自然段落，不要只列标题。
- 每个章节至少包含一段完整正文。
- 如果用户要求“随便生成一份”，也要主动补全合理结构，例如：学习目标、基础知识、实践路线、资源推荐、阶段计划。
- 如果工具返回错误，明确说明文件没有生成，并给出修正建议。
