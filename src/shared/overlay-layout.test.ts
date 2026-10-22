import { describe, expect, it } from 'vitest'
import { overlayCoordinates, overlaySize } from './overlay-layout'
import { defaultOverlayTheme } from './overlay-theme'
import { OVERLAY_POSITIONS } from './types'

describe('overlay placement', () => {
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
  it('allocates enough space for a scaled vertical overlay', () => {
    const size = overlaySize({ ...defaultOverlayTheme(), orientation: 'vertical', scale: 1.4 })
    expect(size.height).toBeGreaterThan(size.width)
    expect(size.width).toBeGreaterThanOrEqual(144 * 1.4 + 16)
    expect(size.height).toBeGreaterThanOrEqual(252 * 1.4 + 16)
  })
})
