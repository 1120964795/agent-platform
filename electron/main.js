const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { registerAll } = require('./ipc')

const isDev = !app.isPackaged
let mainWindow = null

const rootDir = isDev ? path.join(__dirname, '..') : process.resourcesPath
const devUrl = process.env.AGENTDEV_DEV_SERVER_URL || 'http://localhost:5173'

function renderLoadFailure(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const safeReason = String(reason || '未知错误').replace(/[<>&]/g, '')
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>AionUi</title>
        <style>
          body { font-family: Segoe UI, Arial, sans-serif; margin: 0; background: #f7f7f9; color: #222; }
          .wrap { max-width: 760px; margin: 64px auto; padding: 0 24px; }
          h1 { font-size: 22px; margin-bottom: 12px; }
          .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px; }
          code { white-space: pre-wrap; word-break: break-word; font-family: Consolas, monospace; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h1>界面加载失败</h1>
          <div class="card">
            <p>渲染器无法加载。</p>
            <p><strong>原因</strong></p>
            <code>${safeReason}</code>
            <p>开发环境请先启动 Vite 开发服务器；生产环境请重新构建前端包。</p>
          </div>
        </div>
      </body>
    </html>
  `
  mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`)
}

async function loadRenderer() {
  if (isDev) {
    await mainWindow.loadURL(devUrl)
    return
  }

  const indexPath = path.join(rootDir, 'client', 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) {
    throw new Error(`未找到渲染器包：${indexPath}`)
  }
  await mainWindow.loadFile(indexPath)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AionUi',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loadRenderer().catch((error) => {
    renderLoadFailure(error?.message || '渲染器加载失败。')
  })

  if (isDev) mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
  registerAll(ipcMain)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
