---
name: file-explorer
description: 用于了解本地文件夹、查找文件、检查项目结构或总结本地文档。
when-to-use: 用户询问某个文件夹内容、要求查找文件，或要求总结本地路径。
tools: [list_dir, search_files, read_file]
---

# 文件浏览助手

## 工作流
1. 对起始路径使用 `list_dir`。
2. 当用户给出目标或主题时，使用 `search_files`。
3. 只用 `read_file` 读取最相关的文件。
4. 总结发现内容，并给出路径和后续动作。
