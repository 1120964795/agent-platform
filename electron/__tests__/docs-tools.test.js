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

async function readPptxSlideXml(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml$/)?.[1] || 0))

  const slides = []
  for (const name of slideNames) {
    slides.push(await zip.file(name).async('string'))
  }
  return slides
}

async function readDocxDocumentXml(filePath) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath))
  return zip.file('word/document.xml').async('string')
}

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

test('generate_docx writes outline body fields into the document', async () => {
  const outPath = path.join(TMP, 'out', 'content-report.docx')
  const result = await execute('generate_docx', {
    outline: [
      { heading: 'Opening', body: 'DOCX_BODY_TOKEN_OPENING' },
      { title: 'Details', bullets: ['DOCX_BODY_TOKEN_A', 'DOCX_BODY_TOKEN_B'] }
    ],
    out_path: outPath
  })

  expect(result.error).toBeUndefined()
  const documentXml = await readDocxDocumentXml(outPath)
  expect(documentXml).toContain('DOCX_BODY_TOKEN_OPENING')
  expect(documentXml).toContain('DOCX_BODY_TOKEN_A')
  expect(documentXml).toContain('DOCX_BODY_TOKEN_B')
  expect(documentXml).toContain('Details')
})

test('generate_pptx creates a file and stores artifact metadata', async () => {
  const outPath = path.join(TMP, 'out', 'deck.pptx')
  const result = await execute('generate_pptx', {
    slides: [
      { title: 'Deck', bullets: ['Intro', 'Agenda'] },
      { title: 'Details', bullets: ['One', 'Two'] }
    ],
    out_path: outPath
  })

  expect(result.error).toBeUndefined()
  expect(result.path).toBe(outPath)
  expect(result.bytes_written).toBeGreaterThan(0)
  expect(fs.existsSync(outPath)).toBe(true)
  expect(store.listArtifacts()[0].type).toBe('ppt')
  expect(store.listArtifacts()[0].path).toBe(outPath)
})

test('generate_pptx writes slide content into the deck body', async () => {
  const outPath = path.join(TMP, 'out', 'content-deck.pptx')
  const result = await execute('generate_pptx', {
    slides: [
      { title: 'Opening', content: 'BODY_TOKEN_OPENING' },
      { title: 'Details', content: 'BODY_TOKEN_DETAILS_A\nBODY_TOKEN_DETAILS_B' }
    ],
    out_path: outPath
  })

  expect(result.error).toBeUndefined()
  const slideXml = (await readPptxSlideXml(outPath)).join('\n')
  expect(slideXml).toContain('BODY_TOKEN_OPENING')
  expect(slideXml).toContain('BODY_TOKEN_DETAILS_A')
  expect(slideXml).toContain('BODY_TOKEN_DETAILS_B')
})
