class CompanionPopupManager {
  constructor(options = {}) {
    this.BrowserWindow = options.BrowserWindow
    this.screen = options.screen
    this.popupUrl = options.popupUrl || ''
    this.preloadPath = options.preloadPath || undefined
    this.autoCloseMs = Number(options.autoCloseMs) || 30000
    this.window = null
    this.queue = []
    this.autoCloseTimer = null
  }

  getPrimaryWorkArea() {
    return this.screen.getPrimaryDisplay().workArea
  }

  isFullscreenOccupied() {
    const focused = this.BrowserWindow.getFocusedWindow?.()
    return Boolean(focused && typeof focused.isFullScreen === 'function' && focused.isFullScreen())
  }

  async ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window
    this.window = new this.BrowserWindow({
      width: 360,
      height: 280,
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: false,
      focusable: true,
      hasShadow: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.preloadPath
      }
    })
    if (typeof this.window.loadURL === 'function') {
      await this.window.loadURL(this.popupUrl)
    }
    return this.window
  }

  getPayload() {
    const activeQueue = this.queue.filter((item) => (Date.now() - item.createdAt) <= this.autoCloseMs)
    const selected = [...activeQueue]
      .sort((left, right) => {
        const priorityDiff = Number(right.diagnosis?.priority || 0) - Number(left.diagnosis?.priority || 0)
        if (priorityDiff !== 0) return priorityDiff
        return right.createdAt - left.createdAt
      })[0]

    return {
      count: activeQueue.length,
      headline: activeQueue.length > 1 ? `${activeQueue.length} errors detected` : 'Possible error detected',
      diagnosis: selected?.diagnosis || null,
      items: activeQueue.map((item) => item.diagnosis)
    }
  }

  close() {
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer)
      this.autoCloseTimer = null
    }
    this.queue = []
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide?.()
    }
  }

  async showDiagnosis(item = {}) {
    this.queue = [...this.queue, { ...item, createdAt: Date.now() }]
      .filter((entry) => (Date.now() - entry.createdAt) <= this.autoCloseMs)

    if (this.isFullscreenOccupied()) {
      return this.getPayload()
    }

    const popup = await this.ensureWindow()
    const workArea = this.getPrimaryWorkArea()
    popup.setBounds({
      x: workArea.x + workArea.width - 380,
      y: workArea.y + 24,
      width: 360,
      height: 280
    })

    const payload = this.getPayload()
    popup.webContents.send('diagnostics:popup-data', payload)
    popup.showInactive?.()

    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer)
    this.autoCloseTimer = setTimeout(() => {
      this.close()
    }, this.autoCloseMs)

    return payload
  }
}

module.exports = { CompanionPopupManager }
