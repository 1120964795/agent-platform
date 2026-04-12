import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx'
import fs from 'fs'
import path from 'path'
import { store } from '../store.js'

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
}

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array<{heading:string,content:string}>} opts.sections
 */
export async function generateDocx({ title, sections }) {
  const children = []

  // 文档标题
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: title, font: '宋体', size: 36, bold: true })]
  }))
  children.push(new Paragraph({ text: '' }))

  for (const s of sections) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: s.heading, font: '宋体', size: 28, bold: true })]
    }))
    const paras = String(s.content || '').split(/\n\n+/)
    for (const p of paras) {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: p, font: 'Times New Roman', size: 24 })]
      }))
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({
    creator: 'AgentDev Lite',
    title,
    sections: [{ properties: {}, children }]
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `word_${timestamp()}_${sanitizeFilename(title)}.docx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  fs.writeFileSync(fullPath, buffer)

  return { filename, path: fullPath }
}
