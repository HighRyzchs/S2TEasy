import { applyVocabulary, type VocabularyEntry } from './vocabulary'

/** Proposed expressive-STT contract. Brackets describe delivery, not hidden feelings. */
export const EXPRESSION_LABELS = {
  emotion: [
    'neutral',
    'calm',
    'angry',
    'upset',
    'frustrated',
    'happy',
    'excited',
    'sad',
    'anxious',
    'uncertain',
    'playful'
  ],
  delivery: ['whispering', 'soft', 'raised voice', 'monotone', 'animated', 'trembling', 'emphasis'],
  pacing: ['speaking slowly', 'speaking quickly', 'hesitant'],
  event: ['laughs', 'sighs', 'gasps']
} as const
export type ExpressionKind = keyof typeof EXPRESSION_LABELS
export type ExpressionTag = {
  id: string
  kind: ExpressionKind
  label: string
  strength: 'clear' | 'tentative'
  source: 'sample-model' | 'user'
  dismissed?: boolean
}
export type ExpressionSegment = { id: string; text: string; tags: ExpressionTag[] }
/** Apply personal words inside each finalized phrase, never to bracket labels. */
export function personalizePhrases(
  segments: ExpressionSegment[],
  rules: VocabularyEntry[]
): ExpressionSegment[] {
  return segments.map((segment) => ({ ...segment, text: applyVocabulary(segment.text, rules) }))
}
export type ExpressionOptions = {
  enabled: boolean
  clearOnly: boolean
  kinds: Record<ExpressionKind, boolean>
}
export const defaultExpressionOptions = (): ExpressionOptions => ({
  enabled: false,
  clearOnly: true,
  kinds: { emotion: true, delivery: true, pacing: false, event: true }
})
export function selectedExpressionTags(
  segment: ExpressionSegment,
  options: ExpressionOptions
): ExpressionTag[] {
  if (!options.enabled || !segment.text.trim()) return []
  const seen = new Set<string>()
  return segment.tags.filter((tag) => {
    const valid =
      Object.hasOwn(EXPRESSION_LABELS, tag.kind) &&
      (EXPRESSION_LABELS[tag.kind] as readonly string[]).includes(tag.label)
    if (
      !valid ||
      !options.kinds[tag.kind] ||
      tag.dismissed ||
      (options.clearOnly && tag.strength !== 'clear' && tag.source !== 'user') ||
      seen.has(tag.label)
    )
      return false
    seen.add(tag.label)
    return true
  })
}
export function renderExpressiveTranscript(
  segments: ExpressionSegment[],
  options: ExpressionOptions,
  format: 'inline' | 'plain' | 'json'
): string {
  const plainText = segments.map((segment) => segment.text).join('')
  if (format === 'plain') return plainText
  if (format === 'json')
    return JSON.stringify(
      {
        schemaVersion: 1,
        plainText,
        segments: segments.map((segment) => ({
          text: segment.text,
          tags: selectedExpressionTags(segment, options).map(
            ({ kind, label, source, strength }) => ({
              kind,
              label,
              source,
              ...(source === 'user' ? {} : { assessment: strength })
            })
          )
        }))
      },
      null,
      2
    )
  return segments
    .map((segment) => {
      const tags = selectedExpressionTags(segment, options)
      if (!tags.length || !segment.text.trim()) return segment.text
      const leading = segment.text.match(/^\s*/u)![0]
      return `${leading}${tags.map((tag) => `[${tag.label}]`).join(' ')} ${segment.text.slice(leading.length)}`
    })
    .join('')
}
