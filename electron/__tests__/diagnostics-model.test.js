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

test('window monitoring sends captured text to the model before creating diagnosis cards', async () => {
  const targetText = '你好 : 无法将“你好”项识别为 cmdlet、函数、脚本文件或可运行程序的名称。'
  const { service, modelClient, emitted } = createService({
    targetText,
    modelResult: {
      isError: true,
      title: 'PowerShell 命令不存在',
      errorType: 'PowerShellCommandNotFound',
      errorSignature: 'model.powershell.command_not_found.hello_cn',
      meaning: 'PowerShell 把输入内容当成命令执行，但没有找到对应命令。',
      possibleCauses: ['输入的是普通文本而不是命令', '命令名称拼写错误'],
      recommendedFixes: [
        { id: 'fix_echo', label: '作为文本输出', command: 'Write-Output "你好"', cwd: 'D:\\demo' }
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
    title: 'PowerShell 命令不存在',
    errorType: 'PowerShellCommandNotFound',
    errorSignature: 'model.powershell.command_not_found.hello_cn',
    modelGenerated: true,
    recommendedFixes: [
      expect.objectContaining({
        command: 'Write-Output "你好"',
        riskLevel: 'medium',
        blocked: false
      })
    ]
  })
  expect(store.listDiagnostics('alice')[0].title).toBe('PowerShell 命令不存在')
  expect(emitted[0]).toMatchObject({ channel: 'diagnostics:event', payload: { type: 'diagnosis-created' } })
})

test('region screen monitoring also uses model diagnosis for OCR text', async () => {
  const targetText = 'Error: listen EADDRINUSE: address already in use :::5173'
  const { service, modelClient } = createService({
    targetText,
    modelResult: {
      isError: true,
      title: '端口 5173 被占用',
      errorType: 'PortInUse',
      errorSignature: 'model.network.port_in_use.5173',
      meaning: '开发服务启动时端口已被其他进程占用。',
      possibleCauses: ['已有 dev server 正在运行'],
      recommendedFixes: [
        { label: '查看端口占用', command: 'netstat -ano | findstr :5173', cwd: 'D:\\demo' }
      ]
    }
  })

  const result = await service.collectOnce({
    username: 'alice',
    target: { type: 'region', displayId: '1', width: 400, height: 160 },
    projectDir: 'D:\\demo'
  })

  expect(modelClient.diagnoseCapturedError).toHaveBeenCalledWith(expect.objectContaining({
    text: targetText,
    context: expect.objectContaining({
      captureSource: 'ocr',
      projectDir: 'D:\\demo'
    })
  }))
  expect(result.diagnosis).toMatchObject({
    title: '端口 5173 被占用',
    modelGenerated: true,
    recommendedFixes: [
      expect.objectContaining({ command: 'netstat -ano | findstr :5173' })
    ]
  })
})
