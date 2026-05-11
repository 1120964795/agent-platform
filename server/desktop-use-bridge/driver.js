function createDriver(deps = {}) {
  const screenshotImpl = deps.screenshotImpl || (async () => {
    const screenshot = require('screenshot-desktop')
    return await screenshot()
  })
  const nutjs = deps.nutjs || require('@nut-tree-fork/nut-js')
  let screen = {
    width: 0,
    height: 0,
    scaleFactor: 1,
    nativeWidth: 0,
    nativeHeight: 0
  }

  function readPngSize(buf) {
    const isPng = Buffer.isBuffer(buf)
      && buf.length >= 24
      && buf[0] === 0x89
      && buf[1] === 0x50
      && buf[2] === 0x4e
      && buf[3] === 0x47
      && buf.toString('ascii', 12, 16) === 'IHDR'
    if (!isPng) return { width: 0, height: 0 }
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    }
  }

  function readJpegSize(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 11 || buf[0] !== 0xff || buf[1] !== 0xd8) {
      return { width: 0, height: 0 }
    }
    const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
    let offset = 2
    while (offset < buf.length - 1) {
      while (offset < buf.length && buf[offset] !== 0xff) offset += 1
      while (offset < buf.length && buf[offset] === 0xff) offset += 1
      if (offset >= buf.length) break

      const marker = buf[offset]
      offset += 1
      if (marker === 0xd9 || marker === 0xda) break
      if (offset + 1 >= buf.length) break

      const length = buf.readUInt16BE(offset)
      if (length < 2 || offset + length > buf.length) break
      if (startOfFrameMarkers.has(marker) && length >= 7) {
        return {
          height: buf.readUInt16BE(offset + 3),
          width: buf.readUInt16BE(offset + 5)
        }
      }
      offset += length
    }
    return { width: 0, height: 0 }
  }

  function readImageSize(buf) {
    const png = readPngSize(buf)
    if (png.width && png.height) return png
    const jpeg = readJpegSize(buf)
    if (jpeg.width && jpeg.height) return jpeg
    return { width: 0, height: 0 }
  }

  function detectMime(buf) {
    if (Buffer.isBuffer(buf) && buf.length >= 4) {
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
      if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
    }
    return 'application/octet-stream'
  }

  function validDimensions(size) {
    const width = Number(size.width)
    const height = Number(size.height)
    return {
      width: Number.isFinite(width) && width > 0 ? width : 0,
      height: Number.isFinite(height) && height > 0 ? height : 0
    }
  }

  async function readNativeScreen() {
    const width = typeof nutjs.screen?.width === 'function' ? Number(await nutjs.screen.width()) : 0
    const height = typeof nutjs.screen?.height === 'function' ? Number(await nutjs.screen.height()) : 0
    return {
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0
    }
  }

  function rounded(value, fallback = 1) {
    if (!Number.isFinite(value) || value <= 0) return fallback
    return Math.round(value * 1000) / 1000
  }

  async function updateScreen(buf) {
    const image = validDimensions(readImageSize(buf))
    const native = await readNativeScreen()
    const scaleX = image.width && native.width ? image.width / native.width : 1
    const scaleY = image.height && native.height ? image.height / native.height : scaleX
    screen = {
      width: image.width,
      height: image.height,
      scaleFactor: rounded((scaleX + scaleY) / 2),
      nativeWidth: native.width,
      nativeHeight: native.height,
      scaleX: rounded(scaleX),
      scaleY: rounded(scaleY)
    }
    return screen
  }

  function toNative(value, axis) {
    const scale = axis === 'y' ? screen.scaleY || screen.scaleFactor : screen.scaleX || screen.scaleFactor
    return Math.round(Number(value) / (scale || 1))
  }

  function keyFor(raw) {
    const key = String(raw || '').trim()
    const normalized = key.toLowerCase().replace(/[\s_-]/g, '')
    const aliases = {
      ctrl: 'LeftControl',
      control: 'LeftControl',
      leftctrl: 'LeftControl',
      leftcontrol: 'LeftControl',
      alt: 'LeftAlt',
      leftalt: 'LeftAlt',
      shift: 'LeftShift',
      leftshift: 'LeftShift',
      cmd: 'LeftMeta',
      command: 'LeftMeta',
      meta: 'LeftMeta',
      win: 'LeftMeta',
      windows: 'LeftMeta',
      super: 'LeftMeta',
      enter: 'Enter',
      return: 'Enter',
      tab: 'Tab',
      esc: 'Escape',
      escape: 'Escape',
      space: 'Space',
      spacebar: 'Space',
      backspace: 'Backspace',
      delete: 'Delete',
      del: 'Delete',
      up: 'Up',
      down: 'Down',
      left: 'Left',
      right: 'Right',
    }
    const candidate = aliases[normalized] || key
    return nutjs.Key?.[candidate] || nutjs.Key?.[candidate.toUpperCase?.()] || candidate
  }

  function point(x, y) {
    return new nutjs.Point(toNative(x, 'x'), toNative(y, 'y'))
  }

  return {
    async observe() {
      const buf = await screenshotImpl()
      const observedScreen = await updateScreen(buf)
      return {
        screenshotBase64: Buffer.from(buf).toString('base64'),
        mime: detectMime(buf),
        screen: observedScreen
      }
    },

    async click({ x, y, button = 'left' }) {
      const nativeX = toNative(x, 'x')
      const nativeY = toNative(y, 'y')
      await nutjs.mouse.move(nutjs.straightTo(new nutjs.Point(nativeX, nativeY)))
      if (button === 'right') await nutjs.mouse.rightClick()
      else await nutjs.mouse.leftClick()
      return { ok: true, action: { type: 'click', x, y, nativeX, nativeY, button } }
    },

    async type({ text }) {
      await nutjs.keyboard.type(String(text ?? ''))
      return { ok: true, action: { type: 'type', text } }
    },

    async hotkey({ keys }) {
      const normalized = keys.map((key) => String(key).trim()).filter(Boolean).map(keyFor)
      for (const key of normalized) await nutjs.keyboard.pressKey(key)
      for (const key of [...normalized].reverse()) await nutjs.keyboard.releaseKey(key)
      return { ok: true, action: { type: 'hotkey', keys: normalized } }
    },

    async scroll({ x = 0, y = 0, direction = 'down', amount = 3 }) {
      await nutjs.mouse.move(nutjs.straightTo(point(x, y)))
      const delta = direction === 'up' ? Math.abs(amount) : -Math.abs(amount)
      await nutjs.mouse.scroll(delta)
      return { ok: true, action: { type: 'scroll', x, y, nativeX: toNative(x, 'x'), nativeY: toNative(y, 'y'), direction, amount } }
    },

    async wait({ ms = 500 }) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
      return { ok: true, action: { type: 'wait', ms } }
    }
  }
}

module.exports = { createDriver }
