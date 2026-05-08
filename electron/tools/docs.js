const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { generateDocx } = require('../services/docxGen')
const { generatePptx } = require('../services/pptxGen')
const { store } = require('../store')

const DRIVE_OUTPUT_DIR = 'AgentDevLiteGenerated'
const MIN_DOC_CONTENT_LENGTH = 30
const MIN_PPT_CONTENT_LENGTH = 40
const PLACEHOLDER_HEADING_RE = /^(section\s*\d*|章节\s*\d*|第?\s*\d+\s*[章节]?|document|untitled)$/i

function artifactUsername(context = {}) {
  return String(context.username || 'guest').trim() || 'guest'
}

function normalizeRequestedPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^[a-zA-Z]:$/.test(raw)) return `${raw.toUpperCase()}\\`
  return path.normalize(raw)
}

function isDirectoryTarget(targetPath) {
  if (!targetPath) return false
  if (/[\\/]$/.test(targetPath)) return true
  if (path.parse(targetPath).root === targetPath) return true
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
  } catch {
    return false
  }
}

function isRootPath(targetPath) {
  if (!targetPath) return false
  const parsed = path.parse(targetPath)
  return parsed.root && path.normalize(targetPath) === path.normalize(parsed.root)
}

function isFileInRoot(targetPath) {
  if (!targetPath) return false
  return isRootPath(path.dirname(targetPath))
}

function rootSafePath(targetPath, filename) {
  const root = path.parse(targetPath).root || targetPath
  return path.join(root, DRIVE_OUTPUT_DIR, filename)
}

function sameRoot(left, right) {
  if (!left || !right) return false
  const leftRoot = path.parse(path.normalize(left)).root
  const rightRoot = path.parse(path.normalize(right)).root
  return Boolean(leftRoot && rightRoot && leftRoot.toLowerCase() === rightRoot.toLowerCase())
}

function uniquePaths(items = []) {
  const seen = new Set()
  const results = []
  for (const item of items) {
    if (!item) continue
    const normalized = path.normalize(item)
    const key = path.resolve(normalized).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    results.push(normalized)
  }
  return results
}

function getWorkspaceFallbackRoots(context = {}) {
  const username = artifactUsername(context)
  const roots = []
  try {
    roots.push(store.getUserConfig(username).workspace_root)
  } catch {}
  try {
    roots.push(store.getConfig().workspace_root)
  } catch {}
  roots.push(process.cwd())
  return roots
}

function getOutputFallbackPaths(requestedPath, filename, context = {}) {
  if (!requestedPath || !filename) return []
  const driveRootFallback = path.parse(path.normalize(requestedPath)).root
    ? rootSafePath(requestedPath, filename)
    : ''
  const roots = getWorkspaceFallbackRoots(context)
    .filter((root) => root && !isRootPath(root) && sameRoot(requestedPath, root))
    .map((root) => path.join(root, DRIVE_OUTPUT_DIR, filename))

  return uniquePaths([
    driveRootFallback,
    ...roots,
    path.join(store.GENERATED_DIR, filename)
  ])
}

function resolveOutputPath(outPath, fallbackFilename, extension) {
  const targetPath = normalizeRequestedPath(outPath)
  if (!targetPath) return ''
  if (isRootPath(targetPath)) return path.join(targetPath, fallbackFilename)
  if (isDirectoryTarget(targetPath)) return path.join(targetPath, fallbackFilename)

  const currentExt = path.extname(targetPath).toLowerCase()
  if (!currentExt) return `${targetPath}${extension}`
  if (currentExt !== extension) {
    const error = new Error(`目标文件扩展名必须是 ${extension}`)
    error.code = 'INVALID_ARGS'
    throw error
  }

  return targetPath
}

function copyGeneratedFile(sourcePath, finalPath, fallbackPaths = []) {
  const requestedPath = finalPath || sourcePath
  const attempts = uniquePaths([requestedPath, ...fallbackPaths, sourcePath])
  const failures = []

  for (const targetPath of attempts) {
    try {
      if (path.resolve(sourcePath) !== path.resolve(targetPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true })
        fs.copyFileSync(sourcePath, targetPath)
      }

      const stat = fs.statSync(targetPath)
      if (!stat.isFile() || stat.size <= 0) {
        const error = new Error(`文件生成失败：${targetPath}`)
        error.code = 'WRITE_FAILED'
        throw error
      }

      return {
        path: targetPath,
        bytes: stat.size,
        requestedPath,
        fallback: path.resolve(targetPath) !== path.resolve(requestedPath)
      }
    } catch (error) {
      failures.push(`${targetPath}: ${error.message}`)
    }
  }

  const error = new Error(`文件生成失败，所有输出位置都不可写：${failures.join('; ')}`)
  error.code = 'WRITE_FAILED'
  throw error
}

