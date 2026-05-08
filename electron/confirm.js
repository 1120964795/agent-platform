const { dialog, BrowserWindow } = require('electron')
const { store } = require('./store')

let dialogProvider = defaultDialogProvider
const sessionAllowed = new Set()

function shellCommandKey(command = '') {
  return String(command).trim().split(/\s+/)[0].replace(/^['"]|['"]$/g, '').toLowerCase()
}

async function defaultDialogProvider({ kind, payload }) {
  const window = BrowserWindow?.getFocusedWindow?.()
  const detail = kind === 'shell-command'
    ? `Command:\n${payload.command}\n\nWorking directory:\n${payload.cwd || ''}`
    : kind === 'action-proposal'
      ? `Action:\n${payload.title || payload.type || ''}\n\nRisk: ${payload.risk || ''}\n\n${JSON.stringify(payload.payload || {}, null, 2)}`
    : JSON.stringify(payload, null, 2)
  const result = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'Confirm local action',
    message: `Allow ${kind}?`,
    detail,
    buttons: ['Allow', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    checkboxLabel: kind === 'shell-command' ? 'Do not ask again for this command this session' : undefined
  })
  return {
    allowed: result.response === 0,
    remember: Boolean(result.checkboxChecked)
  }
}

function setDialogProvider(fn) {
  dialogProvider = fn || defaultDialogProvider
  sessionAllowed.clear()
}

function clearConfirmCache() {
  sessionAllowed.clear()
}

async function requestConfirm({ kind, payload = {} }) {
  const config = store.getConfig()
  const cacheEnabled = config.session_confirm_cache_enabled !== false
  const key = kind === 'shell-command' ? shellCommandKey(payload.command) : ''
  if (cacheEnabled && key && sessionAllowed.has(key)) return true

  const response = await dialogProvider({ kind, payload })
  const allowed = typeof response === 'boolean' ? response : Boolean(response?.allowed)
  const remember = typeof response === 'object' && Boolean(response.remember)
  if (allowed && remember && cacheEnabled && key) sessionAllowed.add(key)
  return allowed
}

async function requestActionConfirm(action) {
  return requestConfirm({ kind: 'action-proposal', payload: action })
}

module.exports = { requestConfirm, requestActionConfirm, setDialogProvider, clearConfirmCache, shellCommandKey }
