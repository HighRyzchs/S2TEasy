/** Local acoustic measurements. No emotion classifier, identity or accent inference. */
export type ProsodyMeasurement = {
  durationMs: number
  rmsDbfs: number
  pitchMedianHz: number | null
  pitchRangeSemitones: number | null
  pitchedFrameFraction: number
  quietFraction: number
  clippedFraction: number
  wordCount: number | null
  wordsPerMinute: number | null
  envelope: number[]
}
const quantile = (sorted: number[], fraction: number) =>
  sorted[Math.floor((sorted.length - 1) * fraction)]!

export function suppliedPace(transcript: string, durationMs: number) {
  const wordCount = transcript.trim()
    ? (transcript.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)?.length ?? 0)
    : null
  return {
    wordCount,
    wordsPerMinute: wordCount === null || durationMs <= 0 ? null : wordCount / (durationMs / 60000)
  }
}

function pitch(frame: Float32Array, rate: number): number | null {
  let mean = 0
  for (const v of frame) mean += v
  mean /= frame.length
  const correlations: { lag: number; value: number }[] = []
  for (let lag = Math.ceil(rate / 500); lag <= Math.floor(rate / 60); lag++) {
    let xy = 0,
      xx = 0,
      yy = 0
    for (let i = 0; i < frame.length - lag; i++) {
      const x = frame[i]! - mean,
        y = frame[i + lag]! - mean
      xy += x * y
      xx += x * x
      yy += y * y
    }
    correlations.push({ lag, value: xx * yy > 1e-10 ? xy / Math.sqrt(xx * yy) : 0 })
  }
  const best = Math.max(...correlations.map((row) => row.value))
  if (best < 0.78) return null
  // Prefer the first strong local peak to octave-down multiples of the fundamental.
  const peak = correlations.find(
    (row, i) =>
      i > 0 &&
      i < correlations.length - 1 &&
      row.value >= best * 0.96 &&
      row.value >= correlations[i - 1]!.value &&
      row.value >= correlations[i + 1]!.value
  )
  return peak ? rate / peak.lag : null
}
export function measureProsody(
  samples: Float32Array,
  sampleRate: number,
  transcript = ''
): ProsodyMeasurement {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    !samples.length ||
    samples.length / sampleRate > 20
  )
    throw new Error('Use a recording between a moment and 20 seconds long.')
  // Downsample for bounded autocorrelation work; no spectral/emotion claim is made.
  const rate = 16000,
    length = Math.floor((samples.length * rate) / sampleRate)
  const mono = new Float32Array(length)
  let squares = 0,
    clipped = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!
    if (!Number.isFinite(v)) throw new Error('The recording contains invalid audio samples.')
    // Lossy audio decoders can legitimately overshoot +/-1; retain the clipping metric.
    squares += v * v
    if (Math.abs(v) >= 0.995) clipped++
  }
  for (let i = 0; i < length; i++) {
    const start = Math.floor((i * sampleRate) / rate),
      end = Math.min(samples.length, Math.max(start + 1, Math.floor(((i + 1) * sampleRate) / rate)))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]!
    mono[i] = sum / (end - start)
  }
  const pitches: number[] = [],
    energies: number[] = []
  let quiet = 0
  for (let start = 0; start + 640 <= mono.length; start += 320) {
    const frame = mono.subarray(start, start + 640)
    let energy = 0
    for (const v of frame) energy += v * v
    const rms = Math.sqrt(energy / frame.length)
    energies.push(rms)
    if (rms < 0.012) quiet++
    if (rms >= 0.012) {
      const hz = pitch(frame, rate)
      if (hz !== null) pitches.push(hz)
    }
  }
  pitches.sort((a, b) => a - b)
  const hasPitch = pitches.length >= 5
  const durationMs = (samples.length / sampleRate) * 1000
  return {
    durationMs,
    rmsDbfs: Math.max(-90, 20 * Math.log10(Math.sqrt(squares / samples.length) || 1e-9)),
    pitchMedianHz: hasPitch ? quantile(pitches, 0.5) : null,
    pitchRangeSemitones: hasPitch
      ? 12 * Math.log2(quantile(pitches, 0.9) / quantile(pitches, 0.1))
      : null,
    pitchedFrameFraction: energies.length ? pitches.length / energies.length : 0,
    quietFraction: energies.length ? quiet / energies.length : 1,
    clippedFraction: clipped / samples.length,
    ...suppliedPace(transcript, durationMs),
    envelope: Array.from({ length: 64 }, (_, i) => {
      const start = Math.floor((i * energies.length) / 64),
        end = Math.max(start + 1, Math.floor(((i + 1) * energies.length) / 64))
      const slice = energies.slice(start, end)
      return slice.length ? slice.reduce((sum, v) => sum + v, 0) / slice.length : 0
    })
  }
}
export function compareProsody(current: ProsodyMeasurement, neutral: ProsodyMeasurement) {
  return {
    energyChangeDb: current.rmsDbfs - neutral.rmsDbfs,
    pitchChangeSemitones:
      current.pitchMedianHz !== null && neutral.pitchMedianHz !== null
        ? 12 * Math.log2(current.pitchMedianHz / neutral.pitchMedianHz)
        : null,
    paceChangePercent:
      current.wordsPerMinute !== null &&
      neutral.wordsPerMinute !== null &&
      neutral.wordsPerMinute > 0
        ? (current.wordsPerMinute / neutral.wordsPerMinute - 1) * 100
        : null
  }
}
