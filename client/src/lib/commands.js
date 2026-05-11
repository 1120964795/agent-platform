export function buildSkillCommands(skills = []) {
  return skills
    .filter((skill) => skill?.name)
    .map((skill) => ({
      id: skill.name,
      label: `/${skill.name}`,
      description: skill.description || 'Installed skill',
      skill
    }))
}

export function matchSkillCommands(input, skills = []) {
  if (!input.startsWith('/')) return []
  const query = input.slice(1).trim().toLowerCase()
  return buildSkillCommands(skills).filter((command) => command.id.toLowerCase().startsWith(query))
}

export function parseSkillCommandLine(text, skills = []) {
  const trimmed = String(text || '').trim()
  if (!trimmed.startsWith('/')) return null
  const match = trimmed.match(/^\/([^\s/]+)\s+([\s\S]+)$/)
  if (!match) return null
  const skillName = match[1].trim()
  const message = match[2].trim()
  if (!skillName || !message) return null
  const skill = skills.find((candidate) => candidate?.name?.toLowerCase() === skillName.toLowerCase())
  if (!skill) return null
  return { forcedSkill: skill.name, message }
}
