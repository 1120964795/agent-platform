function createDriver(deps = {}) {
  const screenshotImpl = deps.screenshotImpl || (async () => {
    const screenshot = require('screenshot-desktop')
    return await screenshot()
  })
  const nutjs = deps.nutjs || require('@nut-tree-fork/nut-js')

  function point(x, y) {
    return new nutjs.Point(Math.round(x), Math.round(y))
  }

  return {
    async observe() {
      const buf = await screenshotImpl()
      return {
        screenshotBase64: Buffer.from(buf).toString('base64'),
        mime: 'image/png',
        screen: { width: 0, height: 0, scaleFactor: 1 }
      }
    },

    async click({ x, y, button = 'left' }) {
      await nutjs.mouse.move(nutjs.straightTo(point(x, y)))
      if (button === 'right') await nutjs.mouse.rightClick()
      else await nutjs.mouse.leftClick()
      return { ok: true, action: { type: 'click', x, y, button } }
    },

    async type({ text }) {
      await nutjs.keyboard.type(String(text ?? ''))
      return { ok: true, action: { type: 'type', text } }
    },

    async hotkey({ keys }) {
      const normalized = keys.map((key) => String(key).trim()).filter(Boolean)
      for (const key of normalized) await nutjs.keyboard.pressKey(key)
      for (const key of [...normalized].reverse()) await nutjs.keyboard.releaseKey(key)
      return { ok: true, action: { type: 'hotkey', keys: normalized } }
    },

    async scroll({ x = 0, y = 0, direction = 'down', amount = 3 }) {
      await nutjs.mouse.move(nutjs.straightTo(point(x, y)))
      const delta = direction === 'up' ? Math.abs(amount) : -Math.abs(amount)
      await nutjs.mouse.scroll(delta)
      return { ok: true, action: { type: 'scroll', x, y, direction, amount } }
    },

    async wait({ ms = 500 }) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
      return { ok: true, action: { type: 'wait', ms } }
    }
  }
}

module.exports = { createDriver }
