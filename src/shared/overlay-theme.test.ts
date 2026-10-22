import { describe, expect, it } from 'vitest'
import {
  defaultOverlayTheme,
  hexToHsl,
  hslToHex,
  normalizeOverlayTheme,
  overlayThemeLabel
} from './overlay-theme'

describe('normalizeOverlayTheme', () => {
  it('keeps the mixer default', () => {
    const theme = defaultOverlayTheme()
    expect(theme.core).toBe('iris')
    expect(theme.wave).toBe('ribbon')
    expect(theme.bezel).toBe('ribbon')
    expect(overlayThemeLabel(theme)).toBe('Iris · Ribbon · Signal Ribbon')
  })

  it('rejects unknown variants and clamps color', () => {
    const theme = normalizeOverlayTheme({
      core: 'square' as never,
      waveHue: 400,
      bezelAlpha: 9
    })
    expect(theme.core).toBe('iris')
    expect(theme.waveHue).toBe(40)
    expect(theme.bezelAlpha).toBe(0.62)
  })
})

describe('hsl hex round-trip', () => {
  it('converts cyan-ish hsl to a hex and back', () => {
    const hex = hslToHex(190, 85, 72)
    expect(hex.startsWith('#')).toBe(true)
    const hsl = hexToHsl(hex)
    expect(hsl.h).toBeGreaterThan(170)
    expect(hsl.h).toBeLessThan(210)
  })
})
