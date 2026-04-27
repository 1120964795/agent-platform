const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { registerAll } = require('./ipc')
const { installChineseMenu } = require('./menu')
const packageJson = require('../package.json')

const isDev = !app.isPackaged
let mainWindow = null

const rootDir = isDev ? path.join(__dirname, '..') : process.resourcesPath
const devUrl = process.env.AGENTDEV_DEV_SERVER_URL || 'http://127.0.0.1:5173'

function getTargetWindow() {
  return BrowserWindow.getFocusedWindow() || mainWindow || BrowserWindow.getAllWindows()[0] || null
}

function sendMenuAction(action) {
  const targetWindow = getTargetWindow()
  if (!targetWindow || targetWindow.isDestroyed()) return
  targetWindow.webContents.send('app-menu:action', { action })
}

function showAboutDialog() {
  const targetWindow = getTargetWindow()
  const options = {
    type: 'info',
    title: '关于 AgentDev Lite',
    message: 'AgentDev Lite',
    detail: `版本 ${packageJson.version || '0.1.0'}\n本地智能学习助手。`,
    buttons: ['确定']
  }

  if (targetWindow && !targetWindow.isDestroyed()) {
    dialog.showMessageBox(targetWindow, options)
    return
  }

  dialog.showMessageBox(options)
}

function renderLoadFailure(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const safeReason = String(reason || '未知错误').replace(/[<>&]/g, '')
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
          <h1>界面加载失败</h1>
          <div class="card">
            <p>渲染界面无法加载。</p>
            <p><strong>原因</strong></p>
            <code>${safeReason}</code>
            <p>开发模式下请先启动 Vite 服务；生产模式下请重新构建前端资源。</p>
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
    throw new Error(`未找到前端构建产物：${indexPath}`)
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

  mainWindow.setAutoHideMenuBar(true)
  mainWindow.setMenuBarVisibility(false)

  loadRenderer().catch((error) => {
    renderLoadFailure(error?.message || '界面加载失败。')
  })

  if (isDev) mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
  installChineseMenu(Menu, { isDev, sendAction: sendMenuAction, showAbout: showAboutDialog })
  registerAll(ipcMain)
  ipcMain.handle('app-menu:set-visible', (event, payload = {}) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow
    const visible = Boolean(payload.visible)

    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.setAutoHideMenuBar(!visible)
      targetWindow.setMenuBarVisibility(visible)
    }

    return { ok: true, visible }
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
