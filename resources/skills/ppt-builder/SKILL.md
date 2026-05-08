---
name: ppt-builder
description: 当用户需要 PPT、演示文稿、汇报幻灯片或 .pptx 文件时使用。
when-to-use: 用户提到 PPT、幻灯片、presentation、汇报提纲、演讲稿配套展示或 .pptx 生成。
tools: [read_file, list_dir, generate_pptx]
---

# PPT 生成助手

## 工作流程
1. 缺少信息时，先补全主题、听众、页数和表达风格。
2. 用户给了本地资料路径时，先读取相关资料。
3. 每页使用清晰短标题和聚焦要点，避免大段文字堆叠。
4. 需要生成文件时，调用 `generate_pptx`，传入完整 slides 和输出路径。
5. 只有工具返回真实路径和写入字节数后，才说明生成成功，并简要概括幻灯片内容。
