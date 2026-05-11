let activeOverlay = null

function overlayHtml() {
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        pointer-events: none;
      }
      #cursor {
        position: absolute;
        left: 0;
        top: 0;
        width: 18px;
        height: 18px;
        border: 2px solid #2f7cf6;
        border-radius: 999px;
        background: rgba(47, 124, 246, 0.16);
        box-shadow: 0 0 0 4px rgba(47, 124, 246, 0.12);
        transform: translate(-50%, -50%);
        transition: left 160ms ease, top 160ms ease, opacity 120ms ease;
        opacity: 0;
      }
      #cursor.visible { opacity: 1; }
      #cursor.pulse::after {
        content: '';
        position: absolute;
        inset: -10px;
        border: 2px solid rgba(47, 124, 246, 0.7);
        border-radius: 999px;
        animation: pulse 420ms ease-out;
      }
      @keyframes pulse {
        from { transform: scale(0.7); opacity: 1; }
        to { transform: scale(1.8); opacity: 0; }
      }
    </style>
  </head>
  <body>
    <div id="cursor"></div>
    <script>
      const { ipcRenderer } = require('electron')
      const cursor = document.getElementById('cursor')
      function move(_, point) {
        cursor.classList.add('visible')
        cursor.style.left = Number(point.x || 0) + 'px'
        cursor.style.top = Number(point.y || 0) + 'px'
      }
      function click(_, point) {
        move(_, point)
        cursor.classList.remove('pulse')
        void cursor.offsetWidth
        cursor.classList.add('pulse')
      }
      ipcRenderer.on('desktop-cursor:move', move)
      ipcRenderer.on('desktop-cursor:click', click)
      ipcRenderer.on('desktop-cursor:hide', () => cursor.classList.remove('visible'))
    </script>
  </body>
</html>`
}

function createCursorOverlayController({ BrowserWindow, screen, createWindow } = {}) {
  let win = null

  function defaultCreateWindow() {
    const bounds = screen?.getPrimaryDisplay?.()?.bounds || { x: 0, y: 0, width: 1920, height: 1080 }
    const overlay = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    overlay.setIgnoreMouseEvents?.(true, { forward: true })
    overlay.setAlwaysOnTop?.(true, 'screen-saver')
    overlay.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(overlayHtml())}`)
    overlay.hide?.()
    return overlay
  }

  function getWindow() {
    if (win && !win.isDestroyed?.()) return win
    const factory = createWindow || defaultCreateWindow
    win = factory()
    return win
  }

  function send(event, payload) {
    const target = getWindow()
    if (target?.isDestroyed?.()) return
    target.webContents?.send(event, payload)
  }

  return {
    show() {
      const target = getWindow()
      if (!target?.isDestroyed?.()) target.showInactive?.()
    },
    hide() {
      if (win && !win.isDestroyed?.()) {
        win.webContents?.send?.('desktop-cursor:hide', {})
        win.hide?.()
      }
    },
    move(point) {
      this.show()
      send('desktop-cursor:move', { x: Number(point.x) || 0, y: Number(point.y) || 0 })
    },
    click(point) {
      this.show()
      send('desktop-cursor:click', { x: Number(point.x) || 0, y: Number(point.y) || 0 })
    },
    handleEvent(event) {
      if (event?.type === 'cursor.move') this.move(event)
      if (event?.type === 'cursor.click') this.click(event)
    }
  }
}

function setDesktopCursorOverlay(controller) {
  activeOverlay = controller
}

function getDesktopCursorOverlay() {
  return activeOverlay
}

module.exports = {
  createCursorOverlayController,
  setDesktopCursorOverlay,
  getDesktopCursorOverlay
}
