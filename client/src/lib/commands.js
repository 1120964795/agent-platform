import { BookOpen, CalendarClock, CalendarDays } from 'lucide-react'

export const COMMANDS = [
  { id: 'paper', label: '/paper', description: '论文助手卡片', icon: BookOpen, cardType: 'paper' },
  { id: 'plan', label: '/plan', description: '计划助手卡片', icon: CalendarDays, cardType: 'plan' },
  { id: 'schedule', label: '/schedule', description: '定时任务卡片', icon: CalendarClock, cardType: 'schedule' }
]

export function matchCommands(input) {
  if (!input.startsWith('/')) return []
  const query = input.slice(1).trim().toLowerCase()
  return COMMANDS.filter((command) => command.id.startsWith(query))
}

export function parseCommandLine(text) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return null
  const commandId = trimmed.slice(1, spaceIdx).toLowerCase()
  const cmd = COMMANDS.find((command) => command.id === commandId)
  if (!cmd) return null
  let rest = trimmed.slice(spaceIdx + 1).trim()
  let referencePath = null
  const pathMatch = rest.match(/^"([^"]+)"/)
  if (pathMatch) {
    referencePath = pathMatch[1]
    rest = rest.slice(pathMatch[0].length).trim()
  }
  if (!rest) return null
  return { command: commandId, cardType: cmd.cardType, referencePath, prompt: rest }
}
