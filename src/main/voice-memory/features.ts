/**
 * Classic speech features for personal acoustic memory: MFCCs with deltas, normalised per span.
 * No model, no dependencies; 16 kHz mono PCM16 in, one 26-number frame every 10 ms out.
 */

export const SAMPLE_RATE = 16_000
export const FRAME_MS = 10
const WINDOW = 400 // 25 ms
const HOP = 160 // 10 ms
const FFT = 512
const MELS = 26
const CEPSTRA = 13
export const FEATURE_DIM = (CEPSTRA - 1) * 2
/** Bumped whenever the numbers below change, so stored features are never compared across versions. */
export const EXTRACTOR = { id: 's2t-mfcc', version: '1', featureSchema: 1 } as const

export type Features = { frames: Float32Array[]; dim: number }

const hamming = Float64Array.from({ length: WINDOW }, (_, n) => 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (WINDOW - 1)))

const hz2mel = (hz: number) => 2595 * Math.log10(1 + hz / 700)
const mel2hz = (mel: number) => 700 * (10 ** (mel / 2595) - 1)

/** Triangular mel filters between 20 Hz and 7.6 kHz over the FFT's positive bins. */
const filters: { from: number; weights: Float64Array }[] = (() => {
  const lo = hz2mel(20)
  const hi = hz2mel(7600)
  const points = Array.from({ length: MELS + 2 }, (_, i) => mel2hz(lo + ((hi - lo) * i) / (MELS + 1)))
  const bins = points.map((hz) => Math.floor(((FFT + 1) * hz) / SAMPLE_RATE))
  return Array.from({ length: MELS }, (_, m) => {
    const [a, b, c] = [bins[m], bins[m + 1], bins[m + 2]]
    const weights = new Float64Array(c - a + 1)
    for (let k = a; k <= c; k++)
      weights[k - a] = k < b ? (b === a ? 0 : (k - a) / (b - a)) : c === b ? 0 : (c - k) / (c - b)
    return { from: a, weights }
  })
})()

const dct: Float64Array[] = Array.from({ length: CEPSTRA }, (_, i) =>
  Float64Array.from({ length: MELS }, (_, j) => Math.cos((Math.PI * i * (j + 0.5)) / MELS))
)

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const step = (-2 * Math.PI) / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < size / 2; k++) {
        const wr = Math.cos(step * k)
        const wi = Math.sin(step * k)
        const a = start + k
        const b = a + size / 2
        const tr = re[b] * wr - im[b] * wi
        const ti = re[b] * wi + im[b] * wr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

export function pcmToSamples(pcm: Uint8Array): Float64Array {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength - (pcm.byteLength % 2))
  return Float64Array.from({ length: view.byteLength / 2 }, (_, i) => view.getInt16(i * 2, true) / 32768)
}

/** Raw MFCC frames and each frame's log energy (for trimming silence). */
function cepstra(samples: Float64Array): { frames: Float64Array[]; energy: number[] } {
  const frames: Float64Array[] = []
  const energy: number[] = []
  const re = new Float64Array(FFT)
  const im = new Float64Array(FFT)
  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    re.fill(0)
    im.fill(0)
    let e = 0
    for (let n = 0; n < WINDOW; n++) {
      const x = samples[start + n] - (n > 0 ? 0.97 * samples[start + n - 1] : 0)
      re[n] = x * hamming[n]
      e += samples[start + n] ** 2
    }
    fft(re, im)
    const mel = new Float64Array(MELS)
    for (let m = 0; m < MELS; m++) {
      const { from, weights } = filters[m]
      let sum = 0
      for (let k = 0; k < weights.length; k++) {
        const bin = from + k
        sum += weights[k] * (re[bin] ** 2 + im[bin] ** 2)
      }
      mel[m] = Math.log(sum + 1e-10)
    }
    const c = new Float64Array(CEPSTRA)
    for (let i = 0; i < CEPSTRA; i++) {
      let sum = 0
      for (let j = 0; j < MELS; j++) sum += dct[i][j] * mel[j]
      c[i] = sum
    }
    frames.push(c)
    energy.push(Math.log(e / WINDOW + 1e-10))
  }
  return { frames, energy }
}

