/**
 * Speech tidy: takes the stumbles out of dictated text without rewording it. Stutters, fillers,
 * restarts and corrected words go; the person's own words, order and tone stay. Runs locally, no model.
 */

export type TidySettings = {
  /** Tidy every take by itself (live typing: at the end of the take). The HUD button works either way. */
  auto: boolean
  /** "I I want", "th- the", "to the, to the store". */
  stutters: boolean
  /** um, uh, erm. */
  fillers: boolean
  /** "the store, I mean the mall", "that would, that would be". */
  corrections: boolean
  /** A full stop and capital the engine put in a pause mid-thought: "I went to the. Store". */
  pauseBreaks: boolean
}

export const defaultTidySettings = (): TidySettings => ({
  auto: true,
  stutters: true,
  fillers: true,
  corrections: true,
  pauseBreaks: true
})

export function normalizeTidy(value: unknown): TidySettings {
  const base = defaultTidySettings()
  if (!value || typeof value !== 'object') return base
  const v = value as Record<string, unknown>
  const flag = (key: keyof TidySettings) => (typeof v[key] === 'boolean' ? (v[key] as boolean) : base[key])
  return {
    auto: flag('auto'),
    stutters: flag('stutters'),
    fillers: flag('fillers'),
    corrections: flag('corrections'),
    pauseBreaks: flag('pauseBreaks')
  }
}

export type TidyChange = { kind: 'stutter' | 'filler' | 'correction' | 'pause'; removed: string }
export type TidyResult = { text: string; changes: TidyChange[] }

type Tok = { text: string; key: string }

