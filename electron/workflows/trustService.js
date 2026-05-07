const { store } = require('../store')

const OFFICIAL_SOURCE = {
  sourceId: 'official',
  name: 'AionUi Official Workflow Templates',
  url: 'builtin://workflow-templates/manifest.json',
  trustState: 'official_trusted',
  signatureState: 'required',
  enabled: true
}

function data() {
  const current = store.getData()
  current.workflowTemplateSources = current.workflowTemplateSources || [OFFICIAL_SOURCE]
  let changed = false
  const official = current.workflowTemplateSources.find((source) => source.sourceId === OFFICIAL_SOURCE.sourceId)
  if (official) {
    const nextOfficial = { ...OFFICIAL_SOURCE, enabled: official.enabled !== false }
    changed = JSON.stringify(official) !== JSON.stringify(nextOfficial)
    Object.assign(official, nextOfficial)
  } else {
    current.workflowTemplateSources.unshift(OFFICIAL_SOURCE)
    changed = true
  }
  current.workflowImportConfirmations = current.workflowImportConfirmations || []
  if (changed) save(current)
  return current
}

function save(next) {
  store.saveData(next)
}

function listSources() {
  return data().workflowTemplateSources
}

function assertHttps(url) {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('workflow template source must use HTTPS')
}

function addSource(payload = {}) {
  assertHttps(payload.url)
  const next = data()
  const source = {
    sourceId: payload.sourceId || `community_${Date.now()}`,
    name: payload.name || payload.url,
    url: payload.url,
    trustState: payload.trustState || 'untrusted',
    signatureState: payload.signatureState || 'unsigned',
    enabled: payload.enabled !== false,
    addedAt: new Date().toISOString()
  }
  next.workflowTemplateSources = next.workflowTemplateSources.filter((item) => item.sourceId !== source.sourceId)
  next.workflowTemplateSources.push(source)
  save(next)
  return source
}

function updateTrust(sourceId, patch = {}) {
  const next = data()
  const source = next.workflowTemplateSources.find((item) => item.sourceId === sourceId)
  if (!source) throw new Error(`template source not found: ${sourceId}`)
  Object.assign(source, {
    trustState: patch.trustState || source.trustState,
    signatureState: patch.signatureState || source.signatureState,
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : source.enabled
  })
  save(next)
  return source
}

function recordImportConfirmation(entry = {}) {
  const next = data()
  const record = { ...entry, confirmedAt: new Date().toISOString() }
  next.workflowImportConfirmations.unshift(record)
  save(next)
  return record
}

module.exports = { OFFICIAL_SOURCE, listSources, addSource, updateTrust, recordImportConfirmation }
