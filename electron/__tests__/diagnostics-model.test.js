import { test, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-diagnostics-model-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')

const require = createRequire(import.meta.url)
const { store } = require('../store')
const { CompanionService } = require('../services/diagnostics/companionService')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

function createService({ targetText, modelResult }) {
  const modelClient = {
    diagnoseCapturedError: vi.fn(async () => modelResult)
  }
  const emitted = []
  const service = new CompanionService({
    storeRef: store,
    modelClient,
    windowTargetService: { listTargets: vi.fn(async () => []) },
    regionSelectionService: { selectRegion: vi.fn(async () => null) },
    uiaCollector: {
      collect: vi.fn(async () => ({
        ok: true,
        source: 'uia',
        text: targetText,
        confidence: 0.9,
        capturedAt: '2026-05-02T10:00:00.000Z'
      }))
    },
    ocrCollector: {
      collect: vi.fn(async () => ({
        ok: true,
        source: 'ocr',
        text: targetText,
        confidence: 0.8,
        capturedAt: '2026-05-02T10:00:00.000Z'
      })),
      dispose: vi.fn(async () => {})
    },
    popupManager: {
      showDiagnosis: vi.fn(async () => {}),
      close: vi.fn()
    },
    emitToWindow: (channel, payload) => emitted.push({ channel, payload }),
    getFocusedWindow: () => null,
    mainWindow: null
  })
  return { service, modelClient, emitted }
}

test('window monitoring falls back to model diagnosis only when no local rule matches', async () => {
  const targetText = 'WEBPACK_BIZARRE_FAILURE_CODE_42: loader pipeline exploded in demo mode'
  const { service, modelClient, emitted } = createService({
    targetText,
    modelResult: {
      isError: true,
      title: 'Webpack loader failure',
      errorType: 'WebpackLoaderFailure',
      errorSignature: 'model.webpack.loader_failure.42',
      meaning: 'A webpack loader failed during compilation.',
      possibleCauses: ['Loader config is invalid'],
      recommendedFixes: [
        { id: 'fix_build', label: 'Run build diagnostics', command: 'npm run build', cwd: 'D:\\demo' }
      ]
    }
  })

  const result = await service.collectOnce({
    username: 'alice',
    target: { type: 'window', title: 'PowerShell', appName: 'Windows Terminal' },
    projectDir: 'D:\\demo'
  })

  expect(modelClient.diagnoseCapturedError).toHaveBeenCalledWith(expect.objectContaining({
    username: 'alice',
    text: targetText,
    context: expect.objectContaining({
      captureSource: 'uia',
      projectDir: 'D:\\demo',
      windowTitle: 'PowerShell'
    })
  }))
  expect(result.diagnosis).toMatchObject({
    title: 'Webpack loader failure',
    errorType: 'WebpackLoaderFailure',
    errorSignature: 'model.webpack.loader_failure.42',
    modelGenerated: true,
    recommendedFixes: [
      expect.objectContaining({
        command: 'npm run build',
        riskLevel: 'medium',
        blocked: false
      })
    ]
  })
  expect(store.listDiagnostics('alice')[0].title).toBe('Webpack loader failure')
  expect(emitted[0]).toMatchObject({ channel: 'diagnostics:event', payload: { type: 'diagnosis-created' } })
})

test('known OCR errors use local rules first for faster popup response', async () => {
  const targetText = 'Error: listen EADDRINUSE: address already in use :::5173'
  const { service, modelClient } = createService({
    targetText,
    modelResult: {
      isError: true,
      title: 'Model should not be used',
      errorType: 'SlowModelPath',
      errorSignature: 'model.slow.path'
    }
  })

  const result = await service.collectOnce({
    username: 'alice',
    target: { type: 'region', displayId: '1', width: 400, height: 160 },
    projectDir: 'D:\\demo'
  })

  expect(modelClient.diagnoseCapturedError).not.toHaveBeenCalled()
  expect(result.diagnosis).toMatchObject({
    errorType: 'PortInUse',
    errorSignature: 'network.port_in_use.5173',
    recommendedFixes: expect.any(Array)
  })
})