const keyOf = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, '')
const toks = (text: string): Tok[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, key: keyOf(t) }))
const join = (list: Tok[]) => list.map((t) => t.text).join(' ')
/** Punctuation after the word: a clause or sentence ends here. */
const breaksAfter = (t: Tok) => /[,;:.!?…—-]["')\]]*$/.test(t.text) && !/^\p{L}+-$/u.test(t.text)
const endsSentence = (t: Tok) => /[.!?…]["')\]]*$/.test(t.text)
const trailing = (t: Tok) => t.text.match(/[^\p{L}\p{N}']+$/u)?.[0] ?? ''
const withEnding = (t: Tok, ending: string): Tok => ({ ...t, text: t.text.replace(/[^\p{L}\p{N}']+$/u, '') + ending })

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'hmm', 'mm', 'ah', 'eh'])
// Words that are fine twice in a row ("I knew that that was it", "she had had enough").
const REAL_DOUBLES = new Set(['that', 'had', 'is', 'do', 'very', 'really', 'so', 'no', 'bye', 'ha', 'haha', 'yeah'])
// Said right before a correction: what came just before is replaced by what follows.
const MARKERS: string[][] = [
  ['i', 'mean'],
  ['sorry'],
  ['no', 'wait'],
  ['wait', 'no'],
  ['or', 'rather'],
  ['scratch', 'that'],
  ['let', 'me', 'rephrase', 'that'],
  ['let', 'me', 'rephrase'],
  ["i'm", 'sorry'],
  ['i', 'meant']
]
// A sentence that ends on one of these was cut by a pause, not finished.
const OPEN_ENDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'but', 'or', 'with', 'for', 'in', 'on', 'at', 'from', 'by', 'about',
  'my', 'your', 'our', 'their', 'his', 'her', 'its', 'this', 'these', 'those', 'that', 'because', 'if',
  'when', 'than', 'then', 'so', 'is', 'are', 'was', 'were', 'be', 'been', 'am', "i'm", "it's", 'into',
  'onto', 'like', 'as', 'some', 'any', 'every', 'very', 'just', 'also', 'not', 'will', 'would', 'can',
  'could', 'should', 'might', 'must', 'have', 'has', 'had', 'do', 'does', 'did', 'we', 'they', 'you', 'i'
])

/** "b-b-but" → "but"; "th-" before "the" is dropped by the caller. */
function unstammer(tok: Tok): Tok | null {
  const m = tok.text.match(/^(?:(\p{L}{1,3})-)+(\p{L}[\p{L}\p{N}']*)(.*)$/u)
  if (!m) return null
  const [, part, word, rest] = m
  if (!word.toLocaleLowerCase().startsWith(part.toLocaleLowerCase())) return null
  const keepCase = tok.text[0] === tok.text[0].toLocaleUpperCase() && tok.text[0] !== tok.text[0].toLocaleLowerCase()
  const out = keepCase ? word[0].toLocaleUpperCase() + word.slice(1) : word
  return { text: out + rest, key: keyOf(out) }
}

function stutters(list: Tok[], changes: TidyChange[]): Tok[] {
  const out: Tok[] = []
  for (let i = 0; i < list.length; i++) {
    let tok = list[i]
    const fixed = unstammer(tok)
    if (fixed) {
      changes.push({ kind: 'stutter', removed: tok.text })
      tok = fixed
    }
    // A cut-off start: "th- the", "wa- want".
    const next = list[i + 1]
    const cut = tok.text.match(/^(\p{L}{1,6})-$/u)
    if (cut && next && next.key.startsWith(cut[1].toLocaleLowerCase())) {
      changes.push({ kind: 'stutter', removed: tok.text })
      continue
    }
    const prev = out[out.length - 1]
    // The same word again ("I I", "I, I"), unless that double is real English.
    if (prev && tok.key && prev.key === tok.key && !REAL_DOUBLES.has(tok.key) && !endsSentence(prev)) {
      changes.push({ kind: 'stutter', removed: prev.text })
      out[out.length - 1] = { ...tok, text: matchCase(prev.text, tok.text) }
      continue
    }
    out.push(tok)
  }
  // The same 2–4 words again: "to the, to the store".
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + 2 * n <= out.length; i++) {
      const a = out.slice(i, i + n)
      const b = out.slice(i + n, i + 2 * n)
      if (a.every((t, k) => t.key && t.key === b[k].key) && !endsSentence(a[n - 1])) {
        changes.push({ kind: 'stutter', removed: join(a) })
        out.splice(i, n, ...b.map((t, k) => (k === 0 ? { ...t, text: matchCase(a[0].text, t.text) } : t)))
        out.splice(i + n, n)
        i--
      }
    }
  }
  return out
}

/** Keep a capital the sentence needs: "I, I" stays "I"; "The the" stays "The". */
function matchCase(first: string, second: string): string {
  const cap = first[0] && first[0] !== first[0].toLocaleLowerCase()
  if (!cap) return second
  return second[0].toLocaleUpperCase() + second.slice(1)
}

function fillers(list: Tok[], changes: TidyChange[]): Tok[] {
  const out: Tok[] = []
  // A filler that opened a sentence ("Um, so") hands its capital to the word after it.
  let capNext = false
  for (const tok of list) {
    if (FILLERS.has(tok.key)) {
      changes.push({ kind: 'filler', removed: tok.text })
      const prev = out[out.length - 1]
      if ((!prev || endsSentence(prev)) && tok.text[0] !== tok.text[0].toLocaleLowerCase()) capNext = true
      // "we, um." keeps the sentence's own punctuation on the word before, if it ended there.
      if (prev && endsSentence(tok) && !breaksAfter(prev)) out[out.length - 1] = withEnding(prev, trailing(tok))
      continue
    }
    out.push(capNext ? { ...tok, text: capital(tok.text) } : tok)
    capNext = false
  }
  return out
}

function markerAt(list: Tok[], i: number): number {
  for (const m of MARKERS) if (m.every((w, k) => list[i + k]?.key === w)) return m.length
  return 0
}

/**
 * Corrections. With a marker ("I mean", "sorry", "no wait"), the words after it replace the part
 * before it that starts with the same word ("to the store, I mean the mall" → "to the mall"); without
 * one, a short clause that is restarted with the same two words goes ("I want to, I want to go").
 */
function corrections(list: Tok[], changes: TidyChange[]): Tok[] {
  let out = [...list]
  for (let i = 1; i < out.length; i++) {
    const len = markerAt(out, i)
    if (!len) continue
    const before = out.slice(0, i)
    const after = out.slice(i + len)
    if (!after.length) continue
    // Only a marker that stands apart ("store, I mean the") or starts its own sentence counts.
    const apart = breaksAfter(before[before.length - 1]) || breaksAfter(out[i + len - 1])
    if (!apart) continue
    const first = after[0].key
    // The repaired part starts at the last earlier use of the first word after the marker, within the
    // same sentence and at most 8 words back.
    let from = -1
    for (let k = before.length - 1; k >= Math.max(0, before.length - 8); k--) {
      if (k < before.length - 1 && endsSentence(before[k])) break
      if (before[k].key === first) {
        from = k
        break
      }
    }
    const scratch = out[i].key === 'scratch' || out[i].key === 'let'
    if (from < 0 && !scratch) continue
    if (from < 0) {
      // "scratch that" / "let me rephrase": the sentence before it goes.
      let start = before.length - 1
      while (start > 0 && !endsSentence(before[start - 1])) start--
      from = start
    }
    const removed = out.slice(from, i + len)
    changes.push({ kind: 'correction', removed: join(removed) })
    const kept = before.slice(0, from)
    const head = after[0]
    const fixedHead = { ...head, text: from === 0 || endsSentence(kept[kept.length - 1]) ? capital(head.text) : matchCase(before[from].text, head.text) }
    out = [...kept, fixedHead, ...after.slice(1)]
    i = Math.max(0, from - 1)
  }
  // Restart without a marker: "that would, that would be great" is a stutter; "I want to, I need to go"
  // (same first two words, a comma, at most five words before) is a restart.
  for (let i = 1; i < out.length; i++) {
    const prev = out[i - 1]
    if (!/,$/.test(prev.text)) continue
    let start = i - 1
    while (start > 0 && !breaksAfter(out[start - 1])) start--
    const clause = out.slice(start, i)
    if (clause.length > 5 || clause.length < 2) continue
    const [a, b] = [out[i], out[i + 1]]
    if (!a || !b || a.key !== clause[0].key || b.key !== clause[1].key) continue
    if (out.slice(i).length <= clause.length) continue // the restart must say more than the first try
    changes.push({ kind: 'correction', removed: join(clause) })
    out.splice(start, clause.length)
    out[start] = { ...out[start], text: matchCase(clause[0].text, out[start].text) }
    i = start
  }
  return out
}

/**
 * Pause breaks: "I went to the. Store is closed" → "I went to the store is closed" only where the
 * full stop follows a word no sentence ends on. `names` are words to keep capitalised.
 */
function pauseBreaks(list: Tok[], changes: TidyChange[], names: Set<string>): Tok[] {
  const out = [...list]
  const seenLower = new Set(list.filter((t) => /^\p{Ll}/u.test(t.text)).map((t) => t.key))
  for (let i = 0; i < out.length - 1; i++) {
    const tok = out[i]
    if (!/[.]$/.test(tok.text) || /\.\.$/.test(tok.text)) continue
    if (!OPEN_ENDS.has(tok.key)) continue
    const next = out[i + 1]
    changes.push({ kind: 'pause', removed: `${tok.text} ${next.text}` })
    out[i] = withEnding(tok, '')
    out[i + 1] = { ...next, text: lowerUnlessName(next.text, names, seenLower) }
  }
  return out
}

// Words that are lowercase mid-sentence; anything else after a pause might be a name and keeps its capital.
const COMMON = new Set([
  ...OPEN_ENDS,
  'it', 'he', 'she', 'me', 'him', 'them', 'us', 'what', 'which', 'who', 'where', 'why', 'how', 'all',
  'more', 'most', 'other', 'there', 'here', 'now', 'today', 'tomorrow', 'yesterday', 'again', 'still',
  'even', 'only', 'really', 'maybe', 'probably', 'actually', 'basically', 'kind', 'sort', 'thing',
  'things', 'stuff', 'way', 'time', 'people', 'person', 'work', 'store', 'home', 'go', 'going', 'get',
  'getting', 'make', 'making', 'want', 'need', 'think', 'know', 'see', 'say', 'said', 'tell', 'look',
  'use', 'using', 'try', 'trying', 'put', 'take', 'give', 'come', 'came', 'went', 'got', 'made', 'one',
  'two', 'three', 'first', 'next', 'last', 'new', 'good', 'great', 'better', 'best', 'same', 'different',
  'much', 'many', 'lot', 'little', 'big', 'small', 'right', 'left', 'up', 'down', 'out', 'over', 'back',
  'after', 'before', 'while', 'until', 'since', 'through', 'without', 'within', 'between', 'under',
  'typing', 'talking', 'speaking', 'saying', 'writing', 'output', 'input', 'text', 'word', 'words',
  'button', 'box', 'field', 'file', 'page', 'screen', 'app', 'issue', 'issues', 'problem', 'idea'
])

function lowerUnlessName(word: string, names: Set<string>, seenLower: Set<string> = new Set()): string {
  const key = keyOf(word)
  if (key === 'i' || key.startsWith("i'") || names.has(word.replace(/[^\p{L}\p{N}']+/gu, ''))) return word
  // Only a plain capital (not iPhone, NASA, McDonald) on a word that is lowercase mid-sentence.
  if (!/^\p{Lu}[\p{Ll}']*[^\p{L}]*$/u.test(word)) return word
  if (!COMMON.has(key) && !seenLower.has(key)) return word
  return word[0].toLocaleLowerCase() + word.slice(1)
}

const capital = (word: string) => (word ? word[0].toLocaleUpperCase() + word.slice(1) : word)


/**
 * Tidy dictated text. `names` are words that keep their capital (personal words, names).
 * Text in square brackets (speech cues like [laughs]) is left alone.
 */
export function tidySpeech(text: string, settings: TidySettings, names: Iterable<string> = []): TidyResult {
  const changes: TidyChange[] = []
  const nameSet = new Set(names)
  // Cue tags are kept out of the word logic and put back where they were.
  const parts = text.split(/(\[[^\]]*\])/)
  const tidied = parts.map((part) => {
    if (/^\[[^\]]*\]$/.test(part) || !part.trim()) return part
    let list = toks(part)
    if (settings.fillers) list = fillers(list, changes)
    if (settings.stutters) list = stutters(list, changes)
    if (settings.corrections) list = corrections(list, changes)
    if (settings.pauseBreaks) list = pauseBreaks(list, changes, nameSet)
    const lead = part.match(/^\s*/)?.[0] ?? ''
    const tail = part.match(/\s*$/)?.[0] ?? ''
    return list.length ? lead + join(list) + tail : lead
  })
  return { text: tidied.join('').replace(/\s{2,}/g, ' ').trim(), changes }
}

/**
 * Tidy the next piece of a take that is being typed as it is spoken. `before` is what is already
 * typed (it can no longer change here), so the piece is tidied with its last words as context: a
 * word repeated across the join goes, and a capital the engine put after a pause, mid-thought, is
 * lowered. A piece that ends on a word no sentence ends on ("to the.") loses that full stop.
 */
export function tidyNext(before: string, piece: string, settings: TidySettings, names: Iterable<string> = []): TidyResult {
  const nameSet = new Set(names)
  const own = tidySpeech(piece, settings, nameSet)
  let list = toks(own.text)
  const changes = [...own.changes]
  const prior = toks(before)
  const last = prior[prior.length - 1]
  if (!list.length) return own
  if (last && settings.stutters && !endsSentence(last)) {
    // "…I" + "I want" / "…to the," + "to the store": drop what repeats the end of the typed text.
    for (let n = Math.min(4, list.length - 1, prior.length); n >= 1; n--) {
      const tail = prior.slice(-n)
      if (tail.every((t, k) => t.key && t.key === list[k].key) && !(n === 1 && REAL_DOUBLES.has(tail[0].key))) {
        changes.push({ kind: 'stutter', removed: join(list.slice(0, n)) })
        list = list.slice(n)
        break
      }
    }
  }
  if (settings.pauseBreaks && list.length) {
    if (last && !breaksAfter(last) && /^\p{Lu}/u.test(list[0].text)) {
      const lowered = lowerUnlessName(list[0].text, nameSet)
      if (lowered !== list[0].text) {
        changes.push({ kind: 'pause', removed: list[0].text })
        list[0] = { ...list[0], text: lowered }
      }
    }
    const end = list[list.length - 1]
    if (/[^.]\.$/.test(end.text) && OPEN_ENDS.has(end.key) && end.key !== 'i') {
      changes.push({ kind: 'pause', removed: end.text })
      list[list.length - 1] = withEnding(end, '')
    }
  }
  return { text: join(list), changes }
}

/** "3 stutters, 1 correction" for a notice. */
export function describeTidy(changes: TidyChange[]): string {
  const count = (kind: TidyChange['kind']) => changes.filter((c) => c.kind === kind).length
  const parts: string[] = []
  const add = (n: number, one: string, many: string) => n && parts.push(`${n} ${n === 1 ? one : many}`)
  add(count('stutter'), 'stutter', 'stutters')
  add(count('filler'), 'filler', 'fillers')
  add(count('correction'), 'correction', 'corrections')
  add(count('pause'), 'pause break', 'pause breaks')
  return parts.join(', ')
}
