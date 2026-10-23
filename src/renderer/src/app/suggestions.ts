import type { HistoryItem } from '@shared/types'
import { heardForms, type VocabularyEntry } from '@shared/vocabulary'

/** Something Your voice noticed in recent sessions that the user may want to teach it. */
export type VoiceSuggestion = {
  key: string
  heard: string
  meant: string
  /** Sessions in which the user made this same fix by hand. */
  count: number
  lastAt: number
}

export const suggestionKey = (heard: string, meant: string) =>
  `${heard.trim().toLocaleLowerCase()}→${meant.trim().toLocaleLowerCase()}`

/**
 * Hand fixes from the HUD that Your voice does not know yet, most frequent first. A fix already
 * covered by a personal word, or dismissed by the user, is not suggested again.
 */
export function voiceSuggestions(
  history: HistoryItem[],
  vocabulary: VocabularyEntry[],
  dismissed: readonly string[] = [],
  limit = 6
): VoiceSuggestion[] {
  const known = new Set(
    vocabulary.flatMap((entry) => heardForms(entry).map((form) => suggestionKey(form, entry.meant)))
  )
  const skip = new Set(dismissed)
  const found = new Map<string, VoiceSuggestion>()
  for (const item of history) {
    const seen = new Set<string>()
    for (const edit of item.edits ?? []) {
      const heard = edit.from.trim()
      const meant = edit.to.trim()
      // Only short word or phrase swaps make sense as a personal word.
      if (!heard || !meant || heard.length > 60 || meant.length > 60) continue
      if (heard.toLocaleLowerCase() === meant.toLocaleLowerCase()) continue
      const key = suggestionKey(heard, meant)
      if (known.has(key) || skip.has(key) || seen.has(key)) continue
      seen.add(key)
      const row = found.get(key) ?? { key, heard, meant, count: 0, lastAt: 0 }
      row.count++
      row.lastAt = Math.max(row.lastAt, item.createdAt)
      found.set(key, row)
    }
  }
  return [...found.values()]
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit)
}
