import { randomUUID } from 'node:crypto'
import type { AppSettings } from '../shared/types'
import type { CueAnalysis } from '../shared/speech-cues'
import type { UsageMeasurement } from '../shared/usage'
import { observeAudio } from './audio-observations'
import { pcmToWav } from './session-journal'
import { analyzeCueAudio } from './speech-cue-model'

/** One bounded, explicitly opted-in audio request per take. Never infer emotion from text. */
export async function analyzeAutomaticCues(
  pcm: Uint8Array,
  settings: AppSettings,
  signal: AbortSignal,
  onUsage: (row: UsageMeasurement) => void,
  analyze = analyzeCueAudio
): Promise<CueAnalysis | undefined> {
  if (!settings.speechCues.enabled || !settings.speechCues.automatic) return undefined
  signal.throwIfAborted()
  const excerpt = pcm.subarray(0, 30 * 16000 * 2)
  const observations = observeAudio(excerpt)
  if (observations.durationMs < 500 || observations.rms < 0.002) return undefined
  const result = await analyze({
    apiKey: settings.apiKey,
    settings: settings.speechCues,
    wavBase64: pcmToWav(excerpt).toString('base64'),
    durationMs: observations.durationMs,
    startMs: 0,
    signal,
    onUsage
  })
  signal.throwIfAborted()
  return {
    ...result,
    schemaVersion: 1,
    id: randomUUID(),
    model: settings.speechCues.model,
    createdAt: Date.now(),
    startMs: 0,
    endMs: observations.durationMs,
    observations
  }
}
