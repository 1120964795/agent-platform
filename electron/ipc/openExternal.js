const ALLOWED_PREFIXES = [
  'https://platform.deepseek.com',
  'https://chromewebstore.google.com',
]

function matchesAllowedPrefix(url, prefix) {
  const parsedUrl = new URL(url)
  const parsedPrefix = new URL(prefix)
  if (parsedUrl.origin !== parsedPrefix.origin) return false
  if (parsedPrefix.pathname === '/') return true
  return parsedUrl.pathname.startsWith(parsedPrefix.pathname)
}

function isAllowed(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_PREFIXES.some((prefix) => matchesAllowedPrefix(url, prefix))
  } catch {
    return false
  }
}

function getShell(deps = {}) {
  if (deps.shell) return deps.shell
  return require('electron').shell
}

function register(ipcMain, deps = {}) {
  ipcMain.handle('app:open-external', async (_evt, { url } = {}) => {
    if (!isAllowed(url)) throw new Error(`URL 不在允许列表中：${url}`)
    await getShell(deps).openExternal(url)
    return { ok: true }
  })
}

module.exports = { register, isAllowed }
