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
        { name: 'Documents', extensions: ['docx', 'pptx', 'pdf', 'txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
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
    const content = typeof payload.content === 'string' ? payload.content : null
    if (!sourcePath && content === null) return error('INVALID_ARGS', 'Missing source file or content.')
    if (sourcePath && (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())) {
      return error('PATH_NOT_FOUND', 'Source file does not exist.')
    }

    const { dialog, mainWindow } = { ...getDefaultDeps(), ...deps }
    const defaultPath = payload.defaultPath || payload.filename || (sourcePath ? path.basename(sourcePath) : 'export.json')
    const extension = sourcePath ? path.extname(sourcePath).slice(1) || '*' : path.extname(defaultPath).slice(1) || '*'
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      filters: payload.filters || [
        { name: 'Original Format', extensions: [extension] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePath) return { ok: true, canceled: true }

    fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
    if (content !== null) {
      fs.writeFileSync(result.filePath, content, 'utf-8')
    } else if (path.resolve(sourcePath) !== path.resolve(result.filePath)) {
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
