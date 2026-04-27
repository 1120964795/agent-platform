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
const { normalizeDocxOutline, resolveOutputPath } = require('../tools/docs')

beforeEach(() => {
  fs.rmSync(TMP, { recursive: true, force: true })
  fs.mkdirSync(TMP, { recursive: true })
})

test('generate_docx creates a file and stores artifact metadata', async () => {
  const outPath = path.join(TMP, 'out', 'report.docx')
  const result = await execute('generate_docx', { outline: [{ heading: 'Report', level: 1, content: 'This report contains enough body text to create a real document instead of a placeholder shell.' }], out_path: outPath })
  expect(result.path).toBe(outPath)
  expect(result.bytes_written).toBeGreaterThan(0)
  expect(fs.existsSync(outPath)).toBe(true)
  expect(store.listArtifacts()[0].path).toBe(outPath)
})

test('generate_docx accepts an output directory and writes inside it', async () => {
  const outDir = path.join(TMP, 'word-target')
  fs.mkdirSync(outDir, { recursive: true })

  const result = await execute('generate_docx', {
    outline: [{ heading: 'Weekly Report', level: 1, content: 'This weekly report contains enough body text to prove that the generated Word document has actual content.' }],
    out_path: outDir
  })

  expect(result.path.startsWith(outDir)).toBe(true)
  expect(path.extname(result.path)).toBe('.docx')
  expect(result.bytes_written).toBeGreaterThan(0)
  expect(fs.existsSync(result.path)).toBe(true)
  expect(store.listArtifacts()[0].filename).toBe(path.basename(result.path))
})

test('generate_docx rejects placeholder-only outlines', async () => {
  const result = await execute('generate_docx', {
    outline: [
      { heading: 'Section 1', level: 1, content: '' },
      { heading: 'Section 2', level: 1, content: '' }
    ],
    out_path: path.join(TMP, 'empty.docx')
  })

  expect(result.error.code).toBe('INVALID_ARGS')
  expect(store.listArtifacts()).toHaveLength(0)
})

test('document outline helper replaces placeholder headings when content is meaningful', () => {
  const sections = normalizeDocxOutline([
    { heading: 'Section 1', content: '学习计算机需要先建立清晰的基础路线，包括操作系统、网络、编程语言和实践项目。' }
  ])

  expect(sections[0].heading).not.toMatch(/Section/i)
  expect(sections[0].content).toContain('学习计算机')
})

test('document output path helper treats drive roots and extensionless paths safely', () => {
  expect(resolveOutputPath('D:', 'report.docx', '.docx')).toBe('D:\\AgentDevLiteGenerated\\report.docx')
  expect(resolveOutputPath('D:\\', 'report.docx', '.docx')).toBe('D:\\AgentDevLiteGenerated\\report.docx')
  expect(resolveOutputPath('D:\\custom.docx', 'report.docx', '.docx')).toBe('D:\\AgentDevLiteGenerated\\custom.docx')
  expect(resolveOutputPath(path.join(TMP, 'report'), 'fallback.docx', '.docx')).toBe(path.join(TMP, 'report.docx'))
  expect(() => resolveOutputPath(path.join(TMP, 'report.txt'), 'fallback.docx', '.docx')).toThrow('目标文件扩展名必须是 .docx')
})
