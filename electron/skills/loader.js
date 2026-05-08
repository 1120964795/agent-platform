const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')
const { register } = require('../tools')
const registry = require('./registry')

const loadedByConversation = new Map()

function clearSession(convId) {
  if (convId) loadedByConversation.delete(convId)
}

function resourcesSection(skill) {
  if (!skill.resources?.length) return ''
  const lines = skill.resources.map((resource) => `- ${resource}: ${path.join(skill.dir, resource)}`)
  return ['\n## 可用资源（绝对路径）', ...lines].join('\n')
}

function loadSkill({ name }, context = {}) {
  if (!name) return { error: { code: 'INVALID_ARGS', message: '需要提供技能名称。' } }
  const convId = context.convId || 'global'
  const loaded = loadedByConversation.get(convId) || new Set()
  if (loaded.has(name)) return { name, content: '', referenced_tools: [], already_loaded: true }

  const skill = registry.findSkill(name)
  if (!skill) return { error: { code: 'PATH_NOT_FOUND', message: `未找到技能：${name}` } }
  const parsed = matter(fs.readFileSync(skill.path, 'utf-8'))
  loaded.add(name)
  loadedByConversation.set(convId, loaded)
  return {
    name: skill.name,
    content: `${parsed.content.trim()}${resourcesSection(skill)}`.trim(),
    referenced_tools: Array.isArray(parsed.data.tools) ? parsed.data.tools : []
  }
}

register({ name: 'load_skill', description: 'Load the full markdown workflow for a named skill when it is relevant to the task.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } }, loadSkill)

module.exports = { loadSkill, clearSession }
