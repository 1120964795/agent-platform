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
      #label {
        position: absolute;
        left: 0;
        top: 0;
        transform: translate(14px, 14px);
        padding: 4px 8px;
        border-radius: 6px;
        background: rgba(12, 18, 28, 0.86);
        color: white;
        font: 12px/1.3 system-ui, sans-serif;
        opacity: 0;
        transition: opacity 120ms ease, left 160ms ease, top 160ms ease;
      }
      #label.visible { opacity: 1; }
      #cursor.dragging { border-color: #f59e0b; }
      #cursor.scrolling { border-color: #38bdf8; }
      #cursor.typing { border-color: #a855f7; }
      #cursor.paused { border-color: #eab308; }
      #cursor.failed { border-color: #ef4444; }
      #cursor.done { border-color: #22c55e; }
    </style>
  </head>
  <body>
    <div id="cursor"></div>
    <div id="label"></div>
    <script>
      const { ipcRenderer } = require('electron')
      const cursor = document.getElementById('cursor')
      const label = document.getElementById('label')
      function move(_, point) {
        cursor.classList.add('visible')
        if (point.state) cursor.classList.add(point.state)
        cursor.style.left = Number(point.x || 0) + 'px'
        cursor.style.top = Number(point.y || 0) + 'px'
        label.style.left = cursor.style.left
        label.style.top = cursor.style.top
      }
      function click(_, point) {
        move(_, point)
        cursor.classList.remove('pulse')
        void cursor.offsetWidth
        cursor.classList.add('pulse')
      }
      function state(_, payload = {}) {
        cursor.className = 'visible'
        if (payload.state) cursor.classList.add(payload.state)
        if (payload.label) {
          label.textContent = String(payload.label)
          label.classList.add('visible')
        } else {
          label.classList.remove('visible')
        }
      }
      ipcRenderer.on('desktop-cursor:move', move)
      ipcRenderer.on('desktop-cursor:click', click)
      ipcRenderer.on('desktop-cursor:state', state)
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
      const payload = { x: Number(point.x) || 0, y: Number(point.y) || 0 }
      if (point.state) payload.state = point.state
      send('desktop-cursor:move', payload)
    },
    click(point) {
      this.show()
      const payload = { x: Number(point.x) || 0, y: Number(point.y) || 0 }
      if (point.state) payload.state = point.state
      send('desktop-cursor:click', payload)
    },
    state(payload) {
      this.show()
      send('desktop-cursor:state', { state: payload.state || 'moving', label: payload.label || '' })
    },
    handleEvent(event) {
      if (event?.type === 'cursor.move' || event?.type === 'cursor_move') this.move(event)
      if (event?.type === 'cursor.click') this.click(event)
      if (event?.type === 'action_start' && event.action === 'click') this.click({ x: event.target?.x, y: event.target?.y, state: 'clicking' })
      if (event?.type === 'action_start' && event.action === 'drag') this.move({ x: event.target?.from?.x, y: event.target?.from?.y, state: 'dragging' })
      if (event?.type === 'action_start' && event.action === 'scroll') this.move({ x: event.target?.x, y: event.target?.y, state: 'scrolling' })
      if (event?.type === 'action_start' && event.action === 'type') this.state({ state: 'typing', label: 'Typing' })
      if (event?.type === 'ask_user' || event?.type === 'paused') this.state({ state: 'paused', label: event.question || event.summary || 'Paused' })
      if (event?.type === 'fail') this.state({ state: 'failed', label: event.summary || event.message || 'Failed' })
      if (event?.type === 'done') this.state({ state: 'done', label: event.summary || 'Done' })
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
