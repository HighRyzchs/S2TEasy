/**
 * Speech tidy: takes the stumbles out of dictated text without rewording it. Stutters, fillers,
 * restarts and corrected words go; the person's own words, order and tone stay. Runs locally, no model.
 * Every rule leans towards leaving text alone: a missed stutter is a small annoyance, a deleted
 * word someone meant is a wrong text.
 */

/** Languages people mix into English dictation. Their doubles are meant, and their words can be written in their own script. */
export const MIXED_LANGUAGES = [
  { code: 'tl', name: 'Tagalog (Taglish)', native: null },
  { code: 'ar', name: 'Arabic', native: 'Arabic script' },
  { code: 'hi', name: 'Hindi / Urdu (Hinglish)', native: 'Devanagari' }
] as const
export type LanguageCode = (typeof MIXED_LANGUAGES)[number]['code']
export type MixedLanguage = {
  code: LanguageCode
  /** How its words are written: in English letters as the engine heard them, or in the language's own script. */
  script: 'latin' | 'native'
}

export type TidySettings = {
  /** Tidy every take by itself (live typing: at the end of the take). The HUD button works either way. */
  auto: boolean
  /** "I I want", "th- the", "to the, to the store". */
  stutters: boolean
  /** um, uh, erm. */
  fillers: boolean
  /** "the store, I mean the mall", "I want to, I want to go". */
  corrections: boolean
  /** A full stop and capital the engine put in a pause mid-thought: "I went to the. Store". */
  pauseBreaks: boolean
  /** Other languages in the person's speech. */
  languages: MixedLanguage[]
  /** The person's own words said twice on purpose ("Bora Bora", a nickname). */
  keepDoubles: string[]
}

export const defaultTidySettings = (): TidySettings => ({
  auto: true,
  stutters: true,
  fillers: true,
  corrections: true,
  pauseBreaks: true,
  languages: [],
  keepDoubles: []
})

export function normalizeTidy(value: unknown): TidySettings {
  const base = defaultTidySettings()
  if (!value || typeof value !== 'object') return base
  const v = value as Record<string, unknown>
  const flag = (key: 'auto' | 'stutters' | 'fillers' | 'corrections' | 'pauseBreaks') =>
    typeof v[key] === 'boolean' ? (v[key] as boolean) : base[key]
  const codes = new Set<string>(MIXED_LANGUAGES.map((l) => l.code))
  const languages = Array.isArray(v.languages)
    ? (v.languages as unknown[]).flatMap((l) => {
        const item = l as Partial<MixedLanguage> | null
        if (!item || typeof item.code !== 'string' || !codes.has(item.code)) return []
        return [{ code: item.code as LanguageCode, script: item.script === 'native' ? 'native' : 'latin' } as MixedLanguage]
      })
    : []
  const keepDoubles = Array.isArray(v.keepDoubles)
    ? (v.keepDoubles as unknown[]).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()).slice(0, 200)
    : []
  return {
    auto: flag('auto'),
    stutters: flag('stutters'),
    fillers: flag('fillers'),
    corrections: flag('corrections'),
    pauseBreaks: flag('pauseBreaks'),
    languages: languages.filter((l, i) => languages.findIndex((x) => x.code === l.code) === i),
    keepDoubles
  }
}

export type TidyChange = { kind: 'stutter' | 'filler' | 'correction' | 'pause' | 'script'; removed: string }
export type TidyResult = { text: string; changes: TidyChange[] }

type Tok = { text: string; key: string }

