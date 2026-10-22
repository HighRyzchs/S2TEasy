import { describe, expect, it } from 'vitest'
import { encodeWav } from './wav'
import { concatFloat32, resampleLinear, rms } from './audio'

describe('encodeWav', () => {
  it('writes a valid mono 16-bit header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const wav = encodeWav(samples, 16_000)
    const ascii = String.fromCharCode(...wav.subarray(0, 12))
    expect(ascii.startsWith('RIFF')).toBe(true)
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE')
    const view = new DataView(wav.buffer)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(wav.length).toBe(44 + samples.length * 2)
  })
})

describe('audio utils', () => {
  it('resamples without changing duration in seconds', () => {
    const input = new Float32Array(16_000)
    input[0] = 1
    const out = resampleLinear(input, 16_000, 8_000)
    expect(out.length).toBe(8_000)
    expect(out[0]).toBeCloseTo(1, 5)
  })

  it('concatenates frames', () => {
    const a = new Float32Array([1, 2])
    const b = new Float32Array([3])
    expect([...concatFloat32([a, b])]).toEqual([1, 2, 3])
  })

  it('computes rms', () => {
    expect(rms(new Float32Array([0, 0, 0]))).toBe(0)
    expect(rms(new Float32Array([1, 0, -1, 0]))).toBeCloseTo(Math.sqrt(0.5), 5)
  })
})
