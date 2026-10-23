import { describe, expect, it } from 'vitest'
import { defaultHudSettings, hudWindowSize, normalizeHudSettings } from './hud'
import { defaultOverlayTheme } from './overlay-theme'

describe('HUD settings', () => {
  it('starts from the closest new style for an earlier skin', () => {
    expect(defaultHudSettings({ ...defaultOverlayTheme(), skin: 'cyberpunk' })).toMatchObject({
      style: 'cyber',
      accent: '#00f0ff'
    })
    expect(defaultHudSettings({ ...defaultOverlayTheme(), skin: 'glass' }).style).toBe('island')
  })

  it('rejects unknown styles, bad colors and out-of-range sizes', () => {
    const hud = normalizeHudSettings({
      style: 'neon' as never,
      accent: 'red',
      scale: 9,
      whileTalking: 'loud' as never
    })
    expect(hud).toMatchObject({ style: 'island', accent: '#a5e6ce', scale: 1.4, whileTalking: 'compact' })
    expect(normalizeHudSettings({ style: 'pixel', accent: '#ABCDEF' }).accent).toBe('#abcdef')
  })

  it('sizes the window to the style: full width for edge glow, capped to the display', () => {
    const hud = defaultHudSettings()
    expect(hudWindowSize({ ...hud, style: 'edge' }, 1920)).toEqual({ width: 1920, height: 460 })
    expect(hudWindowSize(hud, 640).width).toBe(640)
    expect(hudWindowSize({ ...hud, scale: 1.2 }, 1920)).toEqual({ width: 936, height: 552 })
  })
})
