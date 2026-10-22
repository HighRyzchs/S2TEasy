import { describe, expect, it } from 'vitest'
import { WAVEFORM_BARS } from './constants'
import { bandsFromPcm, composeOverlayBars, lerpBars } from './waveform'

describe('waveform', () => {
  it('maps louder windows higher than silence', () => {
    const samples = new Float32Array(240)
    for (let i = 180; i < 240; i++) samples[i] = 0.4
    const bands = bandsFromPcm(samples, 4)
    expect(bands[3] ?? 0).toBeGreaterThan(bands[0] ?? 1)
  })

  it('lerps toward the target without overshooting', () => {
    const next = lerpBars([0, 1], [1, 0], 0.25)
    expect(next[0]).toBeCloseTo(0.25)
    expect(next[1]).toBeCloseTo(0.75)
  })

  it('keeps composed bars in 0-1', () => {
    let current = new Array(WAVEFORM_BARS).fill(0.4)
    for (let i = 0; i < 12; i++) {
      current = composeOverlayBars({
        status: 'listening',
        target: new Array(WAVEFORM_BARS).fill(0.9),
        current,
        t: i * 0.2,
        rms: 0.12
      })
      for (const value of current) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})