function isPlaceholderHeading(value) {
  return !String(value || '').trim() || PLACEHOLDER_HEADING_RE.test(String(value).trim())
}

function headingFromContent(content, index) {
  const firstLine = String(content || '').split(/\n+/).map(item => item.trim()).find(Boolean) || ''
  const firstSentence = firstLine.split(/[。！？.!?]/).find(Boolean) || firstLine
  const title = firstSentence.slice(0, 18).trim()
  return title || `第 ${index + 1} 部分`
}

function normalizeDocxOutline(outline = []) {
  if (!Array.isArray(outline) || outline.length === 0) {
    const error = new Error('Word 文档内容不足：请提供包含 heading 和 content 的 outline。')
    error.code = 'INVALID_ARGS'
    throw error
  }

  const sections = outline
    .map((item, index) => {
      const content = String(item?.content || '').trim()
      if (!content) return null
      const rawHeading = String(item?.heading || '').trim()
      return {
        heading: isPlaceholderHeading(rawHeading) ? headingFromContent(content, index) : rawHeading,
        content,
        level: Math.max(1, Math.min(3, Number(item?.level) || 1))
      }
    })
    .filter(Boolean)

  const totalContentLength = sections.reduce((sum, section) => sum + section.content.length, 0)
  if (sections.length === 0 || totalContentLength < MIN_DOC_CONTENT_LENGTH) {
    const error = new Error('Word 文档正文太少，已拒绝生成空壳文档。请为每个章节提供完整正文，不要只写 Section。')
    error.code = 'INVALID_ARGS'
    throw error
  }

  return sections
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function splitContentBullets(value) {
  return String(value || '')
    .split(/\r?\n|[；;]/)
    .map((item) => cleanText(item).replace(/^[-*•\d.、)）\s]+/, '').trim())
    .filter(Boolean)
}

function extractBulletText(value) {
  if (typeof value === 'string' || typeof value === 'number') return cleanText(value)
  if (Array.isArray(value)) return value.map(extractBulletText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return cleanText([
      value.text,
      value.content,
      value.body,
      value.point,
      value.description,
      value.summary
    ].filter(Boolean).map(extractBulletText).join(' '))
  }
  return ''
}

