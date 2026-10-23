import { normalizeVocabulary, type VocabularyEntry } from '@shared/vocabulary'

export type VoiceKind = 'word' | 'phrase' | 'sound'
export type VoiceCard = Omit<VocabularyEntry, 'kind'> & { kind: VoiceKind; sample: boolean }
export type LabModels = { speech: string; cues: string }
export type LabDraft = { cards: VoiceCard[]; models: LabModels }
export const LAB_STORAGE = 's2teasy-voice-lab-v1'
export const defaultModels: LabModels = {
  speech: 'google/gemini-2.5-flash',
  cues: 'google/gemini-2.5-flash-lite'
}
export const sampleCards: VoiceCard[] = [
  {
    id: 'sample-name',
    kind: 'word',
    heard: 'shiv on',
    meant: 'Siobhán',
    enabled: true,
    sample: true
  },
  {
    id: 'sample-project',
    kind: 'word',
    heard: 's two t easy',
    meant: 'S2Teasy',
    enabled: true,
    sample: true
  },
  {
    id: 'sample-phrase',
    kind: 'phrase',
    heard: 'on my way shortcut',
    meant: 'On my way! See you soon.',
    enabled: true,
    sample: true
  },
  {
    id: 'sample-sound',
    kind: 'sound',
    heard: 'A little hum',
    meant: 'Sounds good 👍',
    enabled: true,
    sample: true
  }
]

/** Untrusted browser storage must never turn a sound label into a text replacement. */
export function readLabDraft(value: unknown): LabDraft {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const candidates = Array.isArray(root.cards) ? root.cards : sampleCards
  const cards: VoiceCard[] = []
  const ids = new Set<string>()
  const heardWords = new Set<string>()
  for (const candidate of candidates.slice(0, 500)) {
    // Only the plain text-rule fields; this prototype keeps its own card kinds.
    const normalized = normalizeVocabulary([candidate])[0]
    const row = normalized && { id: normalized.id, heard: normalized.heard, meant: normalized.meant, enabled: normalized.enabled }
    if (!row || !row.id.trim() || row.id.length > 100 || ids.has(row.id)) continue
    // Unknown kinds are dropped rather than interpreted as correction rules.
    if (!['word', 'phrase', 'sound'].includes(candidate.kind)) continue
    const key = row.heard.toLocaleLowerCase()
    if (candidate.kind !== 'sound' && heardWords.has(key)) continue
    ids.add(row.id)
    if (candidate.kind !== 'sound') heardWords.add(key)
    cards.push({ ...row, kind: candidate.kind, sample: candidate.sample === true })
    if (cards.length === 100) break
  }
  const models =
    root.models && typeof root.models === 'object' ? (root.models as Record<string, unknown>) : {}
  const slug = (value: unknown, fallback: string) =>
    typeof value === 'string' && validModelSlug(value) ? value : fallback
  return {
    cards,
    models: {
      speech: slug(models.speech, defaultModels.speech),
      cues: slug(models.cues, defaultModels.cues)
    }
  }
}
export function validModelSlug(value: string): boolean {
  return value.length <= 160 && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:+-]+$/.test(value)
}
export function textRules(cards: VoiceCard[]): VocabularyEntry[] {
  return cards
    .filter((card) => card.kind !== 'sound')
    .map(({ id, heard, meant, enabled }) => ({ id, heard, meant, enabled }))
}

export type BillingClass = 'dictation' | 'recovery' | 'cues'
export type SampleCall = {
  id: string
  day: number
  category: BillingClass
  model: string
  cost: number | null
  latency: number
}
// Illustrative fixture costs, never estimates of current model pricing or an account balance.
export const sampleCalls: SampleCall[] = Array.from({ length: 30 }, (_, i) => ({
  id: `call-${i}`,
  day: i % 7,
  category: i % 7 === 0 ? 'recovery' : i % 4 === 0 ? 'cues' : 'dictation',
  model: i % 4 === 0 && i % 7 !== 0 ? defaultModels.cues : defaultModels.speech,
  cost: i % 13 === 0 ? null : ((i % 5) + 1) * 0.0007,
  latency: 0.8 + (i % 6) * 0.23
}))
