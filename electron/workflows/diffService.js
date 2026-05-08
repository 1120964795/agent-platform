const registry = require('./registry')

function stableStep(step) {
  const copy = { ...step }
  delete copy.temporary
  return copy
}

function diffFields(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  const changes = []
  for (const field of fields) {
    const left = JSON.stringify(before?.[field])
    const right = JSON.stringify(after?.[field])
    if (left !== right) changes.push({ field, before: before?.[field], after: after?.[field] })
  }
  return changes
}

function diffVersions(workflowId, fromVersion, toVersion) {
  const from = registry.readVersion(workflowId, fromVersion)
  const to = registry.readVersion(workflowId, toVersion)
  const fromById = new Map(from.steps.map((step, index) => [step.id, { step, index }]))
  const toById = new Map(to.steps.map((step, index) => [step.id, { step, index }]))
  const changes = []

  for (const { step } of toById.values()) {
    if (!fromById.has(step.id)) changes.push({ type: 'step_added', stepId: step.id, title: step.title })
  }
  for (const { step } of fromById.values()) {
    if (!toById.has(step.id)) changes.push({ type: 'step_removed', stepId: step.id, title: step.title })
  }
  for (const [stepId, current] of toById.entries()) {
    const previous = fromById.get(stepId)
    if (!previous) continue
    const fieldChanges = diffFields(stableStep(previous.step), stableStep(current.step))
    if (fieldChanges.length) changes.push({ type: 'step_modified', stepId, title: current.step.title, fieldChanges })
    if (previous.index !== current.index) changes.push({ type: 'step_reordered', stepId, title: current.step.title, beforeIndex: previous.index, afterIndex: current.index })
  }

  return { workflowId, fromVersion, toVersion, changes }
}

module.exports = { diffVersions }
