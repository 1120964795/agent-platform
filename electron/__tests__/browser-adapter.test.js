import { test, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require = createRequire(import.meta.url)
const TMP = path.join(os.tmpdir(), `agentdev-browser-adapter-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = TMP

// Mock global fetch
global.fetch = vi.fn()

const { healthCheck, execute, parseSSE } = require('../services/browserUse/adapter')
const { store } = require('../store')

beforeEach(() => {
  fetch.mockReset()
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('healthCheck returns available when bridge responds ok', async () => {
  fetch.mockResolvedValueOnce({
    json: async () => ({ ok: true, runtime: 'browser-use', version: '0.1.0', ready: true }),
  })

  const result = await healthCheck()
  expect(result.available).toBe(true)
  expect(result.detail.runtime).toBe('browser-use')
})

test('healthCheck returns unavailable on fetch error', async () => {
  fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

  const result = await healthCheck()
  expect(result.available).toBe(false)
})

test('parseSSE extracts events from SSE stream', () => {
  const text = [
    'event: start',
    'data: {"goal":"test"}',
    '',
    'event: result',
    'data: {"success":true,"summary":"done"}',
    '',
    'event: done',
    'data: {"duration_ms":1000}',
    '',
  ].join('\n')

  const events = parseSSE(text)
  expect(events).toHaveLength(3)
  expect(events[0]).toEqual({ type: 'start', data: { goal: 'test' } })
  expect(events[1]).toEqual({ type: 'result', data: { success: true, summary: 'done' } })
  expect(events[2]).toEqual({ type: 'done', data: { duration_ms: 1000 } })
})

test('execute marks blank successful bridge result as incomplete', async () => {
  fetch.mockResolvedValueOnce({
    ok: true,
    text: async () => [
      'event: result',
      'data: {"success":true,"summary":"None","final_url":"about:blank","steps_completed":6,"duration_ms":1000}',
      '',
    ].join('\n'),
  })

  const result = await execute({
    goal: 'Open https://example.com and tell me the page title.',
    start_url: 'https://example.com',
  })

  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('BROWSER_TASK_INCOMPLETE')
  expect(result.error.detail.issues).toEqual(['summary_missing', 'final_url_about_blank'])
  expect(result.diagnostics.raw.final_url).toBe('about:blank')
})

test('execute uses visible browser by default from config', async () => {
  store.setConfig({ browserUseHeadless: false })
  fetch.mockResolvedValueOnce({
    ok: true,
    text: async () => [
      'event: result',
      'data: {"success":true,"summary":"Example Domain","final_url":"https://example.com/","steps_completed":3,"duration_ms":1000}',
      '',
    ].join('\n'),
  })

  await execute({
    goal: 'Open https://example.com and tell me the page title.',
    start_url: 'https://example.com',
  })

  const requestBody = JSON.parse(fetch.mock.calls[0][1].body)
  expect(requestBody.headless).toBe(false)
  expect(requestBody.keep_alive).toBe(true)
})

test('execute lets explicit payload headless override config', async () => {
  store.setConfig({ browserUseHeadless: false })
  fetch.mockResolvedValueOnce({
    ok: true,
    text: async () => [
      'event: result',
      'data: {"success":true,"summary":"Example Domain","final_url":"https://example.com/","steps_completed":3,"duration_ms":1000}',
      '',
    ].join('\n'),
  })

  await execute({
    goal: 'Open https://example.com and tell me the page title.',
    start_url: 'https://example.com',
    headless: true,
  })

  const requestBody = JSON.parse(fetch.mock.calls[0][1].body)
  expect(requestBody.headless).toBe(true)
  expect(requestBody.keep_alive).toBe(false)
})

test('execute lets explicit keep_alive override visible-browser default', async () => {
  store.setConfig({ browserUseHeadless: false })
  fetch.mockResolvedValueOnce({
    ok: true,
    text: async () => [
      'event: result',
      'data: {"success":true,"summary":"Example Domain","final_url":"https://example.com/","steps_completed":3,"duration_ms":1000}',
      '',
    ].join('\n'),
  })

  await execute({
    goal: 'Open https://example.com and tell me the page title.',
    start_url: 'https://example.com',
    keep_alive: false,
  })

  const requestBody = JSON.parse(fetch.mock.calls[0][1].body)
  expect(requestBody.headless).toBe(false)
  expect(requestBody.keep_alive).toBe(false)
})

test('execute requests bridge cancellation when abort signal fires', async () => {
  const controller = new AbortController()
  fetch
    .mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    }))
    .mockResolvedValueOnce({ ok: true })

  const pending = execute({ goal: 'Keep browsing until cancelled.' }, { signal: controller.signal })
  controller.abort()

  const result = await pending

  expect(fetch.mock.calls[1][0]).toBe('http://127.0.0.1:8780/cancel')
  expect(fetch.mock.calls[1][1]).toEqual({ method: 'POST' })
  expect(result.ok).toBe(false)
  expect(result.error.code).toBe('ABORTED')
})
