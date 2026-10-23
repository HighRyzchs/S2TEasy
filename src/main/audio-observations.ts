import type { AudioObservations } from '../shared/speech-cues'

/** PCM16 mono/16 kHz. Quiet intervals are an energy heuristic, not a speech/emotion detector. */
export function observeAudio(pcm: Uint8Array): AudioObservations {
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const count = Math.floor(pcm.byteLength / 2)
  let sum = 0,
    clipped = 0,
    quietStart: number | null = null
  const quietIntervals: AudioObservations['quietIntervals'] = []
  for (let base = 0; base < count; base += 320) {
    const end = Math.min(count, base + 320)
    let energy = 0
    for (let i = base; i < end; i++) {
      const sample = view.getInt16(i * 2, true) / 32768
      energy += sample * sample
      if (Math.abs(sample) >= 0.995) clipped++
    }
    sum += energy
    if (Math.sqrt(energy / (end - base)) < 0.012) quietStart ??= base
    else if (quietStart !== null) {
      if ((base - quietStart) / 16 >= 300)
        quietIntervals.push({ startMs: quietStart / 16, endMs: base / 16 })
      quietStart = null
    }
  }
  if (quietStart !== null && (count - quietStart) / 16 >= 300)
    quietIntervals.push({ startMs: quietStart / 16, endMs: count / 16 })
  return {
    durationMs: count / 16,
    rms: count ? Math.sqrt(sum / count) : 0,
    clippedFraction: count ? clipped / count : 0,
    quietIntervals
  }
}
