import type { HistoryItem } from '@shared/types'
import {
  heardForms,
  normalizeVocabulary,
  type VocabularyEntry,
  type WordKind
} from '@shared/vocabulary'

export const MAX_WORDS = 500
export const MAX_TEXT = 120

export const KIND_LABEL: Record<WordKind, string> = {
  name: 'Name',
  accent: 'How I say it',
  keyword: 'Keyword',
  phrase: 'Phrase',
  rule: 'Rule'
}

/** Kinds a person can choose; "Rule" only exists for words saved by older versions. */
export const PICKABLE_KINDS: WordKind[] = ['name', 'accent', 'keyword', 'phrase']

const clean = (value: string) => value.replace(/\s+/gu, ' ').trim()
const key = (value: string) => clean(value).toLocaleLowerCase()

export const kindOf = (entry: VocabularyEntry): WordKind => entry.kind ?? 'rule'

/** How often the recognizer got this word right without help, for the small track. */
export function recognition(entry: VocabularyEntry): { good: number; missed: number; total: number } | null {
  const stats = entry.stats
  if (!stats) return null
  const good = stats.fixed + stats.heardRight
  const total = good + stats.missed
  return total > 0 ? { good, missed: stats.missed, total } : null
}

export function statsSentence(entry: VocabularyEntry): string {
  const s = entry.stats
  if (!s || s.fixed + s.heardRight + s.missed === 0) return 'Not seen in a session yet.'
  const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`
  return `Fixed ${times(s.fixed)} · heard right ${s.heardRight} · fixed by hand ${s.missed}`
}

/**
 * Words to practice, most useful first: the most misses, then the fewest uses. A requested word
 * (from a link elsewhere in the app) always leads, even when it is not saved yet.
 */
export function practiceQueue(entries: VocabularyEntry[], requested = ''): string[] {
  const uses = (e: VocabularyEntry) => (e.stats ? e.stats.fixed + e.stats.heardRight + e.stats.missed : 0)
  const seen = new Set<string>()
  const out: string[] = []
  const push = (word: string) => {
    const k = key(word)
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(clean(word))
  }
  push(requested)
  const ranked = entries
    .filter((e) => e.enabled)
    .sort(
      (a, b) =>
        (b.stats?.missed ?? 0) - (a.stats?.missed ?? 0) ||
        uses(a) - uses(b) ||
        a.meant.localeCompare(b.meant)
    )
  for (const entry of ranked) push(entry.meant)
  return out
}

/** Same words, ignoring case, punctuation and spacing (recognition, not pronunciation). */
export function sameWords(a: string, b: string): boolean {
  const norm = (text: string) =>
    (text.normalize('NFC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu) ?? []).join(' ')
  const x = norm(a)
  return x !== '' && x === norm(b)
}

export type TakeResult =
  | { kind: 'right'; heard: string }
  | { kind: 'fixed'; heard: string }
  | { kind: 'new'; heard: string }
  | { kind: 'empty'; heard: '' }

export type Take = { id: string; number: number; createdAt: number; result: TakeResult }

/** Compare what the engine heard with the target. "Fixed" means a saved heard-as already covers it. */
export function compareTake(item: Pick<HistoryItem, 'rawText'>, target: string, entries: VocabularyEntry[]): TakeResult {
  const heard = clean(item.rawText ?? '')
  if (!heard) return { kind: 'empty', heard: '' }
  if (sameWords(heard, target)) return { kind: 'right', heard }
  const covered = entries.some(
    (e) => e.enabled && sameWords(e.meant, target) && heardForms(e).some((form) => sameWords(form, heard))
  )
  return { kind: covered ? 'fixed' : 'new', heard }
}

/** Takes for one word, newest first, numbered in the order they were made. */
export function takesFor(history: HistoryItem[], target: string, entries: VocabularyEntry[]): Take[] {
  const rows = history
    .filter((h) => h.source === 'practice' && h.status !== 'cancelled' && h.practiceTarget && sameWords(h.practiceTarget, target))
    .sort((a, b) => a.createdAt - b.createdAt)
  return rows
    .map((row, i) => ({ id: row.id, number: i + 1, createdAt: row.createdAt, result: compareTake(row, target, entries) }))
    .reverse()
}

export type EditResult = { ok: true; vocabulary: VocabularyEntry[] } | { ok: false; error: string }

/** Which saved word already owns this heard form, if any (excluding one entry). */
export function ownerOf(entries: VocabularyEntry[], form: string, except = ''): VocabularyEntry | undefined {
  return entries.find((e) => e.id !== except && heardForms(e).some((f) => key(f) === key(form)))
}

/** Normalizing must keep every entry and every heard form; otherwise something would be silently dropped. */
function checked(before: VocabularyEntry[], next: VocabularyEntry[]): EditResult {
  const out = normalizeVocabulary(next)
  const forms = (list: VocabularyEntry[]) => list.reduce((n, e) => n + heardForms(e).length, 0)
  if (out.length !== next.length || forms(out) !== forms(next)) {
    return { ok: false, error: 'That change would drop a saved word, so nothing was changed.' }
  }
  void before
  return { ok: true, vocabulary: out }
}

export function addWord(
  entries: VocabularyEntry[],
  input: { heard: string; meant: string; kind: WordKind },
  makeId: () => string,
  now = Date.now()
): EditResult {
  const heard = clean(input.heard)
  const meant = clean(input.meant)
  if (!heard || !meant) return { ok: false, error: 'Type both what it hears and what you mean.' }
  if (heard.length > MAX_TEXT || meant.length > MAX_TEXT) return { ok: false, error: `Keep each part under ${MAX_TEXT} characters.` }
  if (key(heard) === key(meant)) return { ok: false, error: 'What it hears and what you mean are the same.' }
  const owner = ownerOf(entries, heard)
  if (owner) return { ok: false, error: `“${heard}” is already heard as “${owner.meant}”.` }
  const same = entries.find((e) => key(e.meant) === key(meant))
  if (same) {
    // Same word again: treat as one more way it gets misheard.
    return checked(entries, entries.map((e) => (e.id === same.id ? { ...e, enabled: true, variants: [...(e.variants ?? []), heard] } : e)))
  }
  if (entries.length >= MAX_WORDS) return { ok: false, error: `You can keep up to ${MAX_WORDS} words. Forget one first.` }
  return checked(entries, [
    ...entries,
    { id: makeId(), heard, meant, enabled: true, kind: input.kind, engineHint: input.kind === 'name' || input.kind === 'keyword' || input.kind === 'phrase', createdAt: now }
  ])
}

export function patchWord(entries: VocabularyEntry[], id: string, patch: Partial<VocabularyEntry>): EditResult {
  if (!entries.some((e) => e.id === id)) return { ok: false, error: 'That word is no longer saved.' }
  return checked(entries, entries.map((e) => (e.id === id ? { ...e, ...patch } : e)))
}

export function setKind(entries: VocabularyEntry[], id: string, kind: WordKind): EditResult {
  // "How I say it" words only fix text afterwards; they never go to the speech engine.
  return patchWord(entries, id, kind === 'accent' ? { kind, engineHint: false } : { kind })
}

export function setHint(entries: VocabularyEntry[], id: string, hint: string): EditResult {
  const text = clean(hint).slice(0, 60)
  const next = entries.map((e) => {
    if (e.id !== id) return e
    const { hint: _old, ...rest } = e
    return text ? { ...rest, hint: text } : rest
  })
  return checked(entries, next)
}

export function addHeardAs(entries: VocabularyEntry[], id: string, form: string): EditResult {
  const entry = entries.find((e) => e.id === id)
  const value = clean(form)
  if (!entry) return { ok: false, error: 'That word is no longer saved.' }
  if (!value) return { ok: false, error: 'Type what it hears.' }
  if (value.length > MAX_TEXT) return { ok: false, error: `Keep it under ${MAX_TEXT} characters.` }
  if (key(value) === key(entry.meant)) return { ok: false, error: 'That is already the word you mean.' }
  const owner = ownerOf(entries, value)
  if (owner) {
    return {
      ok: false,
      error: owner.id === id ? `“${value}” is already in the list.` : `“${value}” is already heard as “${owner.meant}”.`
    }
  }
  if ((entry.variants?.length ?? 0) >= 11) return { ok: false, error: 'A word can have up to 12 heard-as forms.' }
  return patchWord(entries, id, { variants: [...(entry.variants ?? []), value] })
}

export function removeHeardAs(entries: VocabularyEntry[], id: string, form: string): EditResult {
  const entry = entries.find((e) => e.id === id)
  if (!entry) return { ok: false, error: 'That word is no longer saved.' }
  const rest = heardForms(entry).filter((f) => key(f) !== key(form))
  if (!rest.length) return { ok: false, error: 'A word needs at least one heard-as form. Forget the word instead.' }
  return patchWord(entries, id, { heard: rest[0]!, variants: rest.slice(1) })
}

export function forgetWord(entries: VocabularyEntry[], id: string): VocabularyEntry[] {
  return entries.filter((e) => e.id !== id)
}

export function filterWords(entries: VocabularyEntry[], query: string): VocabularyEntry[] {
  const q = key(query)
  if (!q) return entries
  return entries.filter((e) => key([e.meant, ...heardForms(e), e.hint ?? ''].join(' ')).includes(q))
}
