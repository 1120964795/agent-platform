const config = require('./config')
const auth = require('./auth')
const conversations = require('./conversations')
const artifacts = require('./artifacts')
const files = require('./files')
const dialog = require('./dialog')
const chat = require('./chat')
const skills = require('./skills')
const rules = require('./rules')

const MODULES = [config, auth, conversations, artifacts, files, dialog, chat, skills, rules]

function registerAll(ipcMain, deps = {}) {
  for (const mod of MODULES) {
    mod.register(ipcMain, deps)
  }
}

module.exports = { registerAll }
