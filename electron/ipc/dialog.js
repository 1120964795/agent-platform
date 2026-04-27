const fs = require('fs')
const path = require('path')
const { listRoots } = require('./files')

function getDefaultDeps() {
  const { app, BrowserWindow, dialog, shell } = require('electron')
  return { app, BrowserWindow, dialog, shell, mainWindow: BrowserWindow?.getFocusedWindow?.() || null }
}

function error(code, message) {
  return { ok: false, error: { code, message } }
}

function register(ipcMain, deps = {}) {
  ipcMain.handle('dialog:selectFile', async (_event, options = {}) => {
    const { dialog, mainWindow } = { ...getDefaultDeps(), ...deps }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [
        { name: '文档', extensions: ['docx', 'pptx', 'pdf', 'txt', 'md'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:selectDirectory', async () => {
    const { dialog, mainWindow } = { ...getDefaultDeps(), ...deps }
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveFileAs', async (_event, payload = {}) => {
    const sourcePath = String(payload.sourcePath || payload.path || '')
    if (!sourcePath) return error('INVALID_ARGS', '缺少源文件路径')
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      return error('PATH_NOT_FOUND', '源文件不存在')
    }

    const { dialog, mainWindow } = { ...getDefaultDeps(), ...deps }
    const defaultPath = payload.defaultPath || payload.filename || path.basename(sourcePath)
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: payload.filters || [
        { name: '原文件格式', extensions: [path.extname(sourcePath).slice(1) || '*'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return { ok: true, canceled: true }

    fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
    if (path.resolve(sourcePath) !== path.resolve(result.filePath)) {
      fs.copyFileSync(sourcePath, result.filePath)
    }
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('shell:openPath', async (_event, filePath) => {
    const { shell } = { ...getDefaultDeps(), ...deps }
    const message = await shell.openPath(filePath)
    if (message) return { ok: false, error: { code: 'OPEN_PATH_FAILED', message } }
    return { ok: true }
  })

  ipcMain.handle('app:getPaths', async () => {
    const { app } = { ...getDefaultDeps(), ...deps }
    return {
      home: app.getPath('home'),
      desktop: app.getPath('desktop'),
      documents: app.getPath('documents'),
      downloads: app.getPath('downloads'),
      userData: app.getPath('userData'),
      roots: listRoots()
    }
  })
}

module.exports = { register }
