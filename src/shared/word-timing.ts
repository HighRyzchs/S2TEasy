export type WordTiming = { text: string; startMs: number; endMs: number }
export function readWordTimings(value: unknown, offsetMs = 0): WordTiming[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20_000).flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const text =
      typeof row.punctuated_word === 'string'
        ? row.punctuated_word
        : typeof row.word === 'string'
          ? row.word
          : row.text
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 200 ||
      typeof row.start !== 'number' ||
      typeof row.end !== 'number' ||
      !Number.isFinite(row.start + row.end) ||
      row.start < 0 ||
      row.end < row.start ||
      row.end > 86_400
    )
      return []
    return [{ text, startMs: row.start * 1000 + offsetMs, endMs: row.end * 1000 + offsetMs }]
  })
}
