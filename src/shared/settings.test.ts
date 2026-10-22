import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings, resolveStreamingKey } from './types'

describe('normalizeSettings', () => {
  it('defaults new installs to router.audio with STT-friendly mic flags', () => {
    const settings = normalizeSettings({})
    expect(settings.sttEngine).toBe('router-audio')
    expect(settings.noiseSuppression).toBe(false)
    expect(settings.autoGainControl).toBe(false)
    expect(settings.echoCancellation).toBe(true)
    expect(settings.inputGain).toBe(1)
    expect(settings.overlayTheme.core).toBe('iris')
    expect(settings.overlayTheme.bezel).toBe('ribbon')
  })

  it('keeps a custom overlay theme and drops unknown variants', () => {
    const settings = normalizeSettings({
      overlayTheme: { ...defaultSettings().overlayTheme, core: 'radar', bezel: 'nope' as never }
    })
    expect(settings.overlayTheme.core).toBe('radar')
    expect(settings.overlayTheme.bezel).toBe('ribbon')
  })

  it('keeps an explicit OpenRouter engine', () => {
    expect(normalizeSettings({ ...defaultSettings(), sttEngine: 'openrouter' }).sttEngine).toBe('openrouter')
  })

  it('clamps gain and unknown providers', () => {
    const settings = normalizeSettings({
      inputGain: 9,
      routerProvider: 'nope' as never
    })
    expect(settings.inputGain).toBe(2.4)
    expect(settings.routerProvider).toBe('auto')
  })
})

describe('resolveStreamingKey', () => {
  it('prefers the router.audio key', () => {
    expect(
      resolveStreamingKey({
        ...defaultSettings(),
        apiKey: 'sk-or-v1-openrouter',
        routerAudioKey: 'provider-key'
      })
    ).toBe('provider-key')
  })
})
