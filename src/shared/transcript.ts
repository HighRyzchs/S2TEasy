const SPACE_RE = /\s+/g
const TRAILING_SPACE = /[ \t]+$/
const LEADING_SPACE = /^[ \t]+/

export function normalizeTranscript(text: string): string {
  return text.replace(SPACE_RE, ' ').replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '').trim()
}

/** Turn a streaming final into the next insert, whether the provider sends deltas or the full so-far text. */
export function streamingAdvance(
  committed: string,
  incoming: string
): { display: string; delta: string } {
  const left = normalizeTranscript(committed)
  const right = normalizeTranscript(incoming)
  if (!right) return { display: left, delta: '' }
  if (!left) return { display: right, delta: right }
  if (right === left) return { display: left, delta: '' }
  if (right.startsWith(left)) {
    return { display: right, delta: normalizeTranscript(right.slice(left.length)) }
  }
  return { display: joinUtterances([left, right]), delta: right }
}

export function streamingPartial(committed: string, incoming: string): string {
  const left = normalizeTranscript(committed)
  const right = normalizeTranscript(incoming)
  if (!right) return left
  if (!left) return right
  if (right.startsWith(left) || left.startsWith(right))
    return right.length >= left.length ? right : left
  return joinUtterances([left, right])
}

export function joinUtterances(parts: string[]): string {
  const clean = parts.map(normalizeTranscript).filter(Boolean)
  if (clean.length === 0) return ''
  let out = clean[0] ?? ''
  for (let i = 1; i < clean.length; i++) {
    const next = clean[i] ?? ''
    const needsSpace = !/[\s\n]$/.test(out) && !/^[,.;:!?)]/.test(next)
    out += (needsSpace ? ' ' : '') + next
  }
  return out
}

export function parseTranscriptionPayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Empty transcription response')
  }
  const body = payload as {
    text?: unknown
    error?: { message?: unknown; code?: unknown }
    choices?: { message?: { content?: unknown } }[]
  }
  if (body.error) {
    const message = typeof body.error.message === 'string' ? body.error.message : 'OpenRouter error'
    throw new Error(message)
  }
  if (typeof body.text === 'string') return normalizeTranscript(body.text)
  const content = body.choices?.[0]?.message?.content
  if (typeof content === 'string') return normalizeTranscript(content)
  if (Array.isArray(content)) {
    const parts = content.filter(
      (part) => part && part.type === 'text' && typeof part.text === 'string'
    )
    if (parts.length) return joinUtterances(parts.map((part) => part.text))
  }
  throw new Error('OpenRouter did not return transcribed text')
}

export function withTrailingSpace(text: string): string {
  if (!text) return text
  return /[ \n]$/.test(text) ? text : `${text} `
}

export function looksLikeApiKey(key: string): boolean {
  const trimmed = key.trim()
  return trimmed.startsWith('sk-or-') && trimmed.length >= 20
}

export function maskKey(key: string): string {
  const trimmed = key.trim()
  if (trimmed.length < 12) return trimmed ? '••••' : ''
  return `${trimmed.slice(0, 7)}…${trimmed.slice(-4)}`
}
