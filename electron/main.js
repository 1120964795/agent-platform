const { app, BrowserWindow, ipcMain, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { registerAll } = require('./ipc')
const { createSupervisor } = require('./services/bridgeSupervisor')
const { setSupervisor } = require('./ipc/bridgeStatus')
const { setBridgeContext } = require('./ipc/setupStatus')
const { store } = require('./store')
const pythonBootstrap = require('./services/pythonBootstrap')
const { installBrowserRuntime } = require('./services/pythonRuntimeInstaller')
const { createCursorOverlayController, setDesktopCursorOverlay } = require('./services/desktopCursorOverlay')

const isDev = !app.isPackaged
const installBrowserRuntimeOnly = process.argv.includes('--install-browser-runtime')
let mainWindow = null
let supervisor = null

const rootDir = isDev ? path.join(__dirname, '..') : process.resourcesPath
const devUrl = process.env.AGENTDEV_DEV_SERVER_URL || 'http://localhost:5173'
const shouldOpenDevTools = isDev && process.env.AIONUI_OPEN_DEVTOOLS === '1'

function renderLoadFailure(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const safeReason = String(reason || 'Unknown error').replace(/[<>&]/g, '')
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
          <h1>Renderer failed to load</h1>
          <div class="card">
            <p>AionUi could not load the renderer.</p>
            <p><strong>Reason</strong></p>
            <code>${safeReason}</code>
            <p>In development, make sure the Vite dev server is running. In production, make sure client/dist is packaged.</p>
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
    title: 'AionUi',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loadRenderer().catch((error) => {
    renderLoadFailure(error?.message || 'Renderer load failed')
  })

  if (shouldOpenDevTools) mainWindow.webContents.openDevTools()

  const config = store.getConfig()
  if (!config.welcomeShown) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('app:show-welcome')
    })
  }
}

if (installBrowserRuntimeOnly) {
  app.whenReady().then(() => {
    try {
      const result = installBrowserRuntime({ rootDir })
      console.log('[browser-runtime] installed', result)
      app.exit(0)
    } catch (error) {
      console.error('[browser-runtime] install failed', error)
      app.exit(2)
    }
  })
} else {
  app.whenReady().then(async () => {
    setDesktopCursorOverlay(createCursorOverlayController({ BrowserWindow, screen }))
    registerAll(ipcMain)
    supervisor = createSupervisor()
    setSupervisor(supervisor)
    setBridgeContext({ pythonBootstrap, supervisor })
    supervisor.start().catch((err) => console.error('[bridges] start failed', err))
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('before-quit', () => {
  if (supervisor) try { supervisor.stop() } catch {}
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
