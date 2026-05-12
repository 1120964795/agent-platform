function parseScheduledTaskArg(argv = process.argv) {
  const index = argv.indexOf('--run-scheduled-task')
  if (index === -1) return ''
  return String(argv[index + 1] || '')
}

function createConversationOpener(getWindow) {
  return function openConversation(conversationId) {
    const win = getWindow()
    if (!win || win.isDestroyed?.()) return
    win.show?.()
    win.focus?.()
    win.webContents?.send?.('app:open-conversation', { conversationId })
  }
}

module.exports = { parseScheduledTaskArg, createConversationOpener }
