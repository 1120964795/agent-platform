const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } = require('docx')
const fs = require('fs')
const path = require('path')
const { store } = require('../store')

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
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: section.heading, font: 'Arial', size: 28, bold: true })]
    }))
    const paragraphs = String(section.content || '').split(/\n\n+/)
    for (const paragraph of paragraphs) {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: paragraph, font: 'Times New Roman', size: 24 })]
      }))
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({
    creator: 'AionUi',
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
