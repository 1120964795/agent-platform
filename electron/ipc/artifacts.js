const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function ok(data = {}) { return { ok: true, ...data } }
function fail(error) { return { ok: false, error: { code: error.code || 'IPC_ERROR', message: error.message || String(error) } } }

function getShell(deps = {}) {
  if (deps.shell) return deps.shell
  return require('electron').shell
}

function normalizeArtifactPath(filePath) {
  if (!filePath) return ''
  return path.resolve(String(filePath))
}

function trashFilename(filePath) {
  const ext = path.extname(filePath)
  const base = path.basename(filePath, ext).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'artifact'
  return `${Date.now()}_${store.genId('trash_')}_${base}${ext}`
}

function moveToAppTrash(filePath) {
  const trashDir = path.join(store.GENERATED_DIR, '.trash')
  fs.mkdirSync(trashDir, { recursive: true })
  const trashedPath = path.join(trashDir, trashFilename(filePath))
  try {
    fs.renameSync(filePath, trashedPath)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    fs.copyFileSync(filePath, trashedPath)
    fs.unlinkSync(filePath)
  }
  return trashedPath
}

async function discardArtifactFile(artifact, deps = {}) {
  const filePath = normalizeArtifactPath(artifact?.path)
  if (!filePath || !fs.existsSync(filePath)) return { status: 'missing', path: filePath }
  if (!fs.statSync(filePath).isFile()) return { status: 'skipped', path: filePath }

  try {
    await getShell(deps).trashItem(filePath)
    return { status: 'system-trash', path: filePath }
  } catch (error) {
    try {
      const trashedPath = moveToAppTrash(filePath)
      return {
        status: 'app-trash',
        path: filePath,
        trashedPath,
        warning: '系统回收站不可用，文件已移到应用回收目录。'
      }
    } catch (fallbackError) {
      return {
        status: 'failed',
        path: filePath,
        warning: `产物记录已删除，但文件删除失败：${fallbackError.message || error.message}`
      }
    }
  }
}

function register(ipcMain, deps = {}) {
  ipcMain.handle('artifacts:list', async () => ok({ items: store.listArtifacts() }))
  ipcMain.handle('artifacts:delete', async (_event, payload = {}) => {
    try {
      const id = typeof payload === 'string' ? payload : payload.id
      if (!id) return fail({ code: 'INVALID_ARGS', message: '需要提供产物 ID。' })
      const artifact = store.listArtifacts().find((item) => item.id === id)
      if (!artifact) return fail({ code: 'NOT_FOUND', message: '未找到产物。' })
      const file = await discardArtifactFile(artifact, deps)
      store.deleteArtifact(id, file)
      return ok({ artifact, file, warning: file.warning })
    } catch (error) {
      return fail(error)
    }
  })
}

module.exports = { register, discardArtifactFile }
