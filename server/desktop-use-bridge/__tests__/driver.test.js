import { describe, expect, test, vi } from 'vitest'
import { createDriver } from '../driver'

function pngWithSize(width, height) {
  const buf = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

function jpegWithSize(width, height) {
  const buf = Buffer.alloc(17)
  buf[0] = 0xff
  buf[1] = 0xd8
  buf[2] = 0xff
  buf[3] = 0xc0
  buf.writeUInt16BE(11, 4)
  buf[6] = 8
  buf.writeUInt16BE(height, 7)
  buf.writeUInt16BE(width, 9)
  buf[11] = 1
  buf[12] = 1
  buf[13] = 0x11
  buf[14] = 0
  buf[15] = 0xff
  buf[16] = 0xd9
  return buf
}

function createNutjs() {
  const moved = []
  const pressed = []
  const released = []
  class Point {
    constructor(x, y) {
      this.x = x
      this.y = y
    }
  }

  return {
    moved,
    pressed,
    released,
    Point,
    Key: {
      A: 'Key.A',
      Backspace: 'Key.Backspace',
      LeftAlt: 'Key.LeftAlt',
      LeftControl: 'Key.LeftControl',
      LeftShift: 'Key.LeftShift',
      LeftMeta: 'Key.LeftMeta',
      Enter: 'Key.Enter',
      Tab: 'Key.Tab',
    },
    straightTo: (point) => point,
    screen: {
      width: vi.fn(async () => 2048),
      height: vi.fn(async () => 1152),
    },
    mouse: {
      move: vi.fn(async (point) => moved.push(point)),
      leftClick: vi.fn(async () => undefined),
      rightClick: vi.fn(async () => undefined),
      scroll: vi.fn(async () => undefined),
    },
    keyboard: {
      type: vi.fn(async () => undefined),
      pressKey: vi.fn(async (key) => pressed.push(key)),
      releaseKey: vi.fn(async (key) => released.push(key)),
    },
  }
}

describe('desktop-use driver coordinate scaling', () => {
  test('maps screenshot pixel coordinates to nut-js screen coordinates after observe', async () => {
    const nutjs = createNutjs()
    const driver = createDriver({
      nutjs,
      screenshotImpl: async () => pngWithSize(2560, 1440),
    })

    const observed = await driver.observe()
    const clicked = await driver.click({ x: 900, y: 1300 })

    expect(observed.screen).toMatchObject({
      width: 2560,
      height: 1440,
      scaleFactor: 1.25,
      nativeWidth: 2048,
      nativeHeight: 1152,
    })
    expect(nutjs.moved[0]).toMatchObject({ x: 720, y: 1040 })
    expect(clicked.action).toMatchObject({
      type: 'click',
      x: 900,
      y: 1300,
      nativeX: 720,
      nativeY: 1040,
    })
  })

  test('detects screenshot dimensions from jpeg buffers', async () => {
    const nutjs = createNutjs()
    const driver = createDriver({
      nutjs,
      screenshotImpl: async () => jpegWithSize(2560, 1440),
    })

    const observed = await driver.observe()
    await driver.click({ x: 1000, y: 1308 })

    expect(observed.mime).toBe('image/jpeg')
    expect(observed.screen).toMatchObject({ width: 2560, height: 1440, scaleFactor: 1.25 })
    expect(nutjs.moved[0]).toMatchObject({ x: 800, y: 1046 })
  })

  test('maps common hotkey aliases to nut-js key constants', async () => {
    const nutjs = createNutjs()
    const driver = createDriver({ nutjs, screenshotImpl: async () => pngWithSize(2560, 1440) })

    await driver.hotkey({ keys: ['CTRL', 'A'] })
    await driver.hotkey({ keys: ['BACKSPACE'] })

    expect(nutjs.pressed).toEqual(['Key.LeftControl', 'Key.A', 'Key.Backspace'])
    expect(nutjs.released).toEqual(['Key.A', 'Key.LeftControl', 'Key.Backspace'])
  })
})