function collectPptBullets(slide = {}) {
  const fields = ['bullets', 'points', 'items', 'keyPoints', 'key_points', 'content', 'body', 'text', 'details']
  const bullets = []

  for (const field of fields) {
    const value = slide?.[field]
    if (!value) continue
    if (Array.isArray(value)) {
      bullets.push(...value.map(extractBulletText))
    } else {
      bullets.push(...splitContentBullets(value))
    }
  }

  const seen = new Set()
  return bullets
    .map(cleanText)
    .filter((bullet) => bullet.length >= 4)
    .filter((bullet) => {
      const key = bullet.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function normalizePptxSlides(slides = []) {
  if (!Array.isArray(slides) || slides.length === 0) {
    const error = new Error('PPT 内容不足：请提供 slides 数组，每页必须包含 title 和 bullets。')
    error.code = 'INVALID_ARGS'
    throw error
  }

  const normalized = slides
    .map((slide, index) => {
      const source = typeof slide === 'string' ? { content: slide } : (slide || {})
      const bullets = collectPptBullets(source)
      const title = cleanText(source.title || source.heading || source.name) ||
        headingFromContent(bullets.join('\n') || source.content || source.body || source.text, index)
      return { title, bullets }
    })
    .filter((slide) => slide.title || slide.bullets.length > 0)

  const contentSlides = normalized.slice(1)
  const totalContentLength = contentSlides
    .flatMap((slide) => slide.bullets)
    .join('')
    .length

  if (normalized.length < 2 || contentSlides.some((slide) => slide.bullets.length < 2 || slide.bullets.length > 5) || totalContentLength < MIN_PPT_CONTENT_LENGTH) {
    const error = new Error('PPT 正文内容不足，已拒绝生成只有标题的空壳 PPT。请为封面后的每一页提供 2-5 条有实际信息量的 bullets。')
    error.code = 'INVALID_ARGS'
    throw error
  }

  return normalized
}

async function generateDocxTool({ outline = [], out_path, template }, context = {}) {
  const sections = normalizeDocxOutline(outline)
  const title = sections[0]?.heading || '生成文档'
  const result = await generateDocx({ title, sections, out_path, template })
  const requestedPath = resolveOutputPath(out_path, result.filename, '.docx')
  const fallbackPaths = requestedPath ? getOutputFallbackPaths(requestedPath, path.basename(requestedPath), context) : []
  const final = copyGeneratedFile(result.path, requestedPath || result.path, fallbackPaths)
  const artifact = store.addArtifact({ id: store.genId('artifact_'), username: artifactUsername(context), type: 'word', filename: path.basename(final.path), path: final.path, title, size: final.bytes, createdAt: new Date().toISOString() })
  return {
    path: final.path,
    bytes_written: final.bytes,
    artifact,
    ...(final.fallback ? { warning: `请求的输出位置不可写，文件已保存到：${final.path}` } : {})
  }
}

async function generatePptxTool({ slides = [], out_path, template }, context = {}) {
  const normalizedSlides = normalizePptxSlides(slides)
  const title = normalizedSlides[0]?.title || 'Presentation'
  const result = await generatePptx({ title, slides: normalizedSlides, out_path, template })
  const requestedPath = resolveOutputPath(out_path, result.filename, '.pptx')
  const fallbackPaths = requestedPath ? getOutputFallbackPaths(requestedPath, path.basename(requestedPath), context) : []
  const final = copyGeneratedFile(result.path, requestedPath || result.path, fallbackPaths)
  const artifact = store.addArtifact({ id: store.genId('artifact_'), username: artifactUsername(context), type: 'ppt', filename: path.basename(final.path), path: final.path, title, size: final.bytes, createdAt: new Date().toISOString() })
  return {
    path: final.path,
    bytes_written: final.bytes,
    artifact,
    ...(final.fallback ? { warning: `请求的输出位置不可写，文件已保存到：${final.path}` } : {})
  }
}

register({ name: 'generate_docx', description: 'Generate a Word DOCX from a complete outline. The outline must contain real section headings and substantial section content. Do not pass placeholder headings such as Section 1, and do not pass empty content. If out_path is a directory, create the file inside it. User-specified output paths such as D:\\, D:\\report.docx, or D:\\Reports\\report.docx are attempted directly first. If the OS blocks that target, use the returned fallback path under the same drive folder AgentDevLiteGenerated and mention the warning. Only report success when the returned path exists and bytes_written is greater than zero.', parameters: { type: 'object', properties: { outline: { type: 'array', description: 'Complete document outline. Each item must include a meaningful heading and paragraph-style content.', items: { type: 'object', properties: { heading: { type: 'string', description: 'Meaningful section heading, not a placeholder like Section 1.' }, content: { type: 'string', description: 'Full section body text. For Chinese documents, write polished Chinese paragraphs, not keywords.' }, level: { type: 'number' } }, required: ['heading', 'content'] } }, out_path: { type: 'string', description: 'Optional .docx file path or output directory. Requested paths are attempted directly, then fallback to the same drive folder such as D:\\AgentDevLiteGenerated\\ if needed.' }, template: { type: 'string' } }, required: ['outline'] } }, generateDocxTool)
register({ name: 'generate_pptx', description: 'Generate a PowerPoint PPTX from complete slide content. The first slide is the cover; every later slide must include a meaningful title and 2-5 substantive bullets. Do not call this tool with title-only slides, placeholder bullets, or empty content. If out_path is a directory, create the file inside it. User-specified output paths such as D:\\, D:\\deck.pptx, or D:\\Reports\\deck.pptx are attempted directly first. If the OS blocks that target, use the returned fallback path under the same drive folder AgentDevLiteGenerated and mention the warning. Only report success when the returned path exists and bytes_written is greater than zero.', parameters: { type: 'object', properties: { slides: { type: 'array', description: 'Complete slides. slides[0] is the cover. Slides after the cover require title and bullets with real content, not titles only.', items: { type: 'object', properties: { title: { type: 'string' }, bullets: { type: 'array', description: '2-5 substantive bullets for this slide.', items: { type: 'string' } }, content: { type: 'string', description: 'Alternative body content that can be split into bullets.' }, points: { type: 'array', items: { type: 'string' } } }, required: ['title'] } }, out_path: { type: 'string', description: 'Optional .pptx file path or output directory. Requested paths are attempted directly, then fallback to the same drive folder such as D:\\AgentDevLiteGenerated\\ if needed.' }, template: { type: 'string' } }, required: ['slides'] } }, generatePptxTool)

module.exports = { generateDocxTool, generatePptxTool, resolveOutputPath, normalizeDocxOutline, normalizePptxSlides, getOutputFallbackPaths }
