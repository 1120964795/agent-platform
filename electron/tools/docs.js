const fs = require('fs')
const path = require('path')
const { register } = require('./index')
const { generateDocx } = require('../services/docxGen')
const { generatePptx } = require('../services/pptxGen')
const { planDocumentArtifact, planPresentationArtifact } = require('../services/officeArtifactPlanner')
const { store } = require('../store')

function copyGeneratedFileIfNeeded(result, outPath) {
  if (outPath && result.path !== outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.copyFileSync(result.path, outPath)
  }
  return outPath || result.path
}

function promptFromOutline(outline = []) {
  return outline.map((item) => `${item.heading || ''}\n${item.content || ''}`).join('\n\n')
}

function promptFromSlides(slides = []) {
  return slides.map((slide) => `${slide.title || ''}\n${(slide.bullets || []).join('\n')}`).join('\n\n')
}

async function generateDocxTool({ outline = [], out_path, template }) {
  const artifactPlan = planDocumentArtifact({
    prompt: promptFromOutline(outline),
    title: outline[0]?.heading || 'Document'
  })
  const sections = outline.map((item) => ({
    heading: item.heading || `Section ${item.level || ''}`.trim(),
    content: item.content || ''
  }))
  const result = await generateDocx({ title: artifactPlan.title, sections, out_path, template, artifactPlan })
  const finalPath = copyGeneratedFileIfNeeded(result, out_path)
  const artifact = store.addArtifact({
    id: store.genId('artifact_'),
    type: 'word',
    filename: result.filename,
    path: finalPath,
    title: artifactPlan.title,
    createdAt: new Date().toISOString(),
    metadata: { officePlan: artifactPlan }
  })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

async function generatePptxTool({ slides = [], out_path, template }) {
  const artifactPlan = planPresentationArtifact({
    prompt: promptFromSlides(slides),
    title: slides[0]?.title || 'Presentation'
  })
  const result = await generatePptx({ title: artifactPlan.title, slides, out_path, template, artifactPlan })
  const finalPath = copyGeneratedFileIfNeeded(result, out_path)
  const artifact = store.addArtifact({
    id: store.genId('artifact_'),
    type: 'ppt',
    filename: result.filename,
    path: finalPath,
    title: artifactPlan.title,
    createdAt: new Date().toISOString(),
    metadata: { officePlan: artifactPlan }
  })
  return { path: finalPath, bytes_written: fs.statSync(finalPath).size, artifact }
}

register({
  name: 'generate_docx',
  description: 'Generate a Word DOCX artifact and register it in AionUi artifacts.',
  parameters: {
    type: 'object',
    properties: {
      outline: { type: 'array' },
      out_path: { type: 'string' },
      template: { type: 'string' }
    },
    required: ['outline']
  }
}, generateDocxTool)

register({
  name: 'generate_pptx',
  description: 'Generate a PowerPoint PPTX artifact and register it in AionUi artifacts.',
  parameters: {
    type: 'object',
    properties: {
      slides: { type: 'array' },
      out_path: { type: 'string' },
      template: { type: 'string' }
    },
    required: ['slides']
  }
}, generatePptxTool)

module.exports = { generateDocxTool, generatePptxTool }
