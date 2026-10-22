import { describe, expect, it } from 'vitest'
import { PCM_FRAME_SAMPLES } from './constants'
import { floatToPcm16, PcmFramer } from './pcm'

describe('floatToPcm16', () => {
  it('writes little-endian int16 samples', () => {
    const pcm = floatToPcm16(new Float32Array([0, 1, -1, 0.5]))
    const view = new DataView(pcm.buffer)
    expect(view.getInt16(0, true)).toBe(0)
    expect(view.getInt16(2, true)).toBe(0x7fff)
    expect(view.getInt16(4, true)).toBe(-0x8000)
    expect(view.getInt16(6, true)).toBe(Math.round(0.5 * 0x7fff))
  })
})

describe('PcmFramer', () => {
  it('emits 4000-sample frames and a leftover flush', () => {
    const framer = new PcmFramer()
    const first = framer.push(new Float32Array(PCM_FRAME_SAMPLES + 120).fill(0.1))
    expect(first).toHaveLength(1)
    expect(first[0]?.byteLength).toBe(PCM_FRAME_SAMPLES * 2)
    const leftover = framer.flush()
    expect(leftover?.byteLength).toBe(120 * 2)
    expect(framer.flush()).toBeNull()
  })
})
