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

test('cursor overlay handles phase 2 desktop event names and states', () => {
  const sent = []
  const win = {
    isDestroyed: () => false,
    showInactive: vi.fn(),
    hide: vi.fn(),
    webContents: { send: (event, payload) => sent.push([event, payload]) }
  }
  const controller = createCursorOverlayController({ createWindow: () => win })

  controller.handleEvent({ type: 'cursor_move', x: 10, y: 20, state: 'moving' })
  controller.handleEvent({ type: 'action_start', action: 'click', target: { x: 10, y: 20 } })
  controller.handleEvent({ type: 'ask_user', question: 'Continue?' })
  controller.handleEvent({ type: 'done', summary: 'finished' })

  expect(sent).toContainEqual(['desktop-cursor:move', { x: 10, y: 20, state: 'moving' }])
  expect(sent).toContainEqual(['desktop-cursor:click', { x: 10, y: 20, state: 'clicking' }])
  expect(sent).toContainEqual(['desktop-cursor:state', { state: 'paused', label: 'Continue?' }])
  expect(sent).toContainEqual(['desktop-cursor:state', { state: 'done', label: 'finished' }])
})
