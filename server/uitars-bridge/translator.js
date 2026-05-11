const NOT_IMPL = new Set(['mouse.scroll', 'mouse.move', 'keyboard.key'])

function classify(action) {
  if (NOT_IMPL.has(action.type)) return { backend: 'not-implemented', reason: `${action.type} not in v1` }
  if (action.type === 'screen.observe') return { backend: 'screenshot' }
  if (action.type === 'mouse.click') {
    return { backend: 'semantic-click', instruction: String(action.payload?.target || '') }
  }
  if (action.type === 'keyboard.type') {
    return { backend: 'direct-type', text: String(action.payload?.text ?? '') }
  }
  return { backend: 'unknown', reason: `Unsupported ${action.type}` }
}

module.exports = { classify }
