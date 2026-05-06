const trustService = require('./trustService')
const signatureService = require('./signatureService')
const fs = require('fs')
const path = require('path')

let electronApp = null
try { electronApp = require('electron').app } catch { electronApp = null }

function builtinTemplatesRoot() {
  if (process.env.AGENTDEV_WORKFLOW_TEMPLATES_DIR) return process.env.AGENTDEV_WORKFLOW_TEMPLATES_DIR
  if (electronApp?.isPackaged) return path.join(process.resourcesPath, 'workflow-templates')
  return path.join(__dirname, '..', '..', 'resources', 'workflow-templates')
}

function assertManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error('invalid workflow template manifest schema')
  if (!Array.isArray(manifest.templates)) throw new Error('workflow template manifest templates are required')
}

async function fetchManifest(source, deps = {}) {
  if (source.enabled === false || source.trustState === 'blocked') return null
  if (source.url === 'builtin://workflow-templates/manifest.json') {
    const manifestPath = path.join(builtinTemplatesRoot(), 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    assertManifest(manifest)
    return { source, manifest, manifestSignatureState: signatureService.signatureState(manifest.signature, true) }
  }
  const fetchImpl = deps.fetch || global.fetch
  if (!fetchImpl) throw new Error('fetch is not available')
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), deps.timeoutMs || 1500) : null
  let response
  try {
    response = await fetchImpl(source.url, controller ? { signal: controller.signal } : undefined)
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (!response.ok) throw new Error(`failed to fetch workflow template manifest: ${response.status}`)
  const manifest = await response.json()
  assertManifest(manifest)
  const requiredSignature = source.trustState === 'official_trusted'
  const manifestSignatureState = signatureService.signatureState(manifest.signature, requiredSignature)
  if (requiredSignature && manifestSignatureState !== 'present') throw new Error('official workflow template manifest is missing required signature')
  return { source, manifest, manifestSignatureState }
}

async function listTemplates(deps = {}) {
  const templates = []
  const errors = []
  for (const source of trustService.listSources()) {
    try {
      const fetched = await fetchManifest(source, deps)
      if (!fetched) continue
      for (const template of fetched.manifest.templates) {
        templates.push({
          ...template,
          sourceId: source.sourceId,
          sourceName: source.name,
          sourceUrl: source.url,
          sourceTrustState: source.trustState,
          signatureState: signatureService.signatureState(template.signature, source.trustState === 'official_trusted')
        })
      }
    } catch (error) {
      errors.push({ sourceId: source.sourceId, message: error.message })
    }
  }
  return { templates, errors }
}

module.exports = { fetchManifest, listTemplates }
