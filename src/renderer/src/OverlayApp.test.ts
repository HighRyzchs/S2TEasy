import { describe, expect, it } from 'vitest'
import { WAVEFORM_BARS } from '@shared/constants'
import { composeOverlayBars } from '@shared/waveform'
import { formatElapsed } from './OverlayApp'

describe('formatElapsed', () => {
  it('formats seconds as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(4200)).toBe('0:04')
    expect(formatElapsed(72_000)).toBe('1:12')
  })
})

describe('overlay bars', () => {
  it('stays in 0-1 while listening and finishing', () => {
    let current = new Array(WAVEFORM_BARS).fill(0.2)
    for (const status of ['listening', 'transcribing', 'success', 'error'] as const) {
      current = composeOverlayBars({
        status,
        target: new Array(WAVEFORM_BARS).fill(0.7),
        current,
        t: 1.2,
        rms: 0.1
      })
      for (const value of current) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
})
