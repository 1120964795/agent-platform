import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-docs-test-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')
process.env.AGENTDEV_GENERATED_DIR = path.join(TMP, 'generated')
const require = createRequire(import.meta.url)
const { execute } = require('../tools')
const { store } = require('../store')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('generate_docx creates a file and stores artifact metadata', async () => {
  const outPath = path.join(TMP, 'out', 'report.docx')
  const result = await execute('generate_docx', { outline: [{ heading: 'Report', level: 1, content: 'Hello' }], out_path: outPath })
  expect(result.path).toBe(outPath)
  expect(result.bytes_written).toBeGreaterThan(0)
  expect(fs.existsSync(outPath)).toBe(true)
  expect(store.listArtifacts()[0].path).toBe(outPath)
})