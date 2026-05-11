import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-skills-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_BUILTIN_SKILLS_DIR = path.join(TMP, 'builtin')
process.env.AGENTDEV_USER_SKILLS_DIR = path.join(TMP, 'user')
const require = createRequire(import.meta.url)
const registry = require('../skills/registry')
const { loadSkill, clearSession } = require('../skills/loader')

function writeSkill(root, dir, name, description, body = '# Body') {
  const skillDir = path.join(root, dir)
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\ntools: [read_file]\nresources:\n  - notes.txt\n---\n\n${body}\n`, 'utf-8')
  fs.writeFileSync(path.join(skillDir, 'notes.txt'), 'note', 'utf-8')
}

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  writeSkill(process.env.AGENTDEV_BUILTIN_SKILLS_DIR, 'base', 'shared', 'builtin desc', '# Builtin')
  writeSkill(process.env.AGENTDEV_USER_SKILLS_DIR, 'override', 'shared', 'user desc', '# User')
  registry.reload()
  clearSession('conv-1')
})

test('registry lets user skill override builtin by name', () => {
  const skill = registry.findSkill('shared')
  expect(skill.description).toBe('user desc')
  expect(skill.readonly).toBe(false)
  expect(registry.listSkills()).toHaveLength(1)
})

test('load_skill returns markdown once per conversation and expands resources', () => {
  const first = loadSkill({ name: 'shared' }, { convId: 'conv-1' })
  expect(first.content).toContain('# User')
  expect(first.content).toContain('可用资源')
  expect(first.referenced_tools).toEqual(['read_file'])

  const second = loadSkill({ name: 'shared' }, { convId: 'conv-1' })
  expect(second.already_loaded).toBe(true)
  expect(second.content).toBe('')
})

test('builtin Office skills are documented as compatibility examples', () => {
  const root = process.cwd()
  const word = fs.readFileSync(path.join(root, 'resources', 'skills', 'word-writer', 'SKILL.md'), 'utf-8')
  const ppt = fs.readFileSync(path.join(root, 'resources', 'skills', 'ppt-builder', 'SKILL.md'), 'utf-8')
  expect(word).toContain('兼容示例')
  expect(ppt).toContain('兼容示例')
})
