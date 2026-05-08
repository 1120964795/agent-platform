const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } = require('docx')
const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function headingLevelFor(level) {
  const normalized = Math.max(1, Math.min(3, Number(level) || 1))
  if (normalized === 2) return HeadingLevel.HEADING_2
  if (normalized === 3) return HeadingLevel.HEADING_3
  return HeadingLevel.HEADING_1
}

function headingSizeFor(level) {
  const normalized = Math.max(1, Math.min(3, Number(level) || 1))
  if (normalized === 2) return 24
  if (normalized === 3) return 22
  return 28
}

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
}

function timestamp() {
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function generateDocx({ title, sections }) {
  const children = []

  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: title, font: 'Arial', size: 36, bold: true })]
  }))
  children.push(new Paragraph({ text: '' }))

  for (const section of sections || []) {
    children.push(new Paragraph({
      heading: headingLevelFor(section.level),
      children: [new TextRun({ text: section.heading, font: 'Arial', size: headingSizeFor(section.level), bold: true })]
    }))
    const paragraphs = String(section.content || '').split(/\n\n+/).map(item => item.trim()).filter(Boolean)
    for (const paragraph of paragraphs) {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: paragraph, font: 'Times New Roman', size: 24 })]
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
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, buffer)
  return { filename, path: fullPath }
}

module.exports = { generateDocx }
