const fs = require('fs')
const path = require('path')
const registry = require('../skills/registry')

function getShell(deps = {}) {
  if (deps.shell) return deps.shell
  return require('electron').shell
}

function skillSkeleton({ name, description, body }) {
  return `---\nname: ${name}\ndescription: ${description}\ntools: []\n---\n\n${body || `# ${name}\n\n## Workflow\n1. Describe the workflow here.\n`}\n`
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
    if (!skill) return { ok: false, error: { code: 'PATH_NOT_FOUND', message: `skill not found: ${payload.name}` } }
    const destName = payload.destName || skill.name
    const destDir = path.join(registry.userSkillsRoot(), destName)
    if (fs.existsSync(destDir) && !payload.overwrite) return { ok: false, error: { code: 'ALREADY_EXISTS', message: `skill already exists: ${destName}` } }
    fs.rmSync(destDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(destDir), { recursive: true })
    fs.cpSync(skill.dir, destDir, { recursive: true })
    if (destName !== skill.name) {
      const skillPath = path.join(destDir, 'SKILL.md')
      if (fs.existsSync(skillPath)) {
        const raw = fs.readFileSync(skillPath, 'utf-8')
        fs.writeFileSync(skillPath, raw.replace(/^name:\s*.*$/m, `name: ${destName}`), 'utf-8')
      }
    }
    registry.reload()
    return { ok: true, path: destDir }
  })

  ipcMain.handle('skills:create', async (_event, payload = {}) => {
    const name = String(payload.name || '').trim()
    const description = String(payload.description || '').trim()
    if (!name || !description) return { ok: false, error: { code: 'INVALID_ARGS', message: 'name and description are required' } }
    const destDir = path.join(registry.userSkillsRoot(), name)
    if (fs.existsSync(destDir) && !payload.overwrite) return { ok: false, error: { code: 'ALREADY_EXISTS', message: `skill already exists: ${name}` } }
    fs.mkdirSync(destDir, { recursive: true })
    fs.writeFileSync(path.join(destDir, 'SKILL.md'), skillSkeleton({ name, description, body: payload.body }), 'utf-8')
    registry.reload()
    return { ok: true, path: destDir }
  })

  ipcMain.handle('skills:delete', async (_event, payload = {}) => {
    const skill = registry.findSkill(payload.name)
    if (!skill) return { ok: false, error: { code: 'PATH_NOT_FOUND', message: `skill not found: ${payload.name}` } }
    if (skill.readonly) return { ok: false, error: { code: 'PERMISSION_DENIED', message: 'builtin skills cannot be deleted' } }
    fs.rmSync(skill.dir, { recursive: true, force: true })
    registry.reload()
    return { ok: true }
  })
}

module.exports = { register }