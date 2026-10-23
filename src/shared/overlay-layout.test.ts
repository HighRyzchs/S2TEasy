import { describe, expect, it } from 'vitest'
import { overlayCoordinates } from './overlay-layout'
import { OVERLAY_POSITIONS } from './types'

describe('overlay placement', () => {
  it('applies custom offsets and clamps to the display work area', () => {
    const area = { x: -1000, y: -200, width: 1000, height: 800 },
      size = { width: 500, height: 100 }
    expect(overlayCoordinates(area, size, 'center', { x: 100, y: -50 })).toEqual({
      x: -650,
      y: 100
    })
    expect(overlayCoordinates(area, size, 'center', { x: 9000, y: -9000 })).toEqual({
      x: -500,
      y: -200
    })
  })

  it('keeps every placement inside a display with negative coordinates', () => {
    const area = { x: -1920, y: -200, width: 1920, height: 1040 }
    for (const position of OVERLAY_POSITIONS) {
      const p = overlayCoordinates(area, { width: 496, height: 104 }, position)
      expect(p.x).toBeGreaterThanOrEqual(area.x)
      expect(p.x + 496).toBeLessThanOrEqual(area.x + area.width)
      expect(p.y).toBeGreaterThanOrEqual(area.y)
      expect(p.y + 104).toBeLessThanOrEqual(area.y + area.height)
    }
    expect(overlayCoordinates(area, { width: 176, height: 284 }, 'right')).toEqual({
      x: -196,
      y: 178
    })
  })
})
