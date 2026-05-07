import { test, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const TMP = path.join(os.tmpdir(), `agentdev-template-source-${Date.now()}`)
process.env.AGENTDEV_DATA_DIR = path.join(TMP, 'data')

const require = createRequire(import.meta.url)
const templateSourceService = require('../workflows/templateSourceService')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
})

test('built-in official workflow template source lists offline demo templates', async () => {
  const result = await templateSourceService.listTemplates()
  expect(result.errors).toEqual([])
  expect(result.templates.map((template) => template.id)).toEqual(expect.arrayContaining([
    'official-flask-local-start',
    'official-vite-local-start',
    'official-java-build-check'
  ]))
  expect(result.templates.every((template) => template.sourceTrustState === 'official_trusted')).toBe(true)
  expect(result.templates.every((template) => template.signatureState === 'present')).toBe(true)
})
