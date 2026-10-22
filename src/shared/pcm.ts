import { PCM_FRAME_SAMPLES } from './constants'

export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2)
  const view = new DataView(out.buffer)
  for (let i = 0; i < samples.length; i++) {
    const raw = samples[i] ?? 0
    const s = raw < -1 ? -1 : raw > 1 ? 1 : raw
    const v = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff)
    view.setInt16(i * 2, v, true)
  }
  return out
}

export class PcmFramer {
  private pending: Float32Array[] = []
  private samples = 0

  push(frame: Float32Array): Uint8Array[] {
    if (frame.length === 0) return []
    this.pending.push(frame)
    this.samples += frame.length
    const out: Uint8Array[] = []
    while (this.samples >= PCM_FRAME_SAMPLES) {
      out.push(floatToPcm16(this.take(PCM_FRAME_SAMPLES)))
    }
    return out
  }

  flush(): Uint8Array | null {
    if (this.samples === 0) return null
    return floatToPcm16(this.take(this.samples))
  }

  reset(): void {
    this.pending = []
    this.samples = 0
  }

  private take(count: number): Float32Array {
    const out = new Float32Array(count)
    let filled = 0
    while (filled < count && this.pending.length) {
      const next = this.pending[0]
      if (!next) break
      const need = count - filled
      if (next.length <= need) {
        out.set(next, filled)
        filled += next.length
        this.pending.shift()
      } else {
        out.set(next.subarray(0, need), filled)
        this.pending[0] = next.subarray(need)
        filled += need
      }
    }
    this.samples -= filled
    return out
  }
}
