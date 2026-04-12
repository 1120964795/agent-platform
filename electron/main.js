const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged
const PORT = 8787

let serverProcess = null
let mainWindow = null

// 数据目录：开发时用项目根目录，打包后用 userData
const rootDir = isDev
  ? path.join(__dirname, '..')
  : process.resourcesPath

const userDataPath = app.getPath('userData')
const dataDir = isDev ? path.join(rootDir, 'data') : path.join(userDataPath, 'data')
const generatedDir = isDev ? path.join(rootDir, 'generated') : path.join(userDataPath, 'generated')

// 确保目录存在
;[dataDir, generatedDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
})

function startServer() {
  const serverScript = path.join(rootDir, 'server', 'index.js')

  serverProcess = fork(serverScript, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: isDev ? 'development' : 'production',
      AGENTDEV_DATA_DIR: dataDir,
      AGENTDEV_GENERATED_DIR: generatedDir,
      AGENTDEV_CLIENT_DIST: isDev ? '' : path.join(rootDir, 'client', 'dist')
    },
    cwd: rootDir
  })

  return new Promise((resolve) => {
    serverProcess.on('message', (msg) => {
      if (msg === 'ready') resolve()
    })
    // 兜底 3 秒
    setTimeout(resolve, 3000)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AgentDev Lite',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const url = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`
  mainWindow.loadURL(url)

  if (isDev) mainWindow.webContents.openDevTools()
}

// ========== IPC handlers ==========

// 选择文件
ipcMain.handle('select-file', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options?.filters || [
      { name: '文档', extensions: ['docx', 'pptx', 'pdf', 'txt', 'md'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })
  return result.canceled ? null : result.filePaths[0]
})

// 选择目录
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// 用系统默认程序打开文件
ipcMain.handle('open-path', async (_event, filePath) => {
  await shell.openPath(filePath)
})

// 获取常用目录路径
ipcMain.handle('get-paths', () => ({
  home: app.getPath('home'),
  desktop: app.getPath('desktop'),
  documents: app.getPath('documents'),
  downloads: app.getPath('downloads'),
  userData: userDataPath,
  generated: generatedDir
}))

// ========== App lifecycle ==========

app.whenReady().then(async () => {
  await startServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
  app.quit()
})

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
})
