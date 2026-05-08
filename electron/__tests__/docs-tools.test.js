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
const JSZip = require('jszip')
const { normalizeDocxOutline, normalizePptxSlides, resolveOutputPath, getOutputFallbackPaths } = require('../tools/docs')

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

test('generate_pptx falls back when requested output path cannot be created', async () => {
  const blockedParent = path.join(TMP, 'blocked-parent')
  fs.writeFileSync(blockedParent, 'not a directory')
  const outPath = path.join(blockedParent, 'deck.pptx')

  const result = await execute('generate_pptx', {
    slides: [
      { title: 'Fallback Demo', bullets: ['The requested path is blocked.'] },
      { title: 'Result', bullets: ['The tool should return a writable fallback path.', 'The generated slide should include real body text.'] }
    ],
    out_path: outPath
  })

  expect(result.error).toBeUndefined()
  expect(result.path).not.toBe(outPath)
  expect(result.warning).toContain('请求的输出位置不可写')
  expect(result.bytes_written).toBeGreaterThan(0)
  expect(fs.existsSync(result.path)).toBe(true)
  expect(store.listArtifacts()[0].path).toBe(result.path)

  const zip = await JSZip.loadAsync(fs.readFileSync(result.path))
  const presentationXml = await zip.file('ppt/presentation.xml').async('string')
  const slideXml = await zip.file('ppt/slides/slide2.xml').async('string')
  const slideWidth = Number(presentationXml.match(/<p:sldSz[^>]+cx="(\d+)"/)?.[1] || 0)
  const extWidths = [...slideXml.matchAll(/<a:ext cx="(\d+)"/g)].map((match) => Number(match[1]))
  expect(Math.max(...extWidths)).toBeGreaterThanOrEqual(slideWidth - 5000)
  expect(slideXml).toContain('The tool should return a writable fallback path.')
})

test('generate_pptx rejects title-only slides', async () => {
  const result = await execute('generate_pptx', {
    slides: [
      { title: 'Only Cover' },
      { title: 'Only Title' }
    ],
    out_path: path.join(TMP, 'title-only.pptx')
  })

  expect(result.error.code).toBe('INVALID_ARGS')
  expect(result.error.message).toContain('只有标题')
  expect(store.listArtifacts()).toHaveLength(0)
})

test('ppt slide normalizer accepts content fields and turns them into bullets', () => {
  const slides = normalizePptxSlides([
    { title: 'AI 学习路线', bullets: ['面向零基础学习者的阶段路线'] },
    { title: '基础阶段', content: '掌握操作系统、网络和编程语言基础；通过小项目建立反馈闭环；每周复盘知识盲区并更新计划' }
  ])

  expect(slides[1].bullets).toEqual([
    '掌握操作系统、网络和编程语言基础',
    '通过小项目建立反馈闭环',
    '每周复盘知识盲区并更新计划'
  ])
})

test('ppt slide normalizer rejects content slides with too few bullets', () => {
  expect(() => normalizePptxSlides([
    { title: 'Cover' },
    { title: 'Thin Slide', bullets: ['Only one body point is not enough.'] }
  ])).toThrow('2-5')
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

test('generate_docx preserves outline heading levels', async () => {
  const result = await execute('generate_docx', {
    outline: [
      { heading: '一级标题', level: 1, content: '一级章节正文内容足够长，用于验证 Word 文档生成时保留标题层级。' },
      { heading: '二级标题', level: 2, content: '二级章节正文内容足够长，用于验证 Heading2 样式不会被错误写成 Heading1。' }
    ],
    out_path: path.join(TMP, 'levels.docx')
  })

  const zip = await JSZip.loadAsync(fs.readFileSync(result.path))
  const documentXml = await zip.file('word/document.xml').async('string')
  expect(documentXml).toContain('w:val="Heading1"')
  expect(documentXml).toContain('w:val="Heading2"')
})


test('document outline helper replaces placeholder headings when content is meaningful', () => {
  const sections = normalizeDocxOutline([
    { heading: 'Section 1', content: '学习计算机需要先建立清晰的基础路线，包括操作系统、网络、编程语言和实践项目。' }
  ])

  expect(sections[0].heading).not.toMatch(/Section/i)
  expect(sections[0].content).toContain('学习计算机')
})

test('document output path helper allows direct drive-root outputs with fallbacks', () => {
  expect(resolveOutputPath('D:', 'report.docx', '.docx')).toBe('D:\\report.docx')
  expect(resolveOutputPath('D:\\', 'report.docx', '.docx')).toBe('D:\\report.docx')
  expect(resolveOutputPath('D:\\custom.docx', 'report.docx', '.docx')).toBe('D:\\custom.docx')
  expect(getOutputFallbackPaths('D:\\custom.docx', 'custom.docx')[0]).toBe('D:\\AgentDevLiteGenerated\\custom.docx')
  expect(getOutputFallbackPaths('D:\\Reports\\custom.docx', 'custom.docx')[0]).toBe('D:\\AgentDevLiteGenerated\\custom.docx')
  expect(resolveOutputPath(path.join(TMP, 'report'), 'fallback.docx', '.docx')).toBe(path.join(TMP, 'report.docx'))
  expect(() => resolveOutputPath(path.join(TMP, 'report.txt'), 'fallback.docx', '.docx')).toThrow('目标文件扩展名必须是 .docx')
})