const keyOf = (word: string) => word.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, '')
const tok = (text: string): Tok => ({ text, key: keyOf(text) })
const toks = (text: string): Tok[] => text.split(/[ \t]+/).filter(Boolean).map(tok)
const join = (list: Tok[]) => list.map((t) => t.text).join(' ')
/** Punctuation after the word: a clause or sentence ends here. */
const breaksAfter = (t: Tok) => /[,;:.!?…—]["')\]]*$/.test(t.text)
const endsSentence = (t: Tok) => /[.!?…]["')\]]*$/.test(t.text)
const leading = (text: string) => text.match(/^[^\p{L}\p{N}]*/u)?.[0] ?? ''
const trailing = (text: string) => text.match(/[^\p{L}\p{N}']*$/u)?.[0] ?? ''
const bare = (text: string) => text.slice(leading(text).length, text.length - trailing(text).length || undefined)
const withEnding = (t: Tok, ending: string): Tok => ({ ...t, text: t.text.slice(0, t.text.length - trailing(t.text).length) + ending })
const firstLetter = (text: string) => text.match(/\p{L}/u)?.[0] ?? ''
/** Whether the first letter (after any opening quote or bracket) is a capital. */
const isCapital = (text: string) => {
  const c = firstLetter(text)
  return !!c && c !== c.toLocaleLowerCase()
}
const capital = (text: string) => text.replace(/\p{L}/u, (c) => c.toLocaleUpperCase())
const lower = (text: string) => text.replace(/\p{L}/u, (c) => c.toLocaleLowerCase())
/** Numbers, prices, tags, versions, code: never treated as a stutter ("dial 9 9 9", "#tag #tag"). */
const literal = (t: Tok) => /[\p{N}#@$+/=<>_*]|\p{L}\.\p{L}/u.test(t.text)

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'uhm', 'erm', 'er', 'hmm', 'hm', 'mm'])
// Spoken answers that look like fillers: kept as they are.
const ANSWERS = [['uh', 'huh'], ['uh', 'uh'], ['mm', 'hmm'], ['mhm'], ['hmm', 'mm']]
// English words people say twice on purpose, with nothing between ("very very good", "had had").
const DOUBLES = new Set([
  'that', 'had', 'is', 'do', 'very', 'really', 'so', 'no', 'yes', 'bye', 'ha', 'haha', 'hehe', 'yeah',
  'okay', 'ok', 'well', 'more', 'far', 'again', 'over', 'round', 'on', 'pretty', 'super', 'too',
  'cha', 'chop', 'tut', 'knock', 'tsk', 'night'
])
// Doubles that are words in the languages people mix in ("araw araw" is "every day").
const LANGUAGE_DOUBLES: Record<LanguageCode, string[]> = {
  tl: [
    'araw', 'dahan', 'unti', 'isa', 'ano', 'gabi', 'tuloy', 'lagi', 'minsan', 'paunti', 'kanya', 'bahala',
    'sige', 'oo', 'tama', 'po', 'naman', 'hindi', 'sabay', 'iba', 'halo', 'sari', 'buwan', 'taon', 'linggo',
    'basta', 'grabe', 'sana', 'dali', 'tagal', 'bili', 'lakad', 'takbo', 'kain', 'sino', 'saan', 'kanina',
    'bukas', 'ngayon', 'talaga', 'sobra', 'galing', 'ganda', 'pa', 'na', 'lang', 'din', 'rin', 'ha', 'ay'
  ],
  ar: [
    'habibi', 'habibti', 'yalla', 'khalas', 'shwayya', 'shway', 'mashallah', 'inshallah', 'wallah', 'wallahi',
    'ya', 'bas', 'tayeb', 'ahlan', 'marhaba', 'la', 'aywa', 'shukran', 'salam', 'akhi', 'yani', 'mafi'
  ],
  hi: [
    'jaldi', 'dheere', 'dhire', 'kya', 'kaun', 'kahan', 'kabhi', 'alag', 'saath', 'bahut', 'thoda', 'chalo',
    'haan', 'accha', 'acha', 'garam', 'ghar', 'baar', 'sab', 'apne', 'yaar', 'bhai', 'arre', 'chal', 'ruk'
  ]
}
// Words in the language's own script, for people who want them written that way.
const NATIVE: Record<LanguageCode, Record<string, string>> = {
  tl: {},
  ar: {
    yalla: 'يلا', inshallah: 'إن شاء الله', "insha'allah": 'إن شاء الله', mashallah: 'ما شاء الله',
    "masha'allah": 'ما شاء الله', alhamdulillah: 'الحمد لله', habibi: 'حبيبي', habibti: 'حبيبتي',
    wallah: 'والله', wallahi: 'والله', khalas: 'خلاص', shukran: 'شكرا', salam: 'سلام', marhaba: 'مرحبا',
    ahlan: 'أهلا', yani: 'يعني', "ya'ni": 'يعني', akhi: 'أخي', ukhti: 'أختي', subhanallah: 'سبحان الله',
    bismillah: 'بسم الله', tayeb: 'طيب', mafi: 'مافي', shwayya: 'شوية', aywa: 'أيوة', habibti2: 'حبيبتي',
    astaghfirullah: 'أستغفر الله', jazakallah: 'جزاك الله', assalamualaikum: 'السلام عليكم', walaikumsalam: 'وعليكم السلام'
  },
  hi: {
    accha: 'अच्छा', acha: 'अच्छा', yaar: 'यार', bhai: 'भाई', jaldi: 'जल्दी', chalo: 'चलो', haan: 'हाँ',
    nahi: 'नहीं', kya: 'क्या', theek: 'ठीक', arre: 'अरे', bas: 'बस', thoda: 'थोड़ा', bahut: 'बहुत',
    dheere: 'धीरे', matlab: 'मतलब', shukriya: 'शुक्रिया', namaste: 'नमस्ते', ji: 'जी'
  }
}
// Several English words that are one word in the other script ("insha allah").
const NATIVE_PHRASES: Record<LanguageCode, [string[], string][]> = {
  tl: [],
  ar: [
    [['insha', 'allah'], 'إن شاء الله'],
    [['in', 'sha', 'allah'], 'إن شاء الله'],
    [['masha', 'allah'], 'ما شاء الله'],
    [['alhamdu', 'lillah'], 'الحمد لله'],
    [['subhan', 'allah'], 'سبحان الله'],
    [['as', 'salamu', 'alaikum'], 'السلام عليكم'],
    [['salam', 'alaikum'], 'السلام عليكم']
  ],
  hi: [[['theek', 'hai'], 'ठीक है'], [['kya', 'baat', 'hai'], 'क्या बात है']]
}
// Said again for emphasis even with a comma between ("Go, go, go!", "Yes, yes").
const EMPHASIS = new Set(['go', 'yes', 'no', 'well', 'come', 'wait', 'stop', 'please', 'okay', 'ok', 'run', 'faster', 'more', 'thank', 'thanks', 'bravo', 'hurry'])
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
// A sentence that ends on one of these was cut by a pause, not finished ("I went to the. Store").
const CUT_ENDS = new Set(['the', 'a', 'an', 'of', 'and', 'but', 'or', 'my', 'your', 'our', 'their', 'these', 'those', 'because', 'if', 'than', 'every'])
// Cut too, unless what follows starts a sentence of its own ("Who did you go with. Then…").
const MAYBE_CUT = new Set(['to', 'with'])
const OPENERS = new Set(['it', 'i', 'he', 'she', 'we', 'they', 'you', 'then', 'and', 'but', 'so', 'anyway', 'okay', 'ok', 'thanks', 'thank', 'yes', 'no', 'well'])
// A clause that ends on one of these before a comma was given up ("I want to, I want to go").
const OPEN_CLAUSE = new Set([...CUT_ENDS, 'to', 'with', 'for', 'in', 'on', 'at', 'i', 'we', 'you', 'they', 'he', 'she', 'is', 'was', 'be'])
// Words that are lowercase mid-sentence; anything else after a pause might be a name and keeps its capital.
const LOWERCASE = new Set([
  ...CUT_ENDS, ...MAYBE_CUT,
  'it', 'he', 'she', 'we', 'they', 'you', 'me', 'him', 'her', 'them', 'us', 'his', 'its', 'this', 'that',
  'what', 'which', 'who', 'where', 'why', 'how', 'when', 'all', 'some', 'any', 'more', 'most', 'other',
  'there', 'here', 'now', 'then', 'so', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'will', 'would',
  'can', 'could', 'should', 'might', 'must', 'have', 'has', 'had', 'do', 'does', 'did', 'not', 'just',
  'also', 'very', 'really', 'maybe', 'still', 'even', 'only', 'again', 'kind', 'sort', 'thing', 'things',
  'stuff', 'way', 'people', 'going', 'go', 'get', 'make', 'want', 'need', 'think', 'know', 'see', 'say',
  'tell', 'look', 'use', 'try', 'put', 'take', 'give', 'come', 'one', 'two', 'first', 'next', 'last',
  'new', 'good', 'great', 'better', 'same', 'different', 'much', 'many', 'lot', 'little', 'big', 'small',
  'up', 'down', 'out', 'over', 'back', 'after', 'before', 'while', 'in', 'on', 'at', 'for', 'from', 'by',
  'about', 'into', 'typing', 'talking', 'speaking', 'writing', 'output', 'input', 'text', 'word', 'words',
  'button', 'box', 'field', 'file', 'screen', 'issue', 'issues', 'problem', 'idea', 'today', 'tomorrow'
])
const PREFIXES = new Set(['re', 'pre', 'de', 'un', 'co', 'non', 'sub', 'bi', 'tri', 'multi', 'anti', 'semi', 'mid', 'over'])

/** What the rules need from the settings beyond the switches. */
type Context = { names: Set<string>; doubles: Set<string> }

function contextOf(settings: TidySettings, names: Iterable<string>): Context {
  const doubles = new Set(DOUBLES)
  for (const l of settings.languages) for (const w of LANGUAGE_DOUBLES[l.code]) doubles.add(w)
  for (const w of settings.keepDoubles) doubles.add(keyOf(w))
  return { names: new Set(names), doubles }
}

function lowerUnlessName(word: string, names: Set<string>, seenLower: Set<string>): string {
  const key = keyOf(word)
  if (key === 'i' || key.startsWith("i'") || names.has(bare(word))) return word
  // Only a plain capital (not iPhone, NASA, McDonald) on a word that is lowercase mid-sentence.
  if (!/^\p{Lu}[\p{Ll}']*$/u.test(bare(word))) return word
  if (!LOWERCASE.has(key) && !seenLower.has(key)) return word
  return lower(word)
}

/** Keep the first word's opening quote and capital on the word that replaces it. */
function inherit(from: Tok, to: Tok): Tok {
  let text = leading(from.text) + to.text.slice(leading(to.text).length)
  if (isCapital(from.text)) text = capital(text)
  return { ...to, text }
}

// ---- fillers ---------------------------------------------------------------------------------

function fillers(list: Tok[], changes: TidyChange[]): Tok[] {
  const out: Tok[] = []
  let capNext = false
  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    const answer = ANSWERS.find((a) => a.every((w, k) => list[i + k]?.key === w))
    if (answer) {
      for (let k = 0; k < answer.length; k++) out.push(list[i + k])
      i += answer.length - 1
      continue
    }
    if (!FILLERS.has(t.key)) {
      out.push(capNext ? { ...t, text: capital(t.text) } : t)
      capNext = false
      continue
    }
    changes.push({ kind: 'filler', removed: t.text })
    const prev = out[out.length - 1]
    // "Um, so" → "So": a filler that opened a sentence hands its capital on.
    if ((!prev || endsSentence(prev)) && isCapital(t.text)) capNext = true
    // "Okay, um." → "Okay.": the sentence's own ending moves to the word before.
    if (prev && endsSentence(t)) {
      out[out.length - 1] = withEnding(prev, trailing(t.text).replace(/^[,;:]+/, ''))
      capNext = true
    }
  }
  // A take that was nothing but "hmm" stays what it was.
  return out.length ? out : list
}

// ---- stutters --------------------------------------------------------------------------------

/** "b-b-but" → "but". */
function unstammer(t: Tok): Tok | null {
  const m = t.text.match(/^([^\p{L}]*)((?:\p{L}{1,3}-)+)(\p{L}[\p{L}\p{N}']*)(.*)$/u)
  if (!m) return null
  const [, open, parts, word, rest] = m
  const pieces = parts.split('-').filter(Boolean)
  const part = pieces[0].toLocaleLowerCase()
  if (!pieces.every((p) => p.toLocaleLowerCase() === part)) return null
  if (!word.toLocaleLowerCase().startsWith(part)) return null
  // "re-read", "co-op": a prefix said once is part of the word.
  if (PREFIXES.has(part) && pieces.length < 2) return null
  const out = isCapital(pieces[0]) ? capital(word) : word
  return tok(open + out + rest)
}

function stutters(list: Tok[], changes: TidyChange[], ctx: Context): Tok[] {
  const out: Tok[] = []
  const words = [...list]
  for (let i = 0; i < words.length; i++) {
    let t = words[i]
    const fixed = unstammer(t)
    if (fixed) {
      changes.push({ kind: 'stutter', removed: t.text })
      t = fixed
    }
    // A cut-off start: "th- the", "wa- want".
    const next = words[i + 1]
    const cut = t.text.match(/^[^\p{L}]*(\p{L}{1,6})-$/u)
    if (cut && next && next.key.startsWith(cut[1].toLocaleLowerCase()) && next.key !== cut[1].toLocaleLowerCase()) {
      changes.push({ kind: 'stutter', removed: t.text })
      words[i + 1] = inherit(t, next)
      continue
    }
    const prev = out[out.length - 1]
    if (prev && t.key && prev.key === t.key && !endsSentence(prev) && !literal(t) && !literal(prev)) {
      const apart = breaksAfter(prev)
      const meant =
        (!apart && ctx.doubles.has(t.key)) ||
        EMPHASIS.has(t.key) ||
        // Names said twice ("Bora Bora", "New York, New York") start with a capital mid-sentence.
        (t.key !== 'i' && isCapital(prev.text) && isCapital(t.text) && out.length > 1 && !endsSentence(out[out.length - 2]))
      if (!meant) {
        changes.push({ kind: 'stutter', removed: prev.text })
        out[out.length - 1] = inherit(prev, t)
        continue
      }
    }
    out.push(t)
  }
  // The same 2–4 words again: "to the, to the store".
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + 2 * n <= out.length; i++) {
      const a = out.slice(i, i + n)
      const b = out.slice(i + n, i + 2 * n)
      if (a.some(literal) || a.some((x) => !x.key) || a.some((x, k) => k < n - 1 && endsSentence(x))) continue
      if (!a.every((x, k) => x.key === b[k].key) || endsSentence(a[n - 1])) continue
      // "thank you, thank you", "come on, come on", "okay na okay na": said twice on purpose.
      if (EMPHASIS.has(a[0].key) || a.every((x) => ctx.doubles.has(x.key))) continue
      changes.push({ kind: 'stutter', removed: join(a) })
      const kept = b.map((x, k) => (k === 0 ? inherit(a[0], x) : x))
      out.splice(i, 2 * n, ...kept)
      i--
    }
  }
  return out
}

// ---- corrections -----------------------------------------------------------------------------

function markerAt(list: Tok[], i: number): number {
  for (const m of MARKERS) if (m.every((w, k) => list[i + k]?.key === w)) return m.length
  return 0
}

// "I am sorry, …", "I said sorry, …": an apology, not a correction.
const APOLOGY = new Set(['am', 'was', 'is', 'are', 'so', 'very', 'really', 'truly', 'terribly', 'deeply', 'feel', 'felt', 'said', 'say', "i'm", 'be', 'been', 'not'])

/**
 * Corrections. With a marker ("I mean", "sorry", "no wait") that follows a comma or full stop, the
 * words after it replace the part before it that starts with the same word ("to the store, I mean
 * the mall" → "to the mall"). Without one, a short clause given up and restarted with the same
 * words goes ("I want to, I want to go").
 */
function corrections(list: Tok[], changes: TidyChange[]): Tok[] {
  let out = [...list]
  for (let i = 1; i < out.length; i++) {
    const len = markerAt(out, i)
    if (!len) continue
    const before = out.slice(0, i)
    const after = out.slice(i + len)
    const last = before[before.length - 1]
    if (!after.length || !breaksAfter(last)) continue
    if (out[i].key === 'sorry' && APOLOGY.has(last.key)) continue
    const first = after[0].key
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
    changes.push({ kind: 'correction', removed: join(out.slice(from, i + len)) })
    const kept = before.slice(0, from)
    const startsSentence = from === 0 || endsSentence(kept[kept.length - 1])
    const head = startsSentence ? { ...after[0], text: capital(after[0].text) } : inherit(before[from], after[0])
    out = [...kept, head, ...after.slice(1)]
    i = Math.max(0, from - 1)
  }
  for (let i = 1; i < out.length; i++) {
    if (!/,$/.test(out[i - 1].text)) continue
    let start = i - 1
    while (start > 0 && !breaksAfter(out[start - 1])) start--
    const clause = out.slice(start, i)
    if (clause.length > 5 || clause.length < 2) continue
    const rest = out.slice(i)
    if (rest.length <= clause.length || rest[0].key !== clause[0].key || rest[1]?.key !== clause[1].key) continue
    // A list ("I need milk, I need eggs") is not a restart: the whole clause must be said again, or
    // break off on a word that needs more ("I want to,"), or be just two words ("I think, I think we").
    const whole = clause.every((t, k) => rest[k]?.key === t.key)
    if (!whole && !OPEN_CLAUSE.has(clause[clause.length - 1].key) && clause.length > 2) continue
    changes.push({ kind: 'correction', removed: join(clause) })
    out.splice(start, clause.length)
    out[start] = inherit(clause[0], out[start])
    i = start
  }
  return out
}

// ---- pause breaks ----------------------------------------------------------------------------

function cutAt(t: Tok, next: Tok | undefined): boolean {
  if (!/[^.]\.$/.test(t.text)) return false
  if (CUT_ENDS.has(t.key)) return true
  return MAYBE_CUT.has(t.key) && !!next && !OPENERS.has(next.key)
}

/** "I went to the. Store is closed" → "I went to the store is closed". Names keep their capitals. */
function pauseBreaks(list: Tok[], changes: TidyChange[], ctx: Context): Tok[] {
  const out = [...list]
  const seenLower = new Set(list.filter((t) => /^\p{Ll}/u.test(bare(t.text))).map((t) => t.key))
  for (let i = 0; i < out.length - 1; i++) {
    if (!cutAt(out[i], out[i + 1])) continue
    changes.push({ kind: 'pause', removed: `${out[i].text} ${out[i + 1].text}` })
    out[i] = withEnding(out[i], '')
    out[i + 1] = { ...out[i + 1], text: lowerUnlessName(out[i + 1].text, ctx.names, seenLower) }
  }
  return out
}

// ---- script ----------------------------------------------------------------------------------

/** Words of the languages set to their own script, written in it ("yalla" → "يلا"). */
function script(list: Tok[], changes: TidyChange[], settings: TidySettings): Tok[] {
  const native = settings.languages.filter((l) => l.script === 'native')
  if (!native.length) return list
  const out: Tok[] = []
  for (let i = 0; i < list.length; i++) {
    let done = false
    for (const { code } of native) {
      const phrase = NATIVE_PHRASES[code].find(([words]) => words.every((w, k) => list[i + k]?.key === w))
      const words = phrase ? phrase[0].length : 1
      const written = phrase ? phrase[1] : NATIVE[code][list[i].key]
      if (!written) continue
      const span = list.slice(i, i + words)
      changes.push({ kind: 'script', removed: join(span) })
      out.push(tok(leading(span[0].text) + written + trailing(span[span.length - 1].text)))
      i += words - 1
      done = true
      break
    }
    if (!done) out.push(list[i])
  }
  return out
}

// ---- entry points ----------------------------------------------------------------------------

function tidyLine(line: string, settings: TidySettings, ctx: Context, changes: TidyChange[]): string {
  // Cue tags ([laughs]) are kept out of the word logic and put back where they were.
  return line
    .split(/(\[[^\]]*\])/)
    .map((part) => {
      if (/^\[[^\]]*\]$/.test(part) || !part.trim()) return part
      let list = toks(part)
      if (settings.fillers) list = fillers(list, changes)
      if (settings.pauseBreaks) list = pauseBreaks(list, changes, ctx)
      if (settings.stutters) list = stutters(list, changes, ctx)
      if (settings.corrections) list = corrections(list, changes)
      list = script(list, changes, settings)
      const lead = part.match(/^[ \t]*/)?.[0] ?? ''
      const tail = part.match(/[ \t]*$/)?.[0] ?? ''
      return list.length ? lead + join(list) + tail : lead
    })
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
}

/**
 * Tidy dictated text. `names` are words that keep their capital (personal words, names).
 * Line breaks, and text in square brackets (speech cues like [laughs]), are left alone.
 */
export function tidySpeech(text: string, settings: TidySettings, names: Iterable<string> = []): TidyResult {
  const changes: TidyChange[] = []
  const ctx = contextOf(settings, names)
  const lines = text.split(/(\r?\n)/).map((line, i) => (i % 2 ? line : tidyLine(line, settings, ctx, changes)))
  return { text: lines.join('').replace(/^[ \t]+|[ \t]+$/g, ''), changes }
}

/**
 * Tidy the next piece of a take that is being typed as it is spoken. `before` is what is already
 * typed (it can no longer change here), so the piece is tidied with its last words as context: a
 * word repeated across the join goes, and a capital the engine put after a pause, mid-thought, is
 * lowered. A piece that ends on a word no sentence ends on ("to the.") loses that full stop.
 */
export function tidyNext(before: string, piece: string, settings: TidySettings, names: Iterable<string> = []): TidyResult {
  const ctx = contextOf(settings, names)
  const own = tidySpeech(piece, settings, ctx.names)
  let list = toks(own.text)
  const changes = [...own.changes]
  const prior = toks(before)
  const last = prior[prior.length - 1]
  if (!list.length) return own
  if (last && settings.stutters && !endsSentence(last)) {
    // "…I" + "I want" / "…to the," + "to the store": drop what repeats the end of the typed text.
    for (let n = Math.min(4, list.length, prior.length); n >= 1; n--) {
      const tail = prior.slice(-n)
      if (!tail.every((t, k) => t.key && t.key === list[k].key && !literal(t))) continue
      if (n === 1 && ((!breaksAfter(last) && ctx.doubles.has(last.key)) || EMPHASIS.has(last.key))) break
      changes.push({ kind: 'stutter', removed: join(list.slice(0, n)) })
      list = list.slice(n)
      break
    }
  }
  if (settings.pauseBreaks && list.length) {
    if (last && !breaksAfter(last) && isCapital(list[0].text)) {
      const lowered = lowerUnlessName(list[0].text, ctx.names, new Set())
      if (lowered !== list[0].text) {
        changes.push({ kind: 'pause', removed: list[0].text })
        list[0] = { ...list[0], text: lowered }
      }
    }
    const end = list[list.length - 1]
    if (/[^.]\.$/.test(end.text) && CUT_ENDS.has(end.key)) {
      changes.push({ kind: 'pause', removed: end.text })
      list[list.length - 1] = withEnding(end, '')
    }
  }
  return { text: join(list), changes }
}

/** Whether tidy has anything to do even when "Tidy every take" is off (a language written in its own script). */
export const tidyAlways = (settings: TidySettings) => settings.languages.some((l) => l.script === 'native')

/** Only the script step (words of a language set to its own script), for takes not tidied otherwise. */
export const scriptOnly = (settings: TidySettings): TidySettings => ({
  ...settings,
  stutters: false,
  fillers: false,
  corrections: false,
  pauseBreaks: false
})

/**
 * For speech models that take a written hint (OpenRouter audio models, Whisper's prompt): which
 * languages the speaker mixes into English, and how to write them. Empty when none are set.
 */
export function mixedLanguageHint(settings: TidySettings): string {
  if (!settings.languages.length) return ''
  const names = settings.languages.map((l) => MIXED_LANGUAGES.find((m) => m.code === l.code)!.name.replace(/ \(.*\)$/, ''))
  const scripts = settings.languages
    .filter((l) => l.script === 'native')
    .map((l) => MIXED_LANGUAGES.find((m) => m.code === l.code)!)
    .map((m) => `${m.name.replace(/ \(.*\)$/, '')} words in ${m.native}`)
  const how = scripts.length
    ? ` Write ${scripts.join(' and ')}; write the rest in Latin letters.`
    : ' Write those words in Latin letters, as they sound.'
  return `The speaker mixes English with ${names.join(' and ')} in the same sentence; transcribe each word in the language it was spoken in, without translating.${how}`
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
  add(count('script'), 'word in its own script', 'words in their own script')
  return parts.join(', ')
}
