export type VocabularyEntry = {
  id: string
  heard: string
  meant: string
  enabled: boolean
}

export function normalizeVocabulary(value: unknown): VocabularyEntry[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .filter((row): row is VocabularyEntry => {
      if (!row || typeof row !== 'object') return false
      const { id, heard, meant } = row
      if (typeof id !== 'string' || typeof heard !== 'string' || typeof meant !== 'string')
        return false
      if (!heard.trim() || !meant.trim() || heard.length > 120 || meant.length > 120) return false
      const key = heard.trim().toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 500)
    .map((row) => ({
      ...row,
      heard: row.heard.trim(),
      meant: row.meant.trim(),
      enabled: row.enabled !== false
    }))
}

/** Explicit whole-word/phrase rules; a single pass prevents replacement cascades. */
export function applyVocabulary(text: string, entries: VocabularyEntry[]): string {
  const rules = normalizeVocabulary(entries)
    .filter((entry) => entry.enabled)
    .sort((a, b) => b.heard.length - a.heard.length)
  if (!rules.length) return text
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const alternatives = rules.map((row) => escape(row.heard)).join('|')
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, 'giu')
  return text.replace(
    pattern,
    (match) =>
      rules.find((row) => row.heard.toLocaleLowerCase() === match.toLocaleLowerCase())?.meant ??
      match
  )
}
