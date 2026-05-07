const { app, BrowserWindow, ipcMain, Menu, dialog, desktopCapturer, nativeImage, screen, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { registerAll } = require('./ipc')
const { installChineseMenu } = require('./menu')
const { createCompanionService } = require('./services/diagnostics/companionService')
const packageJson = require('../package.json')

const isDev = !app.isPackaged
let mainWindow = null
let companionService = null

const rootDir = isDev ? path.join(__dirname, '..') : process.resourcesPath
const devUrl = process.env.AGENTDEV_DEV_SERVER_URL || 'http://127.0.0.1:5173'

function getRendererUrl() {
  if (isDev) return devUrl
  const indexPath = path.join(rootDir, 'client', 'dist', 'index.html')
  return pathToFileURL(indexPath).toString()
}

function getPopupUrl() {
  const rendererUrl = getRendererUrl()
  return rendererUrl.includes('?') ? `${rendererUrl}&popup=1` : `${rendererUrl}?popup=1`
}

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
    title: 'About AgentDev Lite',
    message: 'AgentDev Lite',
    detail: `Version ${packageJson.version || '0.1.0'}\nLocal learning assistant with diagnostics support.`,
    buttons: ['OK']
  }

  if (targetWindow && !targetWindow.isDestroyed()) {
    dialog.showMessageBox(targetWindow, options)
    return
  }

  dialog.showMessageBox(options)
}

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
          <h1>Renderer Failed To Load</h1>
          <div class="card">
            <p>The UI could not be loaded.</p>
            <p><strong>Reason</strong></p>
            <code>${safeReason}</code>
            <p>In development mode, make sure the Vite dev server is running. In production mode, rebuild the client bundle.</p>
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
    throw new Error(`Renderer build artifact not found: ${indexPath}`)
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

  companionService?.setMainWindow(mainWindow)
  mainWindow.setAutoHideMenuBar(true)
  mainWindow.setMenuBarVisibility(false)

  loadRenderer().catch((error) => {
    renderLoadFailure(error?.message || 'Renderer load failed.')
  })

  if (isDev) mainWindow.webContents.openDevTools()
}

app.whenReady().then(() => {
  companionService = createCompanionService({
    BrowserWindow,
    desktopCapturer,
    nativeImage,
    screen,
    ipcMain,
    popupUrl: getPopupUrl(),
    preloadPath: path.join(__dirname, 'preload.js'),
    appTitle: 'AgentDev Lite',
    mainWindow,
    getFocusedWindow: () => BrowserWindow.getFocusedWindow()
  })

  installChineseMenu(Menu, { isDev, sendAction: sendMenuAction, showAbout: showAboutDialog })
  registerAll(ipcMain, {
    app,
    dialog,
    shell,
    mainWindowRef: () => mainWindow,
    companionService
  })

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

app.on('before-quit', async () => {
  await companionService?.dispose?.()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
