import { describe, expect, it } from 'vitest'
import {
  defaultOverlayTheme,
  hexToHsl,
  hslToHex,
  normalizeOverlayTheme,
  overlayThemeLabel
} from './overlay-theme'

describe('normalizeOverlayTheme', () => {
  it('defaults to a minimal pill while preserving the studio mixer', () => {
    const theme = defaultOverlayTheme()
    expect(theme.core).toBe('iris')
    expect(theme.wave).toBe('ribbon')
    expect(theme.bezel).toBe('ribbon')
    expect(theme.skin).toBe('minimal')
    expect(theme.showTranscript).toBe(true)
    expect(overlayThemeLabel(theme)).toBe('Ink · Live transcript')
    expect(overlayThemeLabel({ ...theme, skin: 'studio' })).toBe('Iris · Ribbon · Signal Ribbon')
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

describe('saved custom overlay images', () => {
  it('keeps bounded raster images while rejecting executable or remote assets', () => {
    expect(
      normalizeOverlayTheme({ assetDataUrl: 'data:image/png;base64,aGVsbG8=' }).assetDataUrl
    ).toContain('image/png')
    for (const assetDataUrl of [
      'https://example.com/logo.png',
      'file:///private/photo.png',
      'data:image/svg+xml;base64,AAAA',
      'data:image/png;base64,' + 'A'.repeat(2_000_000)
    ])
      expect(normalizeOverlayTheme({ assetDataUrl }).assetDataUrl).toBe('')
  })
})
