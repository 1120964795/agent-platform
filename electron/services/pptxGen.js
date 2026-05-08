const PptxGenJS = require('pptxgenjs')
const fs = require('fs')
const path = require('path')
const { store } = require('../store')

const SLIDE_WIDTH = 13.333
const SLIDE_HEIGHT = 7.5

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[\\/:*?"<>|]/g, '').slice(0, 20)
}

function timestamp() {
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function generatePptx({ title, slides }) {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_WIDE'
  pres.title = title
  pres.company = 'AgentDev Lite'

  const cover = pres.addSlide()
  cover.background = { color: 'F6F8FB' }
  cover.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_WIDTH, h: 0.4,
    fill: { type: 'solid', color: '3B82F6' },
    line: { color: '3B82F6', width: 0 }
  })
  cover.addText(slides?.[0]?.title || title, {
    x: 1, y: 2.65, w: SLIDE_WIDTH - 2, h: 1.4,
    fontSize: 36, bold: true, color: '0F172A', fontFace: 'Arial', align: 'center'
  })
  const coverSub = (slides?.[0]?.bullets || []).join(' - ')
  if (coverSub) {
    cover.addText(coverSub, {
      x: 1.2, y: 4.15, w: SLIDE_WIDTH - 2.4, h: 0.8,
      fontSize: 16, color: '64748B', fontFace: 'Arial', align: 'center'
    })
  }

  for (let i = 1; i < (slides || []).length; i += 1) {
    const slideData = slides[i]
    const slide = pres.addSlide()
    slide.background = { color: 'FFFFFF' }
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: SLIDE_WIDTH, h: 0.15,
      fill: { type: 'solid', color: '3B82F6' },
      line: { color: '3B82F6', width: 0 }
    })
    slide.addText(slideData.title || '', {
      x: 0.75, y: 0.45, w: SLIDE_WIDTH - 1.5, h: 0.8,
      fontSize: 24, bold: true, color: '0F172A', fontFace: 'Arial'
    })
    const bullets = (slideData.bullets || []).map((bullet) => ({ text: bullet, options: { bullet: { type: 'bullet' } } }))
    slide.addText(bullets, {
      x: 1, y: 1.55, w: SLIDE_WIDTH - 2, h: SLIDE_HEIGHT - 2.55,
      fontSize: 18, color: '0F172A', fontFace: 'Arial', paraSpaceAfter: 12
    })
    slide.addText(`${i} / ${(slides || []).length - 1}`, {
      x: SLIDE_WIDTH - 1.45, y: SLIDE_HEIGHT - 0.55, w: 0.9, h: 0.3,
      fontSize: 10, color: '94A3B8', fontFace: 'Arial', align: 'right'
    })
  }

  const filename = `ppt_${timestamp()}_${sanitizeFilename(title)}.pptx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  await pres.writeFile({ fileName: fullPath })
  return { filename, path: fullPath }
}

module.exports = { generatePptx }
