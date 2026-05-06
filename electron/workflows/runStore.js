const fs = require('fs')
const path = require('path')
const { workflowSkillsRoot, workflowDir, runPath, readJson, writeJson } = require('./storage')

function saveRun(run) {
  writeJson(runPath(run.workflowId, run.runId), run)
  return run
}

function getRun(workflowId, runId) {
  const filePath = runPath(workflowId, runId)
  if (!fs.existsSync(filePath)) throw new Error(`workflow run not found: ${runId}`)
  return readJson(filePath)
}

function findRun(runId) {
  const workflowsRoot = workflowSkillsRoot()
  if (!fs.existsSync(workflowsRoot)) throw new Error(`workflow run not found: ${runId}`)
  for (const workflowId of fs.readdirSync(workflowsRoot)) {
    const filePath = runPath(workflowId, runId)
    if (fs.existsSync(filePath)) return readJson(filePath)
  }
  throw new Error(`workflow run not found: ${runId}`)
}

function listRuns(workflowId) {
  const runsDir = path.join(workflowDir(workflowId), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(path.join(runsDir, file)))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
}

module.exports = { saveRun, getRun, findRun, listRuns }
