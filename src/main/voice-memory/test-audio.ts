/** Synthetic speech-like audio for tests: each "syllable" is two formant tones with a short ramp. */
export type Syllable = { f1: number; f2: number; ms: number }

export function synth(parts: (Syllable | { silence: number })[], options: { speed?: number; gain?: number; noise?: number; seed?: number } = {}): Uint8Array {
  const speed = options.speed ?? 1
  const gain = options.gain ?? 0.3
  let seed = options.seed ?? 1
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  const samples: number[] = []
  for (const part of parts) {
    const count = Math.round(((('silence' in part ? part.silence : part.ms) * speed) / 1000) * 16000)
    for (let n = 0; n < count; n++) {
      let x = 0
      if (!('silence' in part)) {
        const ramp = Math.min(1, n / 160, (count - n) / 160)
        const t = n / 16000
        x = ramp * gain * (Math.sin(2 * Math.PI * part.f1 * t) + 0.6 * Math.sin(2 * Math.PI * part.f2 * t))
      }
      x += (options.noise ?? 0.002) * random()
      samples.push(x)
    }
  }
  const pcm = new Uint8Array(samples.length * 2)
  const view = new DataView(pcm.buffer)
  samples.forEach((x, i) => view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(x * 32767))), true))
  return pcm
}

export const GG_NO_RE: Syllable[] = [
  { f1: 300, f2: 2300, ms: 180 },
  { f1: 320, f2: 2200, ms: 180 },
  { f1: 450, f2: 1000, ms: 160 },
  { f1: 400, f2: 1700, ms: 220 }
]
export const OTHER: Syllable[] = [
  { f1: 700, f2: 1200, ms: 200 },
  { f1: 600, f2: 900, ms: 150 },
  { f1: 750, f2: 1300, ms: 200 }
]

/** A few seconds of varied "speech" around a phrase, like the context a real session provides. */
export function babble(count: number, seed: number): Syllable[] {
  let s = seed
  const random = () => (s = (s * 48271) % 2147483647) / 2147483647
  return Array.from({ length: count }, () => ({
    f1: 250 + Math.round(random() * 600),
    f2: 800 + Math.round(random() * 1800),
    ms: 120 + Math.round(random() * 120)
  }))
}

export const msOf = (parts: (Syllable | { silence: number })[], speed = 1) =>
  parts.reduce((sum, p) => sum + ('silence' in p ? p.silence : p.ms), 0) * speed
