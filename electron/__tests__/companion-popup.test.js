import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { CompanionPopupManager } = require('../services/diagnostics/companionPopupManager')

test('popup manager queues multiple errors and never steals focus', async () => {
  const send = vi.fn()
  const loadURL = vi.fn(async () => {})
  const showInactive = vi.fn()
  const flashFrame = vi.fn()
  function BrowserWindow() {
    return {
      loadURL,
      showInactive,
      flashFrame,
      hide: vi.fn(),
      setBounds: vi.fn(),
      webContents: { send },
      isDestroyed: () => false
    }
  }
  BrowserWindow.getFocusedWindow = vi.fn(() => null)
  const screen = {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
  }
  const manager = new CompanionPopupManager({
    BrowserWindow,
    screen,
    popupUrl: 'http://127.0.0.1:5173?popup=1',
    autoCloseMs: 15000
  })

  await manager.showDiagnosis({ diagnosis: { id: 'diag_1', title: 'A', priority: 50, rawSnippet: 'A' } })
  await manager.showDiagnosis({ diagnosis: { id: 'diag_2', title: 'B', priority: 90, rawSnippet: 'B' } })

  expect(showInactive).toHaveBeenCalledTimes(2)
  expect(flashFrame).not.toHaveBeenCalled()
  expect(send).toHaveBeenLastCalledWith('diagnostics:popup-data', expect.objectContaining({
    count: 2,
    headline: '检测到 2 个问题',
    diagnosis: expect.objectContaining({ id: 'diag_2' })
  }))
})
