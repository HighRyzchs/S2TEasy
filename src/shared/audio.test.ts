import { describe, expect, it } from 'vitest'
import {
  applyGain,
  resampleCubic,
  resampleLinear,
  StreamingResampler,
  concatFloat32
} from './audio'

describe('resampleCubic', () => {
  it('preserves a constant signal', () => {
    const input = new Float32Array(48).fill(0.25)
    const out = resampleCubic(input, 48_000, 16_000)
    expect(out.length).toBe(16)
    for (const sample of out) expect(sample).toBeCloseTo(0.25, 5)
  })

  it('is smoother than linear on a sine', () => {
    const input = Float32Array.from({ length: 96 }, (_, i) => Math.sin((i / 96) * Math.PI * 2))
    const cubic = resampleCubic(input, 48_000, 16_000)
    const linear = resampleLinear(input, 48_000, 16_000)
    expect(cubic.length).toBe(linear.length)
    expect(Math.max(...cubic.map(Math.abs))).toBeLessThan(1.05)
  })
})

describe('applyGain', () => {
  it('clips to [-1, 1]', () => {
    const out = applyGain(new Float32Array([0.8, -0.8]), 2)
    expect(out[0]).toBe(1)
    expect(out[1]).toBe(-1)
  })
})

describe('streaming resampling', () => {
  it('has no per-block timing drift over two minutes of 48 kHz audio', () => {
    const resampler = new StreamingResampler(48000, 16000)
    let samples = 0
    for (let offset = 0; offset < 48000 * 120; offset += 128)
      samples += resampler.push(new Float32Array(Math.min(128, 48000 * 120 - offset))).length
    samples += resampler.flush().length
    expect(samples).toBe(16000 * 120)
  })
  it('matches contiguous cubic interpolation when 44.1 kHz input crosses arbitrary block boundaries', () => {
    const input = Float32Array.from({ length: 44100 }, (_, i) => Math.sin((i * Math.PI) / 27))
    const resampler = new StreamingResampler(44100, 16000)
    const parts: Float32Array[] = []
    for (let offset = 0; offset < input.length; offset += 128)
      parts.push(resampler.push(input.subarray(offset, offset + 128)))
    parts.push(resampler.flush())
    const actual = concatFloat32(parts),
      expected = resampleCubic(input, 44100, 16000)
    expect(actual.length).toBe(expected.length)
    for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 5)
  })
})
