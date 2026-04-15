import PptxGenJS from 'pptxgenjs'
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
 * @param {Array<{title:string,bullets:string[]}>} opts.slides
 */
export async function generatePptx({ title, slides }) {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_16x9'
  pres.title = title
  pres.company = 'AgentDev Lite'

  // 封面页
  const cover = pres.addSlide()
  cover.background = { color: 'F6F8FB' }
  cover.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 10, h: 0.4,
    fill: { type: 'solid', color: '3B82F6' },
    line: { color: '3B82F6', width: 0 }
  })
  cover.addText(slides[0]?.title || title, {
    x: 1, y: 2.2, w: 8, h: 1.5,
    fontSize: 36, bold: true, color: '0F172A', fontFace: '微软雅黑', align: 'center'
  })
  const coverSub = (slides[0]?.bullets || []).join(' · ')
  if (coverSub) {
    cover.addText(coverSub, {
      x: 1, y: 3.8, w: 8, h: 0.8,
      fontSize: 16, color: '64748B', fontFace: '微软雅黑', align: 'center'
    })
  }

  // 内容页
  for (let i = 1; i < slides.length; i++) {
    const s = slides[i]
    const slide = pres.addSlide()
    slide.background = { color: 'FFFFFF' }

    // 顶部细条
    slide.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 0.15,
      fill: { type: 'solid', color: '3B82F6' },
      line: { color: '3B82F6', width: 0 }
    })

    slide.addText(s.title || '', {
      x: 0.5, y: 0.4, w: 9, h: 0.8,
      fontSize: 24, bold: true, color: '0F172A', fontFace: '微软雅黑'
    })

    const bullets = (s.bullets || []).map(b => ({ text: b, options: { bullet: { code: '25CF' } } }))
    slide.addText(bullets, {
      x: 0.7, y: 1.4, w: 8.6, h: 4.2,
      fontSize: 18, color: '0F172A', fontFace: '微软雅黑', paraSpaceAfter: 12
    })

    // 页码
    slide.addText(`${i} / ${slides.length - 1}`, {
      x: 9, y: 5.3, w: 0.8, h: 0.3,
      fontSize: 10, color: '94A3B8', fontFace: '微软雅黑', align: 'right'
    })
  }

  const filename = `ppt_${timestamp()}_${sanitizeFilename(title)}.pptx`
  const fullPath = path.join(store.GENERATED_DIR, filename)
  await pres.writeFile({ fileName: fullPath })

  return { filename, path: fullPath }
}
