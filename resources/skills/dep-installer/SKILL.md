---
name: dep-installer
description: Use when the user asks to install, configure, or check local development dependencies or command-line tools.
when-to-use: User asks to install uv, node, Python packages, CLIs, package managers, or project dependencies.
tools: [get_os_info, which, run_shell_command, read_file]
---

# Dependency Installer

## Standard Workflow
1. Call `get_os_info` to detect the platform, shell, home directory, and package managers.
2. Call `which` for the requested tool or package manager.
3. If the tool is missing, choose the best available installer for the OS: winget, choco, scoop, brew, npm, pip, or project-native commands.
4. Call `run_shell_command` with the install command and an appropriate cwd.
5. Verify with `which` or a version command.
6. Report exactly what ran and whether installation succeeded.

## Rules
- Prefer the project's package manager when a lockfile is present.
- Do not use destructive commands.
- If a command requires confirmation, explain why it is needed before running it.