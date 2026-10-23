/** What a personal word is, which decides its default behavior and how it is shown in Your voice. */
export type WordKind = 'name' | 'accent' | 'keyword' | 'phrase' | 'rule'
export const WORD_KINDS: readonly WordKind[] = ['name', 'accent', 'keyword', 'phrase', 'rule']

/** A retained moment of audio where the user said this word, referenced by session and time range. */
export type WordClip = { sessionId: string; startMs: number; endMs: number; createdAt: number }

export type WordStats = { fixed: number; heardRight: number; missed: number }

export type VocabularyEntry = {
  id: string
  /** The main misheard form. Older settings files only have this. */
  heard: string
  meant: string
  enabled: boolean
  kind?: WordKind
  /** Other ways the recognizer has misheard this word, learned from fixes and practice. */
  variants?: string[]
  /** Sent to the speech engine as a key term so it is recognized correctly in the first place. */
  engineHint?: boolean
  /** Free-form "sounds like" note for the user; never used for matching. */
  hint?: string
  clips?: WordClip[]
  stats?: WordStats
  createdAt?: number
}

export type VocabularyHit = { entryId: string; from: string; to: string }

const MAX_ENTRIES = 500
const MAX_VARIANTS = 12
const MAX_CLIPS = 8
const MAX_LEN = 120

const clean = (value: string) => value.replace(/\s+/gu, ' ').trim()
const key = (value: string) => clean(value).toLocaleLowerCase()

function count(value: unknown): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0
}

function normalizeClips(value: unknown): WordClip[] | undefined {
  if (!Array.isArray(value)) return undefined
  const clips = value
    .filter(
      (clip): clip is WordClip =>
        !!clip &&
        typeof clip === 'object' &&
        typeof clip.sessionId === 'string' &&
        Number.isFinite(clip.startMs) &&
        Number.isFinite(clip.endMs) &&
        clip.endMs > clip.startMs
    )
    .map((clip) => ({
      sessionId: clip.sessionId,
      startMs: Math.max(0, Math.round(clip.startMs)),
      endMs: Math.round(clip.endMs),
      createdAt: Number.isFinite(clip.createdAt) ? clip.createdAt : 0
    }))
    .slice(-MAX_CLIPS)
  return clips.length ? clips : undefined
}

/** Every heard form of an entry: the main one first, then learned variants. */
export function heardForms(entry: Pick<VocabularyEntry, 'heard' | 'variants'>): string[] {
  return [entry.heard, ...(entry.variants ?? [])]
}

export function normalizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return []
  // A heard form belongs to one entry only, so a phrase can never map to two different words.
  const seen = new Set<string>()
  const out: VocabularyEntry[] = []
  for (const row of value) {
    if (out.length >= MAX_ENTRIES) break
    if (!row || typeof row !== 'object') continue
    const { id, heard, meant } = row as Partial<VocabularyEntry>
    if (typeof id !== 'string' || typeof heard !== 'string' || typeof meant !== 'string') continue
    if (!clean(heard) || !clean(meant) || heard.length > MAX_LEN || meant.length > MAX_LEN) continue
    if (seen.has(key(heard))) continue
    seen.add(key(heard))
    const raw = row as Partial<VocabularyEntry>
    const variants: string[] = []
    for (const variant of Array.isArray(raw.variants) ? raw.variants : []) {
      if (typeof variant !== 'string' || !clean(variant) || variant.length > MAX_LEN) continue
      if (seen.has(key(variant)) || key(variant) === key(meant)) continue
      seen.add(key(variant))
      variants.push(clean(variant))
      if (variants.length >= MAX_VARIANTS) break
    }
    const kind = WORD_KINDS.includes(raw.kind as WordKind) ? (raw.kind as WordKind) : 'rule'
    const entry: VocabularyEntry = {
      id,
      heard: clean(heard),
      meant: clean(meant),
      enabled: raw.enabled !== false,
      kind
    }
    if (variants.length) entry.variants = variants
    entry.engineHint =
      typeof raw.engineHint === 'boolean' ? raw.engineHint : kind !== 'accent' && kind !== 'rule'
    if (typeof raw.hint === 'string' && clean(raw.hint)) entry.hint = clean(raw.hint).slice(0, 60)
    const clips = normalizeClips(raw.clips)
    if (clips) entry.clips = clips
    if (raw.stats && typeof raw.stats === 'object')
      entry.stats = {
        fixed: count(raw.stats.fixed),
        heardRight: count(raw.stats.heardRight),
        missed: count(raw.stats.missed)
      }
    if (Number.isFinite(raw.createdAt)) entry.createdAt = raw.createdAt
    out.push(entry)
  }
  return out
}

type Rule = { entryId: string; form: string; meant: string; words: number }

