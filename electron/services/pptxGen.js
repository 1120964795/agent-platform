const PptxGenJS = require('pptxgenjs')
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

function normalizeTextItem(item) {
  if (item == null) return ''
  if (typeof item === 'string' || typeof item === 'number') return String(item).trim()
  return String(item.text || item.content || item.title || '').trim()
}

function splitTextBlock(value) {
  return String(value || '')
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

function normalizeSlideBody(slideData = {}) {
  const body = []
  for (const key of ['bullets', 'points', 'items']) {
    const value = slideData[key]
    if (Array.isArray(value)) body.push(...value.map(normalizeTextItem))
  }
  for (const key of ['content', 'body', 'text']) {
    const value = slideData[key]
    if (Array.isArray(value)) body.push(...value.map(normalizeTextItem))
    else if (value) body.push(...splitTextBlock(value))
  }
  return body.filter(Boolean)
}

function addContentSlide(pres, slideData, slideNumber, totalSlides) {
  const slide = pres.addSlide()
  slide.background = { color: 'FFFFFF' }
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.15,
    fill: { type: 'solid', color: '3B82F6' },
    line: { color: '3B82F6', width: 0 }
  })
  slide.addText(slideData.title || '', {
    x: 0.5, y: 0.4, w: 9, h: 0.8,
    fontSize: 24, bold: true, color: '0F172A', fontFace: 'Arial'
  })
  const bullets = normalizeSlideBody(slideData).map((bullet) => ({ text: bullet, options: { bullet: { type: 'bullet' } } }))
  if (bullets.length) {
    slide.addText(bullets, {
      x: 0.7, y: 1.4, w: 8.6, h: 4.2,
      fontSize: 18, color: '0F172A', fontFace: 'Arial', paraSpaceAfter: 12
    })
  }
  slide.addText(`${slideNumber} / ${totalSlides}`, {
    x: 9, y: 5.3, w: 0.8, h: 0.3,
    fontSize: 10, color: '94A3B8', fontFace: 'Arial', align: 'right'
  })
}

async function generatePptx({ title, slides }) {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.title = title
  pres.company = 'AionUi'

  const cover = pres.addSlide()
  cover.background = { color: 'F6F8FB' }
  cover.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.4,
    fill: { type: 'solid', color: '3B82F6' },
    line: { color: '3B82F6', width: 0 }
  })
  cover.addText(slides?.[0]?.title || title, {
    x: 1, y: 2.2, w: 8, h: 1.5,
    fontSize: 36, bold: true, color: '0F172A', fontFace: 'Arial', align: 'center'
  })
  const coverSub = (slides?.[0]?.bullets || []).join(' - ')
  if (coverSub) {
    cover.addText(coverSub, {
      x: 1, y: 3.8, w: 8, h: 0.8,
      fontSize: 16, color: '64748B', fontFace: 'Arial', align: 'center'
    })
  }

  const contentSlides = (slides || []).filter((slideData) => slideData?.title || normalizeSlideBody(slideData).length)
  for (let i = 0; i < contentSlides.length; i += 1) {
    addContentSlide(pres, contentSlides[i], i + 1, contentSlides.length)
  }

  const filename = `ppt_${timestamp()}_${sanitizeFilename(title)}.pptx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  await pres.writeFile({ fileName: fullPath })
  return { filename, path: fullPath }
}

module.exports = { generatePptx }
