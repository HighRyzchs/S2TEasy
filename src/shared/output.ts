import type { HistoryItem } from './types'
import { CUE_LABELS, isCueLabel, type CueKind } from './speech-cues'

export type OutputPreferences = {
  placement: 'before' | 'after' | 'context'
  kinds: Record<CueKind, boolean>
  clearOnly: boolean
}
export const defaultOutputPreferences = (): OutputPreferences => ({
  placement: 'before',
  kinds: { emotion: true, delivery: true, pacing: true, event: true },
  clearOnly: true
})
export function normalizeOutputPreferences(
  raw?: Partial<OutputPreferences> | null
): OutputPreferences {
  return {
    placement:
      raw?.placement === 'after' || raw?.placement === 'context' ? raw.placement : 'before',
    kinds: Object.fromEntries(
      Object.keys(CUE_LABELS).map((kind) => [kind, raw?.kinds?.[kind as CueKind] !== false])
    ) as Record<CueKind, boolean>,
    clearOnly: raw?.clearOnly !== false
  }
}

/** Words have already passed through vocabulary exactly once. Never run rules over tag labels. */
export function renderOutput(
  item: Pick<HistoryItem, 'text' | 'cueAnalysis'>,
  prefs: OutputPreferences,
  format: 'plain' | 'tags' | 'json'
): string {
  if (format === 'plain') return item.text
  const analysis = item.cueAnalysis
  const cues =
    analysis?.quality === 'unusable'
      ? []
      : (analysis?.cues ?? [])
          .filter(
            (c) =>
              Object.hasOwn(CUE_LABELS, c.kind) &&
              prefs.kinds[c.kind] &&
              !c.dismissed &&
              isCueLabel(c.kind, c.userLabel ?? c.label) &&
              (!prefs.clearOnly || c.strength === 'clear' || c.userLabel !== undefined)
          )
          .map((c) => ({
            kind: c.kind,
            label: c.userLabel ?? c.label,
            startMs: c.startMs,
            endMs: c.endMs,
            source: c.userLabel !== undefined ? 'user' : 'audio-model',
            ...(c.userLabel === undefined ? { assessment: c.strength } : {})
          }))
  if (format === 'json')
    return JSON.stringify(
      {
        schemaVersion: 1,
        text: item.text,
        audioContext: analysis
          ? {
              model: analysis.model,
              analyzedRangeMs: [analysis.startMs, analysis.endMs],
              quality: analysis.quality,
              caveat:
                'Delivery interpretations may be wrong; times are model estimates, not word alignment.',
              cues
            }
          : null
      },
      null,
      2
    )
  if (!cues.length) return item.text
  // Preserve excerpt scope even without provider word alignment or after the user edits the words.
  const tags = cues
    .map((c) => `[${c.label} · ${(c.startMs / 1000).toFixed(1)}–${(c.endMs / 1000).toFixed(1)}s]`)
    .join(' ')
  if (prefs.placement === 'after') return `${item.text}\n${tags}`
  if (prefs.placement === 'context')
    return `${item.text}\n\n[Voice context · delivery interpretations]\n${tags}`
  return `${tags}\n${item.text}`
}
