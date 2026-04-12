import { BookOpen, CalendarClock, CalendarDays, FileText, Presentation } from 'lucide-react'

export const COMMANDS = [
  {
    id: 'word',
    label: '/word',
    description: '生成 Word 文档 (.docx)',
    icon: FileText,
    cardType: 'word'
  },
  {
    id: 'ppt',
    label: '/ppt',
    description: '生成 PPT 演示文稿 (.pptx)',
    icon: Presentation,
    cardType: 'ppt'
  },
  {
    id: 'paper',
    label: '/paper',
    description: '论文助手：大纲、摘要、章节、润色',
    icon: BookOpen,
    cardType: 'paper'
  },
  {
    id: 'plan',
    label: '/plan',
    description: '任务规划（时间线 + 甘特图）',
    icon: CalendarDays,
    cardType: 'plan'
  },
  {
    id: 'schedule',
    label: '/schedule',
    description: '定时任务',
    icon: CalendarClock,
    cardType: 'schedule'
  }
]

export function matchCommands(input) {
  if (!input.startsWith('/')) return []
  const query = input.slice(1).trim().toLowerCase()
  return COMMANDS.filter(command => command.id.startsWith(query))
}

/**
 * 解析命令行文本，提取命令类型、引号包裹的文件路径、剩余文本
 * 示例输入: '/word "D:\\some\\path.docx" 帮我写个报告'
 * 返回: { command: 'word', referencePath: 'D:\\some\\path.docx', prompt: '帮我写个报告' }
 */
export function parseCommandLine(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null

  // 提取命令名（第一个空格前的部分）
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return null // 只有 /word 没有参数

  const commandId = trimmed.slice(1, spaceIdx).toLowerCase()
  const cmd = COMMANDS.find(c => c.id === commandId)
  if (!cmd) return null

  let rest = trimmed.slice(spaceIdx + 1).trim()
  let referencePath = null

  // 提取引号里的文件路径
  const pathMatch = rest.match(/^"([^"]+)"/)
  if (pathMatch) {
    referencePath = pathMatch[1]
    rest = rest.slice(pathMatch[0].length).trim()
  }

  if (!rest) return null // 有命令但没有实际指令

  return {
    command: commandId,
    cardType: cmd.cardType,
    referencePath,
    prompt: rest
  }
}
