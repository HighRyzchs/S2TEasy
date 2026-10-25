/**
 * Voice commands for structure: "new paragraph", "new line", "new stanza", "bullet point", "next
 * number". A command said on its own becomes a marker in the session text (one character, shown on
 * the HUD as a chip you can click away), and the marker becomes real line breaks only when the text
 * goes into the app. The rest of the pipeline (tidy, edits, live typing) never sees a newline.
 */

export type StructureAction = 'paragraph' | 'line' | 'bullet' | 'number'

export const STRUCTURE_ACTIONS: { action: StructureAction; label: string; marker: string; hint: string }[] = [
  { action: 'paragraph', label: 'New paragraph', marker: '¶', hint: 'A blank line, then a new paragraph. Also for a new stanza.' },
  { action: 'line', label: 'New line', marker: '↵', hint: 'The next words start on the next line (a line of a poem, an address).' },
  { action: 'bullet', label: 'Bullet point', marker: '•', hint: 'A new line starting with “- ”.' },
  { action: 'number', label: 'Numbered point', marker: '№', hint: 'A new line starting with the next number: “1. ”, “2. ”…' }
]
const MARKERS = new Map(STRUCTURE_ACTIONS.map((a) => [a.marker, a.action]))
export const isStructureMarker = (text: string) => MARKERS.has(text)
export const markerLabel = (text: string) => STRUCTURE_ACTIONS.find((a) => a.marker === text)?.label ?? ''

export type StructureSettings = {
  enabled: boolean
  /** What you say for each action. Several phrases each; a phrase is two or more words. */
  phrases: Record<StructureAction, string[]>
}

export const defaultStructureSettings = (): StructureSettings => ({
  enabled: true,
  phrases: {
    paragraph: ['new paragraph', 'next paragraph', 'new stanza', 'next stanza', 'make stanza', 'make a stanza'],
    line: ['new line', 'next line', 'line break'],
    bullet: ['bullet point', 'new bullet', 'next bullet'],
    number: ['numbered point', 'next number', 'new number']
  }
})

const cleanPhrase = (p: string) => p.toLocaleLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()

export function normalizeStructure(value: unknown): StructureSettings {
  const base = defaultStructureSettings()
  if (!value || typeof value !== 'object') return base
  const v = value as Partial<StructureSettings>
  const phrases = { ...base.phrases }
  if (v.phrases && typeof v.phrases === 'object')
    for (const { action } of STRUCTURE_ACTIONS) {
      const list = (v.phrases as Record<string, unknown>)[action]
      if (Array.isArray(list))
        phrases[action] = [
          ...new Set(list.filter((p): p is string => typeof p === 'string').map(cleanPhrase))
        ]
          .filter((p) => p.split(' ').length >= 2)
          .slice(0, 12)
    }
  return { enabled: typeof v.enabled === 'boolean' ? v.enabled : base.enabled, phrases }
}

/** A phrase must be one word or more besides the command itself, so "line" alone never triggers. */
export const validPhrase = (p: string) => cleanPhrase(p).split(' ').length >= 2

const keyOf = (w: string) => w.toLocaleLowerCase().replace(/[^\p{L}\p{N}']+/gu, '')
const closes = (w: string) => /[.!?,;:]["')\]]*$/.test(w)
const isCapital = (w: string) => /^[^\p{L}]*\p{Lu}/u.test(w)

/**
 * Turn commands said on their own into markers. "On its own" means it starts the text or follows a
 * sentence or clause break, and (except a bullet or numbered point, which its words follow) it ends
 * the text, ends with punctuation, or the next word starts a sentence. "I started a new paragraph
 * today" stays words.
 */
export function applyCommands(text: string, settings: StructureSettings): { text: string; count: number } {
  if (!settings.enabled) return { text, count: 0 }
  const commands = STRUCTURE_ACTIONS.flatMap(({ action, marker }) =>
    settings.phrases[action].map((p) => ({ words: cleanPhrase(p).split(' '), marker, opens: action === 'bullet' || action === 'number' }))
  ).sort((a, b) => b.words.length - a.words.length)
  if (!commands.length) return { text, count: 0 }
  const words = text.split(/ +/).filter(Boolean)
  const out: string[] = []
  let count = 0
  for (let i = 0; i < words.length; i++) {
    const prev = out[out.length - 1]
    const startsFree = !prev || closes(prev) || MARKERS.has(prev)
    const hit = startsFree && commands.find((c) => c.words.every((w, k) => keyOf(words[i + k] ?? '') === w))
    if (hit) {
      const last = words[i + hit.words.length - 1]
      const next = words[i + hit.words.length]
      // A bullet or numbered point is followed by its own words ("bullet point milk").
      if (hit.opens || !next || closes(last) || isCapital(next) || commands.some((c) => keyOf(next) === c.words[0])) {
        out.push(hit.marker)
        count++
        i += hit.words.length - 1
        continue
      }
    }
    out.push(words[i])
  }
  return { text: out.join(' '), count }
}

/**
 * The text as it goes into an app: markers become line breaks. Spaces after a marker go, spaces before
 * it stay, so rendering is the same in pieces as in one go (live typing types it piece by piece).
 */
export function renderStructure(text: string): string {
  let n = 0
  let out = ''
  let rest = text
  for (let m = rest.match(/(¶|↵|•|№)[ \t]*/); m && m.index !== undefined; m = rest.match(/(¶|↵|•|№)[ \t]*/)) {
    out += rest.slice(0, m.index)
    rest = rest.slice(m.index + m[0].length)
    const action = MARKERS.get(m[1])
    // A point right after a break does not need a line of its own.
    const fresh = /\n$/.test(out)
    if (action === 'paragraph') {
      n = 0
      out += '\n\n'
    } else if (action === 'line') out += '\n'
    else if (action === 'bullet') out += `${fresh ? '' : '\n'}- `
    else out += `${fresh ? '' : '\n'}${++n}. `
  }
  return out + rest
}

/** What to type for `piece` after `before` has been typed (numbering continues). */
export function renderNext(before: string, piece: string): string {
  return renderStructure(before + piece).slice(renderStructure(before).length)
}
