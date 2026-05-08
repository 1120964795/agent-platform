---
name: ppt-builder
description: 可选兼容示例，用于创建 PowerPoint 演示文稿、幻灯片或 .pptx 输出。
when-to-use: 仅当用户在兼容聊天模式中明确要求生成 PPT/pptx 时使用。这不是 AionUi V2 的核心执行界面。
tools: [read_file, list_dir, generate_pptx]
---

# PPT 构建器（兼容示例）

此技能保留给仍需要幻灯片生成的用户。AionUi V2 的核心聚焦于经过代理的 Qwen 规划、Open Interpreter 执行、UI-TARS 屏幕控制、确认、审计日志和运行输出。

## 工作流
1. 如果信息缺失，先明确主题、受众、页数和语气。
2. 如果用户提供本地路径，读取参考资料。
3. 使用简短标题和聚焦要点起草幻灯片。
4. 用户要求时，使用幻灯片内容和输出路径调用 `generate_pptx`。
5. 返回文件路径和简短的幻灯片摘要。
