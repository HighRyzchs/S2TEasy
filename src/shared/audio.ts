function sampleAt(input: Float32Array, index: number): number {
  if (index < 0) return input[0] ?? 0
  if (index >= input.length) return input[input.length - 1] ?? 0
  return input[index] ?? 0
}

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return new Float32Array(input)
  if (input.length === 0) return new Float32Array(0)
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = src - i0
    const a = input[i0] ?? 0
    const b = input[i1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

/** Catmull-Rom cubic resample — cleaner than linear for 48 kHz → 16 kHz speech. */
export function resampleCubic(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return new Float32Array(input)
  if (input.length === 0) return new Float32Array(0)
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const src = i * ratio
    const i1 = Math.floor(src)
    const frac = src - i1
    const s0 = sampleAt(input, i1 - 1)
    const s1 = sampleAt(input, i1)
    const s2 = sampleAt(input, i1 + 1)
    const s3 = sampleAt(input, i1 + 2)
    const a = -0.5 * s0 + 1.5 * s1 - 1.5 * s2 + 0.5 * s3
    const b = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3
    const c = -0.5 * s0 + 0.5 * s2
    out[i] = ((a * frac + b) * frac + c) * frac + s1
  }
  return out
}

export function applyGain(samples: Float32Array, gain: number): Float32Array {
  if (!Number.isFinite(gain) || gain === 1) return samples
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = (samples[i] ?? 0) * gain
    out[i] = v < -1 ? -1 : v > 1 ? 1 : v
  }
  return out
}

export function concatFloat32(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Float32Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0
    sum += v * v
  }
  return Math.sqrt(sum / samples.length)
}

/** Preserve fractional phase and neighboring samples across AudioWorklet blocks. */
export class StreamingResampler {
  private pending: Float32Array = new Float32Array(0)
  private offset = 0
  private total = 0
  private outputSamples = 0
  private readonly ratio: number

  constructor(fromRate: number, toRate: number) {
    if (!(fromRate > 0) || !(toRate > 0) || !Number.isFinite(fromRate + toRate))
      throw new Error('Invalid audio sample rate.')
    this.ratio = fromRate / toRate
  }

  push(input: Float32Array): Float32Array {
    this.pending = concatFloat32([this.pending, input])
    this.total += input.length
    return this.take(false)
  }

  flush(): Float32Array {
    const out = this.take(true)
    this.pending = new Float32Array(0)
    this.offset = this.total = this.outputSamples = 0
    return out
  }

  private take(final: boolean): Float32Array {
    const result: number[] = []
    const target = Math.round(this.total / this.ratio)
    while (this.outputSamples < target) {
      const position = this.outputSamples * this.ratio
      if (!final && Math.floor(position) + 2 >= this.total) break
      const index = Math.floor(position) - this.offset
      const fraction = position - Math.floor(position)
      const s0 = sampleAt(this.pending, index - 1),
        s1 = sampleAt(this.pending, index)
      const s2 = sampleAt(this.pending, index + 1),
        s3 = sampleAt(this.pending, index + 2)
      const a = -0.5 * s0 + 1.5 * s1 - 1.5 * s2 + 0.5 * s3
      const b = s0 - 2.5 * s1 + 2 * s2 - 0.5 * s3
      result.push(((a * fraction + b) * fraction + (-0.5 * s0 + 0.5 * s2)) * fraction + s1)
      this.outputSamples++
    }
    const drop = Math.max(
      0,
      Math.min(this.pending.length, Math.floor(this.outputSamples * this.ratio) - this.offset - 1)
    )
    this.pending = this.pending.slice(drop)
    this.offset += drop
    return Float32Array.from(result)
  }
}
