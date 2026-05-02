import { test, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { normalizeRegionSelection, getVirtualBounds } = require('../services/diagnostics/regionSelectionService')

test('region selection normalizes bounds to display coordinates', () => {
  const result = normalizeRegionSelection({
    startX: 30,
    startY: 40,
    endX: 260,
    endY: 160
  }, {
    x: 100,
    y: 200
  }, {
    id: 'display_1',
    scaleFactor: 1
  })

  expect(result).toEqual({
    ok: true,
    region: {
      type: 'region',
      displayId: 'display_1',
      x: 130,
      y: 240,
      width: 230,
      height: 120,
      scaleFactor: 1
    }
  })
})

test('region selection rejects tiny selections and calculates virtual bounds', () => {
  expect(normalizeRegionSelection({
    startX: 0,
    startY: 0,
    endX: 100,
    endY: 40
  }, { x: 0, y: 0 }, { id: 1, scaleFactor: 1 })).toMatchObject({
    ok: false,
    error: { code: 'REGION_TOO_SMALL' }
  })

  expect(getVirtualBounds([
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    { bounds: { x: 1920, y: 0, width: 1920, height: 1080 } }
  ])).toEqual({
    x: 0,
    y: 0,
    width: 3840,
    height: 1080
  })
})
