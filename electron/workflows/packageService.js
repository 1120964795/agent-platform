const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const JSZip = require('jszip')
const registry = require('./registry')
const { validateDraft, calculateRiskSummary, isAllowedPackageFile, isForbiddenPackageFile, normalizePackagePath } = require('./schema')
const { workflowDir, ensureDir } = require('./storage')

const MAX_PACKAGE_BYTES = 5 * 1024 * 1024

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function listFilesRecursive(root) {
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...listFilesRecursive(fullPath))
    else result.push(fullPath)
  }
  return result
}

async function createPackageFromDirectory(sourceDir, packagePath) {
  const zip = new JSZip()
  for (const filePath of listFilesRecursive(sourceDir)) {
    const relative = normalizePackagePath(path.relative(sourceDir, filePath))
    zip.file(relative, fs.readFileSync(filePath))
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  ensureDir(path.dirname(packagePath))
  fs.writeFileSync(packagePath, buffer)
  return { packagePath, sizeBytes: buffer.length, sha256: sha256(buffer) }
}

async function exportWorkflow(workflowId, version = null) {
  const { workflow, version: versionRecord, skillMarkdown } = registry.getWorkflow(workflowId, version)
  const exportDir = path.join(workflowDir(workflowId), 'exports')
  ensureDir(exportDir)
  const packagePath = path.join(exportDir, `${workflowId}-${versionRecord.version}.aionworkflow`)
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({
    schemaVersion: 1,
    workflowId,
    name: workflow.name,
    version: versionRecord.version,
    exportedAt: new Date().toISOString()
  }, null, 2))
  zip.file('workflow.json', JSON.stringify({ ...workflow, exportedVersion: versionRecord.version, steps: versionRecord.steps }, null, 2))
  zip.file('SKILL.md', skillMarkdown)
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(packagePath, buffer)
  return { packagePath, sizeBytes: buffer.length, sha256: sha256(buffer) }
}

async function readPackage(packagePath) {
  const stat = fs.statSync(packagePath)
  if (stat.size > MAX_PACKAGE_BYTES) throw new Error('workflow package exceeds 5MB limit')
  const buffer = fs.readFileSync(packagePath)
  const zip = await JSZip.loadAsync(buffer)
  const files = []
  for (const fileName of Object.keys(zip.files)) {
    const entry = zip.files[fileName]
    if (entry.dir) continue
    const normalized = normalizePackagePath(fileName)
    if (isForbiddenPackageFile(normalized)) throw new Error(`forbidden package file: ${normalized}`)
    if (!isAllowedPackageFile(normalized)) throw new Error(`package file is not allowed: ${normalized}`)
    files.push(normalized)
  }
  if (!files.includes('workflow.json')) throw new Error('workflow.json is required')
  if (!files.includes('SKILL.md')) throw new Error('SKILL.md is required')
  return { zip, files, sizeBytes: stat.size, sha256: sha256(buffer) }
}

async function readText(zip, fileName) {
  const entry = zip.file(fileName)
  return entry ? entry.async('string') : ''
}

async function previewPackage(packagePath, context = {}) {
  const pkg = await readPackage(packagePath)
  const workflowRaw = JSON.parse(await readText(pkg.zip, 'workflow.json'))
  const steps = workflowRaw.steps || []
  const draft = validateDraft({
    ...workflowRaw,
    name: workflowRaw.name,
    description: workflowRaw.description,
    steps
  })
  const riskSummary = calculateRiskSummary(draft.steps)
  return {
    packagePath,
    sourceUrl: context.sourceUrl || null,
    sourceTrustState: context.sourceTrustState || 'untrusted',
    signatureState: context.signatureState || 'unsigned',
    sizeBytes: pkg.sizeBytes,
    sha256: pkg.sha256,
    files: pkg.files,
    workflow: {
      id: workflowRaw.id,
      name: draft.name,
      description: draft.description,
      version: workflowRaw.exportedVersion || workflowRaw.currentVersion || '1.0.0',
      technologyStack: draft.technologyStack,
      steps: draft.steps
    },
    commands: draft.steps.filter((step) => step.command).map((step) => ({ stepId: step.id, command: step.command, cwd: step.cwd || null, riskLevel: step.riskLevel })),
    riskSummary,
    hasPatchStep: riskSummary.hasPatchStep,
    hasStartService: riskSummary.hasStartService,
    requiresStrongConfirmation: context.sourceTrustState !== 'official_trusted' || context.signatureState !== 'verified'
  }
}

async function importPackage(packagePath, options = {}) {
  if (!options.trusted) throw new Error('trusted confirmation is required before import')
  const preview = await previewPackage(packagePath, options)
  return registry.saveDraft({
    ...preview.workflow,
    source: { kind: 'imported_package', packagePath, sourceUrl: options.sourceUrl || null },
    status: 'enabled'
  }, { changelog: `Imported ${preview.workflow.version}.` })
}

module.exports = {
  MAX_PACKAGE_BYTES,
  createPackageFromDirectory,
  exportWorkflow,
  previewPackage,
  importPackage
}
