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
