function getDefaultDeps() {
  const { app, BrowserWindow, dialog, shell } = require('electron')
  return { app, BrowserWindow, dialog, shell, mainWindow: BrowserWindow.getFocusedWindow() }
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
      userData: app.getPath('userData')
    }
  })
}

module.exports = { register }
