const fs = require('fs')
const path = require('path')
const { store } = require('../store')

function workflowSkillsRoot() {
  if (process.env.AGENTDEV_WORKFLOW_SKILLS_DIR) return process.env.AGENTDEV_WORKFLOW_SKILLS_DIR
  return path.join(path.dirname(store.DATA_DIR), 'workflow-skills')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8')
}

function workflowDir(workflowId) {
  return path.join(workflowSkillsRoot(), workflowId)
}

function workflowPath(workflowId) {
  return path.join(workflowDir(workflowId), 'workflow.json')
}

function versionPath(workflowId, version) {
  return path.join(workflowDir(workflowId), 'versions', `${version}.json`)
}

function runPath(workflowId, runId) {
  return path.join(workflowDir(workflowId), 'runs', `${runId}.json`)
}

module.exports = {
  workflowSkillsRoot,
  ensureDir,
  readJson,
  writeJson,
  workflowDir,
  workflowPath,
  versionPath,
  runPath
}
