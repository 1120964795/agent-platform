const fs = require('fs')
const { register } = require('./index')
const { generateDocx } = require('../services/docxGen')
const { generatePptx } = require('../services/pptxGen')
const { store } = require('../store')

async function generateDocxTool({ outline = [], out_path, template }) {
  const title = outline[0]?.heading || '文档'
  const sections = outline.map((item) => ({ heading: item.heading || `章节 ${item.level || ''}`.trim(), content: item.content || '' }))
  const result = await generateDocx({ title, sections, out_path, template })
  if (out_path && result.path !== out_path) { fs.mkdirSync(require('path').dirname(out_path), { recursive: true }); fs.copyFileSync(result.path, out_path) }
  const finalPath = out_path || result.path
  const artifact = store.addArtifact({ id: store.genId('artifact_'), type: 'word', filename: result.filename, path: finalPath, title, createdAt: new Date().toISOString() })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

async function generatePptxTool({ slides = [], out_path, template }) {
  const title = slides[0]?.title || '演示文稿'
  const result = await generatePptx({ title, slides, out_path, template })
  if (out_path && result.path !== out_path) { fs.mkdirSync(require('path').dirname(out_path), { recursive: true }); fs.copyFileSync(result.path, out_path) }
  const finalPath = out_path || result.path
  const artifact = store.addArtifact({ id: store.genId('artifact_'), type: 'ppt', filename: result.filename, path: finalPath, title, createdAt: new Date().toISOString() })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

register({ name: 'generate_docx', description: '兼容辅助：根据大纲生成 Word DOCX。不会暴露给 AionUi 执行模式。', parameters: { type: 'object', properties: { outline: { type: 'array' }, out_path: { type: 'string' }, template: { type: 'string' } }, required: ['outline'] } }, generateDocxTool)
register({ name: 'generate_pptx', description: '兼容辅助：根据幻灯片内容生成 PowerPoint PPTX。不会暴露给 AionUi 执行模式。', parameters: { type: 'object', properties: { slides: { type: 'array' }, out_path: { type: 'string' }, template: { type: 'string' } }, required: ['slides'] } }, generatePptxTool)

module.exports = { generateDocxTool, generatePptxTool }
