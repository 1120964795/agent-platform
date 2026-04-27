const fs = require('fs')
const path = require('path')
const registry = require('../skills/registry')

function getShell(deps = {}) {
  if (deps.shell) return deps.shell
  return require('electron').shell
}

function quoteYaml(value) {
  return JSON.stringify(String(value || ''))
}

function skillSkeleton({ name, description, body }) {
  return `---\nname: ${quoteYaml(name)}\ndescription: ${quoteYaml(description)}\ntools: []\n---\n\n${body || `# ${name}\n\n## 工作流程\n1. 写清楚这个技能适合什么任务。\n2. 列出需要调用的工具和顺序。\n3. 说明最终回答应该包含哪些结果。\n`}\n`
}

function safeSkillName(value, label) {
  try {
    return registry.assertValidSkillName(value, label)
  } catch (error) {
    return { error: { code: error.code || 'INVALID_ARGS', message: error.message } }
  }
}

function register(ipcMain, deps = {}) {
  ipcMain.handle('skills:list', async () => ({ ok: true, skills: registry.listSkills() }))
  ipcMain.handle('skills:reload', async () => ({ ok: true, skills: registry.reload().map(({ name, description, path, dir, readonly, tools, resources, when_to_use }) => ({ name, description, path, dir, readonly, tools, resources, when_to_use })) }))

  ipcMain.handle('skills:openFolder', async () => {
    const dir = registry.userSkillsRoot()
    fs.mkdirSync(dir, { recursive: true })
    const message = await getShell(deps).openPath(dir)
    return message ? { ok: false, error: { code: 'OPEN_PATH_FAILED', message } } : { ok: true, path: dir }
  })

  ipcMain.handle('skills:copyBuiltin', async (_event, payload = {}) => {
    const skill = registry.findSkill(payload.name)
    if (!skill) return { ok: false, error: { code: 'PATH_NOT_FOUND', message: `未找到技能：${payload.name}` } }
    const destName = safeSkillName(payload.destName || skill.name, '目标技能名称')
    if (destName.error) return { ok: false, error: destName.error }
    const destDir = path.join(registry.userSkillsRoot(), destName)
    if (fs.existsSync(destDir) && !payload.overwrite) return { ok: false, error: { code: 'ALREADY_EXISTS', message: `技能已存在：${destName}` } }
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(destDir), { recursive: true })
    fs.cpSync(skill.dir, destDir, { recursive: true })
    if (destName !== skill.name) {
      const skillPath = path.join(destDir, 'SKILL.md')
      if (fs.existsSync(skillPath)) {
        const raw = fs.readFileSync(skillPath, 'utf-8')
        fs.writeFileSync(skillPath, raw.replace(/^name:\s*.*$/m, `name: ${quoteYaml(destName)}`), 'utf-8')
      }
    }
    registry.reload()
    return { ok: true, path: destDir }
  })

  ipcMain.handle('skills:create', async (_event, payload = {}) => {
    const name = safeSkillName(payload.name, '技能名称')
    if (name.error) return { ok: false, error: name.error }
    const description = String(payload.description || '').trim()
    if (!name || !description) return { ok: false, error: { code: 'INVALID_ARGS', message: '请填写技能名称和描述' } }
    const destDir = path.join(registry.userSkillsRoot(), name)
    if (fs.existsSync(destDir) && !payload.overwrite) return { ok: false, error: { code: 'ALREADY_EXISTS', message: `技能已存在：${name}` } }
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), skillSkeleton({ name, description, body: payload.body }), 'utf-8')
    registry.reload()
    return { ok: true, path: destDir }
  })

  ipcMain.handle('skills:delete', async (_event, payload = {}) => {
    const skill = registry.findSkill(payload.name)
    if (!skill) return { ok: false, error: { code: 'PATH_NOT_FOUND', message: `未找到技能：${payload.name}` } }
    if (skill.readonly) return { ok: false, error: { code: 'PERMISSION_DENIED', message: '不能删除内置技能' } }
    fs.rmSync(skill.dir, { recursive: true, force: true })
    registry.reload()
    return { ok: true }
  })
}

module.exports = { register }
