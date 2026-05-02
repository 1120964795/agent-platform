const path = require('path')

function getVirtualBounds(displays = []) {
  return displays.reduce((acc, display) => ({
    x: Math.min(acc.x, display.bounds.x),
    y: Math.min(acc.y, display.bounds.y),
    width: Math.max(acc.x + acc.width, display.bounds.x + display.bounds.width) - Math.min(acc.x, display.bounds.x),
    height: Math.max(acc.y + acc.height, display.bounds.y + display.bounds.height) - Math.min(acc.y, display.bounds.y)
  }), {
    x: displays[0]?.bounds.x || 0,
    y: displays[0]?.bounds.y || 0,
    width: displays[0]?.bounds.width || 0,
    height: displays[0]?.bounds.height || 0
  })
}

function normalizeRegionSelection(bounds, overlayBounds, display) {
  const x = Math.round(Math.min(bounds.startX, bounds.endX) + overlayBounds.x)
  const y = Math.round(Math.min(bounds.startY, bounds.endY) + overlayBounds.y)
  const width = Math.round(Math.abs(bounds.endX - bounds.startX))
  const height = Math.round(Math.abs(bounds.endY - bounds.startY))

  if (width < 200 || height < 80) {
    return { ok: false, error: { code: 'REGION_TOO_SMALL', message: 'Selected region is too small.' } }
  }

  return {
    ok: true,
    region: {
      type: 'region',
      displayId: String(display.id),
      x,
      y,
      width,
      height,
      scaleFactor: display.scaleFactor || 1
    }
  }
}

class RegionSelectionService {
  constructor(options = {}) {
    this.BrowserWindow = options.BrowserWindow
    this.screen = options.screen
    this.ipcMain = options.ipcMain
    this.preloadPath = options.preloadPath || path.join(__dirname, '..', '..', 'region-selection-preload.js')
  }

  async selectRegion() {
    const displays = this.screen.getAllDisplays()
    const overlayBounds = getVirtualBounds(displays)
    const requestId = `region:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const submitChannel = `diagnostics:region-selection:submit:${requestId}`
    const cancelChannel = `diagnostics:region-selection:cancel:${requestId}`

    return new Promise((resolve) => {
      const cleanup = () => {
        this.ipcMain.removeListener(submitChannel, handleSubmit)
        this.ipcMain.removeListener(cancelChannel, handleCancel)
        if (!overlay.isDestroyed()) overlay.close()
      }

      const overlay = new this.BrowserWindow({
        ...overlayBounds,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        webPreferences: {
          preload: this.preloadPath,
          contextIsolation: true,
          nodeIntegration: false
        }
      })

      const handleSubmit = (_event, payload = {}) => {
        if (payload.requestId !== requestId) return
        const point = {
          x: overlayBounds.x + Math.round((payload.startX + payload.endX) / 2),
          y: overlayBounds.y + Math.round((payload.startY + payload.endY) / 2)
        }
        const display = this.screen.getDisplayNearestPoint(point)
        const result = normalizeRegionSelection(payload, overlayBounds, display)
        cleanup()
        resolve(result.ok ? result.region : null)
      }

      const handleCancel = (_event, payload = {}) => {
        if (payload.requestId !== requestId) return
        cleanup()
        resolve(null)
      }

      this.ipcMain.on(submitChannel, handleSubmit)
      this.ipcMain.on(cancelChannel, handleCancel)

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              html, body { margin: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.22); cursor: crosshair; overflow: hidden; }
              #hint { position: fixed; top: 18px; left: 18px; padding: 10px 14px; border-radius: 10px; background: rgba(15, 23, 42, 0.88); color: #fff; font: 14px Segoe UI, sans-serif; }
              #box { position: fixed; border: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.15); display: none; }
            </style>
          </head>
          <body>
            <div id="hint">Drag to select a terminal region. Press Esc to cancel. Minimum size: 200x80.</div>
            <div id="box"></div>
            <script>
              window.__regionRequestId = '${requestId}'
              const box = document.getElementById('box')
              let start = null
              function render(current) {
                const left = Math.min(start.x, current.x)
                const top = Math.min(start.y, current.y)
                const width = Math.abs(current.x - start.x)
                const height = Math.abs(current.y - start.y)
                box.style.display = 'block'
                box.style.left = left + 'px'
                box.style.top = top + 'px'
                box.style.width = width + 'px'
                box.style.height = height + 'px'
              }
              window.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') window.regionSelection.cancel()
              })
              window.addEventListener('mousedown', (event) => {
                start = { x: event.clientX, y: event.clientY }
                render(start)
              })
              window.addEventListener('mousemove', (event) => {
                if (!start) return
                render({ x: event.clientX, y: event.clientY })
              })
              window.addEventListener('mouseup', (event) => {
                if (!start) return
                const payload = { startX: start.x, startY: start.y, endX: event.clientX, endY: event.clientY }
                start = null
                window.regionSelection.submit({ ...payload, requestId: '${requestId}' })
              })
            </script>
          </body>
        </html>
      `

      overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      overlay.show()
      overlay.focus()
    })
  }
}

module.exports = { RegionSelectionService, normalizeRegionSelection, getVirtualBounds }
