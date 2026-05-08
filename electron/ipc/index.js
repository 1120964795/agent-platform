const config = require('./config')
const conversations = require('./conversations')
const artifacts = require('./artifacts')
const files = require('./files')
const dialog = require('./dialog')
const chat = require('./chat')
const skills = require('./skills')
const rules = require('./rules')
const runtime = require('./runtime')
const actions = require('./actions')
const audit = require('./audit')
const outputs = require('./outputs')

const MODULES = [config, conversations, artifacts, files, dialog, chat, skills, rules, runtime, actions, audit, outputs]

function registerAll(ipcMain, deps = {}) {
  for (const mod of MODULES) {
    mod.register(ipcMain, deps)
  }
}

module.exports = { registerAll }