function rulesOf(entries: VocabularyEntry[]): Rule[] {
  return normalizeVocabulary(entries)
    .filter((entry) => entry.enabled)
    .flatMap((entry) =>
      heardForms(entry).map((form) => ({
        entryId: entry.id,
        form,
        meant: entry.meant,
        words: form.split(' ').length
      }))
    )
    .sort((a, b) => b.form.length - a.form.length)
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Explicit whole-word/phrase corrections, including every learned variant. One pass, longest form
 * first, so a replacement can never cascade into another. Spaces inside a phrase match any run of
 * whitespace, because engines differ in how they space words.
 */
export function applyVocabularyDetailed(
  text: string,
  entries: VocabularyEntry[]
): { text: string; hits: VocabularyHit[] } {
  const rules = rulesOf(entries)
  if (!rules.length || !text) return { text, hits: [] }
  const byForm = new Map(rules.map((rule) => [key(rule.form), rule]))
  const alternatives = rules.map((rule) => rule.form.split(' ').map(escape).join('\\s+')).join('|')
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, 'giu')
  const hits: VocabularyHit[] = []
  const out = text.replace(pattern, (match) => {
    const rule = byForm.get(key(match))
    if (!rule) return match
    if (match !== rule.meant) hits.push({ entryId: rule.entryId, from: match, to: rule.meant })
    return rule.meant
  })
  return { text: out, hits }
}

export function applyVocabulary(text: string, entries: VocabularyEntry[]): string {
  return applyVocabularyDetailed(text, entries).text
}

/**
 * How many trailing words of `text` could still become a learned phrase once more speech arrives.
 * Live typing holds those words back so "as two" is not typed before "teasy" turns it into "S2Teasy".
 */
export function heldTailWords(text: string, entries: VocabularyEntry[]): number {
  const words = clean(text).split(' ').filter(Boolean)
  if (!words.length) return 0
  const forms = rulesOf(entries)
    .filter((rule) => rule.words > 1)
    .map((rule) => rule.form.toLocaleLowerCase().split(' '))
  if (!forms.length) return 0
  const bare = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}_'’-]+$/u, '')
  // Punctuation at the end of the last word means the phrase was interrupted: nothing to hold.
  if (bare(words[words.length - 1]!) !== words[words.length - 1]!.toLocaleLowerCase()) return 0
  let best = 0
  for (const form of forms) {
    for (let n = Math.min(form.length - 1, words.length); n > best; n--) {
      const tail = words.slice(-n).map(bare)
      if (tail.every((word, i) => word === form[i])) {
        best = n
        break
      }
    }
  }
  return best
}

/** Terms sent to engines as recognition hints: what the user means, never the misheard forms. */
export function engineHintTerms(entries: VocabularyEntry[], limit = 100): string[] {
  const terms: string[] = []
  const seen = new Set<string>()
  for (const entry of normalizeVocabulary(entries)) {
    if (!entry.enabled || entry.engineHint === false) continue
    if (seen.has(key(entry.meant))) continue
    seen.add(key(entry.meant))
    terms.push(entry.meant)
    if (terms.length >= limit) break
  }
  return terms
}

/**
 * Remember a fix the user made: add the heard form as a variant of an entry for the same word,
 * or create a new entry. Returns the updated list; never duplicates a heard form.
 */
export function learnFix(
  entries: VocabularyEntry[],
  fix: { heard: string; meant: string; kind: WordKind; clip?: WordClip },
  makeId: () => string,
  now = Date.now()
): VocabularyEntry[] {
  const heard = clean(fix.heard)
  const meant = clean(fix.meant)
  if (!heard || !meant || key(heard) === key(meant)) return entries
  const list = normalizeVocabulary(entries)
  const owner = list.find((entry) => heardForms(entry).some((form) => key(form) === key(heard)))
  const target = list.find((entry) => key(entry.meant) === key(meant))
  const withClip = (entry: VocabularyEntry): VocabularyEntry =>
    fix.clip ? { ...entry, clips: [...(entry.clips ?? []), fix.clip].slice(-MAX_CLIPS) } : entry
  if (owner && key(owner.meant) === key(meant))
    return list.map((entry) => (entry.id === owner.id ? withClip({ ...entry, enabled: true }) : entry))
  // A heard form that currently points somewhere else moves to the word the user just chose.
  const freed = owner
    ? list
        .map((entry) => {
          if (entry.id !== owner.id) return entry
          const rest = heardForms(entry).filter((form) => key(form) !== key(heard))
          return rest.length ? { ...entry, heard: rest[0]!, variants: rest.slice(1) } : null
        })
        .filter((entry): entry is VocabularyEntry => entry !== null)
    : list
  if (target)
    return normalizeVocabulary(
      freed.map((entry) =>
        entry.id === target.id
          ? withClip({ ...entry, enabled: true, variants: [...(entry.variants ?? []), heard] })
          : entry
      )
    )
  return normalizeVocabulary([
    ...freed,
    withClip({ id: makeId(), heard, meant, enabled: true, kind: fix.kind, createdAt: now })
  ])
}

/** Add fix counts from one session to each entry's running totals. */
export function recordHits(entries: VocabularyEntry[], hits: VocabularyHit[]): VocabularyEntry[] {
  if (!hits.length) return entries
  const counts = new Map<string, number>()
  for (const hit of hits) counts.set(hit.entryId, (counts.get(hit.entryId) ?? 0) + 1)
  return entries.map((entry) =>
    counts.has(entry.id)
      ? {
          ...entry,
          stats: {
            fixed: (entry.stats?.fixed ?? 0) + counts.get(entry.id)!,
            heardRight: entry.stats?.heardRight ?? 0,
            missed: entry.stats?.missed ?? 0
          }
        }
      : entry
  )
}
