export const EMOTIONS = [
  'neutral',
  'calm',
  'angry',
  'upset',
  'excited',
  'happy',
  'sad',
  'frustrated',
  'anxious',
  'curious',
  'playful',
  'uncertain'
] as const
export const CUE_LABELS = {
  emotion: EMOTIONS,
  delivery: ['monotone', 'animated', 'emphasis', 'soft', 'raised', 'whispering', 'trembling'],
  pacing: ['slow', 'steady', 'fast', 'variable'],
  event: ['laughter', 'sigh']
} as const
export type CueKind = keyof typeof CUE_LABELS
export type Emotion = (typeof EMOTIONS)[number]
export type SpeechCueSettings = {
  enabled: boolean
  automatic: boolean
  model: string
  emotions: boolean
  delivery: boolean
  pacing: boolean
  events: boolean
  emotionLabels: Emotion[]
  clearOnly: boolean
  guidance: string
}
export const defaultSpeechCues = (): SpeechCueSettings => ({
  enabled: false,
  automatic: false,
  model: 'google/gemini-2.5-flash-lite',
  emotions: true,
  delivery: true,
  pacing: true,
  events: true,
  emotionLabels: [...EMOTIONS],
  clearOnly: false,
  guidance: ''
})
export function normalizeSpeechCues(raw?: Partial<SpeechCueSettings> | null): SpeechCueSettings {
  const base = defaultSpeechCues()
  return {
    enabled: raw?.enabled === true,
    automatic: raw?.enabled === true && raw?.automatic === true,
    model:
      typeof raw?.model === 'string' && raw.model.trim()
        ? raw.model.trim().slice(0, 160)
        : base.model,
    emotions: raw?.emotions !== false,
    delivery: raw?.delivery !== false,
    pacing: raw?.pacing !== false,
    events: raw?.events !== false,
    emotionLabels: Array.isArray(raw?.emotionLabels)
      ? EMOTIONS.filter((label) => raw.emotionLabels!.includes(label))
      : base.emotionLabels,
    clearOnly: raw?.clearOnly === true,
    guidance: typeof raw?.guidance === 'string' ? raw.guidance.trim().slice(0, 500) : ''
  }
}
export type SpeechCue = {
  id: string
  startMs: number
  endMs: number
  kind: CueKind
  label: string
  strength: 'tentative' | 'clear'
  evidence: string
  userLabel?: string
  dismissed?: boolean
}
export type AudioObservations = {
  durationMs: number
  rms: number
  clippedFraction: number
  quietIntervals: { startMs: number; endMs: number }[]
}
export type CueAnalysis = {
  schemaVersion: 1
  id: string
  model: string
  createdAt: number
  startMs: number
  endMs: number
  quality: 'usable' | 'limited' | 'unusable'
  summary: string
  cues: SpeechCue[]
  observations: AudioObservations
}
export type CueRequest = { startMs: number; endMs: number }
export type CueFeedback = { cueId: string; label?: string | null; dismissed?: boolean }

export function isCueLabel(kind: CueKind, label: unknown): label is string {
  return typeof label === 'string' && (CUE_LABELS[kind] as readonly string[]).includes(label)
}

/** Only validated cues cross the main-process boundary; unknown labels and invented time ranges fail closed. */
export function parseCueResponse(
  value: unknown,
  settings: SpeechCueSettings,
  startMs: number,
  durationMs: number
): Pick<CueAnalysis, 'quality' | 'summary' | 'cues'> {
  const obj = value as { quality?: unknown; summary?: unknown; cues?: unknown[] }
  if (
    !obj ||
    !['usable', 'limited', 'unusable'].includes(String(obj.quality)) ||
    typeof obj.summary !== 'string' ||
    obj.summary.length > 600 ||
    !Array.isArray(obj.cues) ||
    obj.cues.length > 24
  )
    throw new Error(
      'The audio model returned an invalid cue response. Try another audio chat model.'
    )
  const cues: SpeechCue[] = []
  for (const raw of obj.cues) {
    const c = raw as SpeechCue
    if (
      !c ||
      !Object.hasOwn(CUE_LABELS, c.kind) ||
      !isCueLabel(c.kind, c.label) ||
      !Number.isInteger(c.startMs) ||
      !Number.isInteger(c.endMs) ||
      c.startMs < 0 ||
      c.endMs <= c.startMs ||
      c.endMs > Math.ceil(durationMs) ||
      !['tentative', 'clear'].includes(c.strength) ||
      typeof c.evidence !== 'string' ||
      !c.evidence.trim() ||
      c.evidence.length > 240
    )
      throw new Error(
        'The audio model returned unsupported labels or timestamps. No cues were saved.'
      )
    const enabled =
      c.kind === 'emotion'
        ? settings.emotions && settings.emotionLabels.includes(c.label as Emotion)
        : c.kind === 'delivery'
          ? settings.delivery
          : c.kind === 'pacing'
            ? settings.pacing
            : settings.events
    if (!enabled || (settings.clearOnly && c.strength !== 'clear') || obj.quality === 'unusable')
      continue
    cues.push({
      id: `cue-${cues.length}`,
      kind: c.kind,
      label: c.label,
      strength: c.strength,
      startMs: startMs + c.startMs,
      endMs: startMs + c.endMs,
      evidence: c.evidence.trim()
    })
  }
  return { quality: obj.quality as CueAnalysis['quality'], summary: obj.summary.trim(), cues }
}

export function cueFeedback(analysis: CueAnalysis, feedback: CueFeedback): CueAnalysis {
  const found = analysis.cues.find((c) => c.id === feedback.cueId)
  if (
    !found ||
    (feedback.label !== undefined &&
      feedback.label !== null &&
      !isCueLabel(found.kind, feedback.label)) ||
    (feedback.dismissed !== undefined && typeof feedback.dismissed !== 'boolean')
  )
    throw new Error('Invalid cue correction.')
  return {
    ...analysis,
    cues: analysis.cues.map((c) =>
      c.id !== feedback.cueId
        ? c
        : {
            ...c,
            ...(feedback.label !== undefined ? { userLabel: feedback.label ?? undefined } : {}),
            ...(feedback.dismissed !== undefined ? { dismissed: feedback.dismissed } : {})
          }
    )
  }
}

export function cueExport(text: string, analysis: CueAnalysis, structured: boolean): string {
  const cues = analysis.cues
    .filter((c) => !c.dismissed)
    .map((c) => ({
      startMs: c.startMs,
      endMs: c.endMs,
      kind: c.kind,
      label: c.userLabel ?? c.label,
      source: c.userLabel !== undefined ? 'user' : 'audio-model',
      ...(c.userLabel === undefined ? { assessment: c.strength } : {})
    }))
  if (structured)
    return JSON.stringify(
      {
        schemaVersion: 1,
        text,
        audioContext: {
          analyzedRangeMs: [analysis.startMs, analysis.endMs],
          model: analysis.model,
          quality: analysis.quality,
          caveat: 'Delivery interpretations are uncertain, not facts about internal feelings.',
          cues
        }
      },
      null,
      2
    )
  return `${text}\n\n[Speech context · excerpt ${(analysis.startMs / 1000).toFixed(1)}–${(analysis.endMs / 1000).toFixed(1)}s only; interpretations may be wrong]\n${cues.length ? cues.map((c) => `${(c.startMs / 1000).toFixed(1)}–${(c.endMs / 1000).toFixed(1)}s: ${c.kind}=${c.label} (${c.source === 'user' ? 'user labeled' : `model: ${c.assessment}`})`).join('\n') : 'No selected cues.'}`
}
