import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { createCursorOverlayController } = require('../services/desktopCursorOverlay')

test('cursor overlay forwards show move click and hide events to window', () => {
  const sent = []
  const win = {
    isDestroyed: () => false,
    showInactive: vi.fn(),
    hide: vi.fn(),
    webContents: {
      send: (event, payload) => sent.push([event, payload])
    }
  }
  const controller = createCursorOverlayController({ createWindow: () => win })

  controller.show()
  controller.move({ x: 10, y: 20 })
  controller.click({ x: 10, y: 20 })
  controller.hide()

  expect(win.showInactive).toHaveBeenCalled()
  expect(sent).toContainEqual(['desktop-cursor:move', { x: 10, y: 20 }])
  expect(sent).toContainEqual(['desktop-cursor:click', { x: 10, y: 20 }])
  expect(win.hide).toHaveBeenCalled()
})
