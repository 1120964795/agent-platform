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
  const safeReason = String(reason || 'Unknown error').replace(/[<>&]/g, '')
  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>AgentDev Lite</title>
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
          <h1>UI failed to load</h1>
          <div class="card">
            <p>The renderer could not be loaded.</p>
            <p><strong>Reason</strong></p>
            <code>${safeReason}</code>
            <p>In development, start the Vite dev server first. In production, rebuild the client bundle.</p>
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
    throw new Error(`Renderer bundle not found: ${indexPath}`)
  }
  await mainWindow.loadFile(indexPath)
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

  loadRenderer().catch((error) => {
    renderLoadFailure(error?.message || 'Failed to load renderer.')
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