/** Frame range [from, to) holding speech: drops leading and trailing frames well below the peak. */
export function speechBounds(energy: number[], marginDb = 35): [number, number] {
  if (!energy.length) return [0, 0]
  const peak = Math.max(...energy)
  const floor = peak - (marginDb / 10) * Math.LN10
  let from = 0
  let to = energy.length
  while (from < to && energy[from] < floor) from++
  while (to > from && energy[to - 1] < floor) to--
  return [from, to]
}

/**
 * Narrow a padded span to its speech. Padding can catch the tail of the word before or the start
 * of the word after: a silent gap of 30 ms or more within 200 ms of either edge cuts there.
 */
function trimSpan(energy: number[], from: number, to: number): [number, number] {
  const slice = energy.slice(from, to)
  if (!slice.length) return [from, to]
  const floor = Math.max(...slice) - 3.5 * Math.LN10
  const quiet = slice.map((e) => e < floor)
  const edge = 20
  const gap = 3
  let start = 0
  for (let i = 0, run = 0; i < Math.min(edge, slice.length); i++) {
    run = quiet[i] ? run + 1 : 0
    if (run >= gap) start = i + 1
  }
  let end = slice.length
  for (let i = slice.length - 1, run = 0; i >= Math.max(0, slice.length - edge); i--) {
    run = quiet[i] ? run + 1 : 0
    if (run >= gap) end = i
  }
  while (start < end && quiet[start]) start++
  while (end > start && quiet[end - 1]) end--
  return end > start ? [from + start, from + end] : [from, to]
}

/**
 * MFCC (without the loudness coefficient) + delta features for the span [fromMs, toMs) of `pcm`.
 * The mean is taken over the speech frames of the whole `pcm`, so pass a few seconds of surrounding
 * speech: that removes the microphone's colour the same way for stored examples and new speech.
 * `trim` drops silence at both ends of the span (for stored examples).
 */
export function extractFeatures(
  pcm: Uint8Array,
  options: { fromMs?: number; toMs?: number; trim?: boolean } = {}
): Features {
  const { frames: raw, energy } = cepstra(pcmToSamples(pcm))
  if (!raw.length) return { frames: [], dim: FEATURE_DIM }
  const [speechFrom, speechTo] = speechBounds(energy, 25)
  const peak = Math.max(...energy)
  const voiced = raw.filter((_, t) => t >= speechFrom && t < speechTo && energy[t] > peak - 25 / 10 * Math.LN10)
  const basis = voiced.length >= 20 ? voiced : raw
  const mean = new Float64Array(CEPSTRA)
  for (const f of basis) for (let i = 0; i < CEPSTRA; i++) mean[i] += f[i] / basis.length
  let from = Math.max(0, Math.floor((options.fromMs ?? 0) / FRAME_MS))
  let to = Math.min(raw.length, options.toMs === undefined ? raw.length : Math.ceil(options.toMs / FRAME_MS))
  if (options.trim) [from, to] = trimSpan(energy, from, to)
  if (to <= from) return { frames: [], dim: FEATURE_DIM }
  const norm = raw.map((f) => Float64Array.from(f, (x, i) => (x - mean[i]) / 10))
  const frames: Float32Array[] = []
  for (let t = from; t < to; t++) {
    const frame = new Float32Array(FEATURE_DIM)
    const prev = norm[Math.max(0, t - 1)]
    const next = norm[Math.min(norm.length - 1, t + 1)]
    for (let i = 1; i < CEPSTRA; i++) {
      frame[i - 1] = norm[t][i]
      frame[CEPSTRA - 1 + i - 1] = (next[i] - prev[i]) * 2
    }
    frames.push(frame)
  }
  return { frames, dim: FEATURE_DIM }
}
