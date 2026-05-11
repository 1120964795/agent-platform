const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { store } = require('../store')

let electronApp = null
try { electronApp = require('electron').app } catch { electronApp = null }

let cache = null

function builtinSkillsRoot() {
  if (process.env.AGENTDEV_BUILTIN_SKILLS_DIR) return process.env.AGENTDEV_BUILTIN_SKILLS_DIR
  if (electronApp?.isPackaged) return path.join(process.resourcesPath, 'skills')
  return path.join(__dirname, '..', '..', 'resources', 'skills')
}

function userSkillsRoot() {
  if (process.env.AGENTDEV_USER_SKILLS_DIR) return process.env.AGENTDEV_USER_SKILLS_DIR
  return path.join(path.dirname(store.DATA_DIR), 'skills')
}

function parseSkill(skillDir, readonly) {
  const skillPath = path.join(skillDir, 'SKILL.md')
  if (!fs.existsSync(skillPath)) return null
  try {
    const parsed = matter(fs.readFileSync(skillPath, 'utf-8'))
    const name = parsed.data.name || path.basename(skillDir)
    const description = parsed.data.description
    if (!name || !description) return null
    return {
      name,
      description,
      when_to_use: parsed.data['when-to-use'] || parsed.data.when_to_use || '',
      tools: Array.isArray(parsed.data.tools) ? parsed.data.tools : [],
      resources: Array.isArray(parsed.data.resources) ? parsed.data.resources : [],
      path: skillPath,
      dir: skillDir,
      readonly,
      content: parsed.content
    }
  } catch (error) {
    console.warn('[skills] 解析失败', skillPath, error.message)
    return null
  }
}

function scanRoot(root, readonly) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseSkill(path.join(root, entry.name), readonly))
    .filter(Boolean)
}

function reload() {
  const merged = new Map()
  for (const skill of scanRoot(builtinSkillsRoot(), true)) merged.set(skill.name, skill)
  for (const skill of scanRoot(userSkillsRoot(), false)) merged.set(skill.name, skill)
  cache = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
  return cache
}

function listSkills() {
  if (!cache) reload()
  return cache.map(({ name, description, path, dir, readonly, tools, resources, when_to_use }) => ({ name, description, path, dir, readonly, tools, resources, when_to_use }))
}

function findSkill(name) {
  if (!cache) reload()
  return cache.find((skill) => skill.name === name) || null
}

function buildSkillIndex(skills = listSkills()) {
  if (!skills.length) return ''
  return ['## 可用技能', '当某个技能匹配用户任务时，调用 load_skill(name)。', ...skills.map((skill) => `- ${skill.name}: ${skill.description}`)].join('\n')
}

module.exports = { builtinSkillsRoot, userSkillsRoot, reload, listSkills, findSkill, buildSkillIndex }
