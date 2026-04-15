const fs = require('fs')
const { register } = require('./index')
const { generateDocx } = require('../services/docxGen')
const { generatePptx } = require('../services/pptxGen')
const { store } = require('../store')

async function generateDocxTool({ outline = [], out_path, template }) {
  const title = outline[0]?.heading || 'Document'
  const sections = outline.map((item) => ({ heading: item.heading || `Section ${item.level || ''}`.trim(), content: item.content || '' }))
  const result = await generateDocx({ title, sections, out_path, template })
  if (out_path && result.path !== out_path) { fs.mkdirSync(require('path').dirname(out_path), { recursive: true }); fs.copyFileSync(result.path, out_path) }
  const finalPath = out_path || result.path
  const artifact = store.addArtifact({ id: store.genId('artifact_'), type: 'word', filename: result.filename, path: finalPath, title, createdAt: new Date().toISOString() })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

async function generatePptxTool({ slides = [], out_path, template }) {
  const title = slides[0]?.title || 'Presentation'
  const result = await generatePptx({ title, slides, out_path, template })
  if (out_path && result.path !== out_path) { fs.mkdirSync(require('path').dirname(out_path), { recursive: true }); fs.copyFileSync(result.path, out_path) }
  const finalPath = out_path || result.path
  const artifact = store.addArtifact({ id: store.genId('artifact_'), type: 'ppt', filename: result.filename, path: finalPath, title, createdAt: new Date().toISOString() })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

register({ name: 'generate_docx', description: 'Generate a Word DOCX from an outline.', parameters: { type: 'object', properties: { outline: { type: 'array' }, out_path: { type: 'string' }, template: { type: 'string' } }, required: ['outline'] } }, generateDocxTool)
register({ name: 'generate_pptx', description: 'Generate a PowerPoint PPTX from slides.', parameters: { type: 'object', properties: { slides: { type: 'array' }, out_path: { type: 'string' }, template: { type: 'string' } }, required: ['slides'] } }, generatePptxTool)

module.exports = { generateDocxTool, generatePptxTool }