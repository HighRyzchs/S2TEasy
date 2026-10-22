import { WAVEFORM_BARS } from './constants'
import type { OverlayStatus } from './types'

export function bandsFromPcm(samples: Float32Array, count = WAVEFORM_BARS): number[] {
  const out = new Array<number>(count).fill(0)
  if (samples.length === 0) return out
  const size = Math.max(1, Math.floor(samples.length / count))
  for (let i = 0; i < count; i++) {
    const start = i * size
    const end = i === count - 1 ? samples.length : Math.min(samples.length, start + size)
    let sum = 0
    for (let j = start; j < end; j++) {
      const v = samples[j] ?? 0
      sum += v * v
    }
    const n = Math.max(1, end - start)
    const level = Math.sqrt(sum / n)
    out[i] = Math.min(1, Math.pow(level * 6.4, 0.62))
  }
  return out
}

export function lerpBars(current: number[], target: number[], amount: number): number[] {
  const n = Math.max(current.length, target.length, WAVEFORM_BARS)
  const t = amount < 0 ? 0 : amount > 1 ? 1 : amount
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const a = current[i] ?? 0
    const b = target[i] ?? 0
    const v = a + (b - a) * t
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}

export function idlePulse(t: number, count = WAVEFORM_BARS, intensity = 0.12): number[] {
  return Array.from({ length: count }, (_, i) => {
    const envelope = Math.sin((i / Math.max(1, count - 1)) * Math.PI)
    const wave = 0.5 + 0.5 * Math.sin(t * 1.12 + i * 0.2)
    return 0.07 + envelope * intensity * (0.45 + 0.55 * wave)
  })
}

export function previewTarget(t: number, count = WAVEFORM_BARS): number[] {
  return Array.from({ length: count }, (_, i) => {
    const envelope = Math.sin((i / Math.max(1, count - 1)) * Math.PI)
    const swell = 0.5 + 0.5 * Math.sin(t * 1.35 + i * 0.21)
    return 0.12 + envelope * (0.22 + 0.42 * swell)
  })
}

export function composeOverlayBars(input: {
  status: OverlayStatus
  target: number[]
  current: number[]
  t: number
  rms: number
}): number[] {
  const { status, target, current, t, rms } = input
  if (status === 'transcribing' || status === 'inserting') {
    return lerpBars(current, idlePulse(t, WAVEFORM_BARS, 0.22), 0.07)
  }
  if (status === 'success') {
    return lerpBars(current, idlePulse(t, WAVEFORM_BARS, 0.07), 0.12)
  }
  if (status === 'error' || status === 'hidden') {
    return lerpBars(current, new Array(WAVEFORM_BARS).fill(0.05), 0.16)
  }
  const peak = target.reduce((n, v) => (v > n ? v : n), 0)
  const silent = rms < 0.007 && peak < 0.05
  const goal = silent ? idlePulse(t, WAVEFORM_BARS, 0.09) : padBars(target)
  return lerpBars(current, goal, silent ? 0.06 : 0.11)
}

function padBars(target: number[]): number[] {
  if (target.length >= WAVEFORM_BARS) return target.slice(0, WAVEFORM_BARS)
  if (target.length === 0) return new Array(WAVEFORM_BARS).fill(0)
  const out = target.slice()
  while (out.length < WAVEFORM_BARS) out.push(0)
  return out
}
