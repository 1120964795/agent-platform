function normalizeArtifactTitle(rawTitle = '') {
  const cleaned = String(rawTitle || 'Untitled artifact')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled artifact'
  return {
    title: cleaned,
    filenameStem: cleaned.replace(/\s+/g, '-')
  }
}

function inferDocumentType(prompt = '') {
  const text = String(prompt || '').toLowerCase()
  if (/\breport\b|analysis|summary|findings|research/.test(text)) return 'report'
  if (/study|notes|review|exam|course|lesson/.test(text)) return 'study-notes'
  if (/proposal|plan|pitch|roadmap|project/.test(text)) return 'proposal'
  return 'general-document'
}

function planDocumentArtifact({ prompt = '', title = '' } = {}) {
  const normalized = normalizeArtifactTitle(title || prompt)
  const documentType = inferDocumentType(prompt || title)
  return {
    kind: 'word',
    documentType,
    title: normalized.title,
    filenameStem: normalized.filenameStem,
    style: {
      language: 'zh-CN',
      headingSystem: 'numbered-clear',
      tableTreatment: 'spacious-repeat-header',
      bodyDensity: documentType === 'study-notes' ? 'medium' : 'balanced'
    },
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        purpose: 'State the document goal, audience, scope, and expected reader outcome.'
      },
      {
        id: 'body',
        title: 'Main Content',
        purpose: 'Organize evidence into clear headings, tables, and concise paragraphs.'
      },
      {
        id: 'summary',
        title: 'Summary',
        purpose: 'Close with conclusions, next steps, or review checkpoints.'
      }
    ],
    qualityChecks: [
      'heading-hierarchy',
      'table-spacing',
      'page-breaks',
      'font-fallback',
      'artifact-registration'
    ]
  }
}

function planPresentationArtifact({ prompt = '', title = '' } = {}) {
  const normalized = normalizeArtifactTitle(title || prompt)
  return {
    kind: 'ppt',
    title: normalized.title,
    filenameStem: normalized.filenameStem,
    narrative: {
      thesis: 'Each slide should do one job and move the audience toward a decision or shared understanding.',
      density: 'live-presentation'
    },
    slideJobs: [
      { id: 'cover', job: 'Name the topic and orient the audience.' },
      { id: 'context', job: 'Explain why the topic matters now.' },
      { id: 'evidence', job: 'Show editable evidence such as tables, charts, or structured comparisons.' },
      { id: 'closing', job: 'Summarize the decision, recommendation, or next action.' }
    ],
    qualityChecks: [
      'one-job-per-slide',
      'editable-tables-or-charts',
      'text-fit',
      'visual-preview',
      'artifact-registration'
    ]
  }
}

module.exports = {
  inferDocumentType,
  normalizeArtifactTitle,
  planDocumentArtifact,
  planPresentationArtifact
}
