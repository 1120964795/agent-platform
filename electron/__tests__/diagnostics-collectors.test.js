import { test, expect, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { UiaCollector } = require('../services/diagnostics/uiaCollector')
const { OcrCollector } = require('../services/diagnostics/ocrCollector')

test('uia collector reports unsupported platform outside Windows', async () => {
  const collector = new UiaCollector({ platform: 'linux' })
  const result = await collector.collect({ title: 'demo' })
  expect(result).toMatchObject({
    ok: false,
    source: 'uia',
    error: { code: 'UIA_UNSUPPORTED_PLATFORM' }
  })
})

test('ocr collector reports unavailable engine when worker factory is missing', async () => {
  const collector = new OcrCollector({
    desktopCapturer: { getSources: vi.fn(async () => []) },
    screen: { getAllDisplays: () => [] },
    nativeImage: { createFromBuffer: vi.fn() },
    createWorker: null
  })
  const result = await collector.collect({ type: 'window', id: 'window:1' })
  expect(result).toMatchObject({
    ok: false,
    source: 'ocr',
    error: { code: 'OCR_UNAVAILABLE' }
  })
})

test('ocr collector uses injected worker and returns recognized text', async () => {
  const recognize = vi.fn(async () => ({ data: { text: 'ModuleNotFoundError: No module named flask', confidence: 88 } }))
  const worker = { recognize, terminate: vi.fn(async () => {}) }
  const collector = new OcrCollector({
    desktopCapturer: {
      getSources: vi.fn(async () => [{
        id: 'window:1',
        thumbnail: {
          toPNG: () => Buffer.from('image'),
          isEmpty: () => false
        }
      }])
    },
    screen: { getAllDisplays: () => [] },
    nativeImage: {
      createFromBuffer: vi.fn(() => ({
        toPNG: () => Buffer.from('image'),
        isEmpty: () => false
      }))
    },
    createWorker: vi.fn(async () => worker)
  })

  const result = await collector.collect({ type: 'window', id: 'window:1' })
  expect(result).toMatchObject({
    ok: true,
    source: 'ocr',
    text: 'ModuleNotFoundError: No module named flask'
  })
  await collector.dispose()
  expect(worker.terminate).toHaveBeenCalled()
})
