/** A word or cue tag in the session text, with its exact character range in that text. */
export type Token = {
  kind: 'word' | 'tag'
  text: string
  start: number
  end: number
  /** Already typed into the target app (live typing). */
  typed: boolean
}

export type Span = { start: number; end: number }

// A cue tag such as [excited] or [soft laugh]; everything else split on whitespace is a word.
const TOKEN = /(\[[A-Za-z][^[\]\n]{0,39}\])|\S+/g

export function tokenize(text: string, typedLength = 0): Token[] {
  const tokens: Token[] = []
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index
    const end = start + match[0].length
    tokens.push({
      kind: match[1] ? 'tag' : 'word',
      text: match[0],
      start,
      end,
      typed: end <= typedLength
    })
  }
  return tokens
}

export function wordCount(tokens: Token[]): number {
  return tokens.reduce((count, token) => count + (token.kind === 'word' ? 1 : 0), 0)
}

/** The characters covered by tokens a..b (either order). Null when the span holds a tag or is out of range. */
export function spanRange(tokens: Token[], a: number, b: number): Span | null {
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  if (lo < 0 || hi >= tokens.length) return null
  for (let i = lo; i <= hi; i += 1) if (tokens[i].kind !== 'word') return null
  return { start: tokens[lo].start, end: tokens[hi].end }
}

/** Dragging from `anchor` to `to` stays inside one run of words: it stops before a cue tag. */
export function extendSelection(tokens: Token[], anchor: number, to: number): number {
  const step = to > anchor ? 1 : -1
  let end = anchor
  while (end !== to && tokens[end + step]?.kind === 'word') end += step
  return end
}

/** Strips trailing punctuation and extra spaces, so “Ryzchs.” is learned as “Ryzchs”. */
export function cleanWord(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\s.,;:!?…"”’)\]]+$/u, '')
    .replace(/^[\s"“(]+/u, '')
}

/** What the person typed into the edit box: trimmed, single-spaced. */
export function normalizeEdit(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Words keep arriving while a span is open for editing, and the main process can rewrite text it
 * has not typed yet. Finds the span again in the current text: where it was, or its nearest copy.
 */
export function relocateSpan(text: string, span: Span & { text: string }): Span | null {
  if (text.slice(span.start, span.end) === span.text) return { start: span.start, end: span.end }
  let best = -1
  for (let at = text.indexOf(span.text); at !== -1; at = text.indexOf(span.text, at + 1)) {
    if (best === -1 || Math.abs(at - span.start) < Math.abs(best - span.start)) best = at
  }
  return best === -1 ? null : { start: best, end: best + span.text.length }
}

export function replaceRange(text: string, span: Span, replacement: string): string {
  return text.slice(0, span.start) + replacement + text.slice(span.end)
}

const CUE_COLORS: Record<string, string> = {
  calm: '#7fd8c0',
  excited: '#ffc56b',
  sighs: '#9db8ff',
  laughs: '#ffc56b'
}

/** The cue name of the newest tag, lower case ("excited"), or undefined when there is none. */
export function latestCue(tokens: Token[]): string | undefined {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (tokens[i].kind === 'tag') return tokens[i].text.slice(1, -1).trim().toLowerCase()
  }
  return undefined
}

export function cueColor(cue: string | undefined): string | undefined {
  return cue ? CUE_COLORS[cue] : undefined
}
