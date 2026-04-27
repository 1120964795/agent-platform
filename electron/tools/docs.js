const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { generateDocx } = require('../services/docxGen')
const { generatePptx } = require('../services/pptxGen')
const { store } = require('../store')

const DRIVE_OUTPUT_DIR = 'AgentDevLiteGenerated'
const MIN_DOC_CONTENT_LENGTH = 30
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

function resolveOutputPath(outPath, fallbackFilename, extension) {
  const targetPath = normalizeRequestedPath(outPath)
  if (!targetPath) return ''
  if (isRootPath(targetPath)) return rootSafePath(targetPath, fallbackFilename)
  if (isDirectoryTarget(targetPath)) return path.join(targetPath, fallbackFilename)

  const currentExt = path.extname(targetPath).toLowerCase()
  if (!currentExt) return `${targetPath}${extension}`
  if (currentExt !== extension) {
    const error = new Error(`目标文件扩展名必须是 ${extension}`)
    error.code = 'INVALID_ARGS'
    throw error
  }

  if (isFileInRoot(targetPath)) return rootSafePath(targetPath, path.basename(targetPath))

  return targetPath
}

function copyGeneratedFile(sourcePath, finalPath) {
  const targetPath = finalPath || sourcePath
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

  return { path: targetPath, bytes: stat.size }
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
        content
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

async function generateDocxTool({ outline = [], out_path, template }, context = {}) {
  const sections = normalizeDocxOutline(outline)
  const title = sections[0]?.heading || '生成文档'
  const result = await generateDocx({ title, sections, out_path, template })
  const requestedPath = resolveOutputPath(out_path, result.filename, '.docx')
  const final = copyGeneratedFile(result.path, requestedPath || result.path)
  const artifact = store.addArtifact({ id: store.genId('artifact_'), username: artifactUsername(context), type: 'word', filename: path.basename(final.path), path: final.path, title, createdAt: new Date().toISOString() })
  return { path: final.path, bytes_written: final.bytes, artifact }
}

async function generatePptxTool({ slides = [], out_path, template }, context = {}) {
  const title = slides[0]?.title || 'Presentation'
  const result = await generatePptx({ title, slides, out_path, template })
  const requestedPath = resolveOutputPath(out_path, result.filename, '.pptx')
  const final = copyGeneratedFile(result.path, requestedPath || result.path)
  const artifact = store.addArtifact({ id: store.genId('artifact_'), username: artifactUsername(context), type: 'ppt', filename: path.basename(final.path), path: final.path, title, createdAt: new Date().toISOString() })
  return { path: final.path, bytes_written: final.bytes, artifact }
}

register({ name: 'generate_docx', description: 'Generate a Word DOCX from a complete outline. The outline must contain real section headings and substantial section content. Do not pass placeholder headings such as Section 1, and do not pass empty content. If out_path is a directory, create the file inside it. If out_path is a drive root or a file directly under a drive root, save under the drive subfolder AgentDevLiteGenerated to avoid Windows root-write restrictions. Only report success when the returned path exists and bytes_written is greater than zero.', parameters: { type: 'object', properties: { outline: { type: 'array', description: 'Complete document outline. Each item must include a meaningful heading and paragraph-style content.', items: { type: 'object', properties: { heading: { type: 'string', description: 'Meaningful section heading, not a placeholder like Section 1.' }, content: { type: 'string', description: 'Full section body text. For Chinese documents, write polished Chinese paragraphs, not keywords.' }, level: { type: 'number' } }, required: ['heading', 'content'] } }, out_path: { type: 'string', description: 'Optional .docx file path or output directory. Drive-root requests such as D:\\ are saved under D:\\AgentDevLiteGenerated\\.' }, template: { type: 'string' } }, required: ['outline'] } }, generateDocxTool)
register({ name: 'generate_pptx', description: 'Generate a PowerPoint PPTX from slides. If out_path is a directory, create the file inside it. If out_path is a drive root or a file directly under a drive root, save under the drive subfolder AgentDevLiteGenerated to avoid Windows root-write restrictions. Only report success when the returned path exists and bytes_written is greater than zero.', parameters: { type: 'object', properties: { slides: { type: 'array' }, out_path: { type: 'string', description: 'Optional .pptx file path or output directory. Drive-root requests such as D:\\ are saved under D:\\AgentDevLiteGenerated\\.' }, template: { type: 'string' } }, required: ['slides'] } }, generatePptxTool)

module.exports = { generateDocxTool, generatePptxTool, resolveOutputPath, normalizeDocxOutline }
