import type { HistoryItem } from './types'

export type PracticeProgress = {
  target: string
  model: string
  takes: number
  scored: number
  matched: number
  retained: number
  latestAt: number
  recent: { id: string; matched: boolean; recognized: string }[]
}

// Compare recognition, not pronunciation quality. Keep accents and internal apostrophes/hyphens.
function recognitionKey(text: string): string {
  return (
    text
      .normalize('NFC')
      .toLowerCase()
      .match(/[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu) ?? []
  ).join(' ')
}

/** Raw provider text only: a Vocabulary rule or an edited transcript is not a recognition success. */
export function practiceProgress(history: HistoryItem[]): PracticeProgress[] {
  const groups = new Map<string, PracticeProgress>()
  for (const take of [...history].sort((a, b) => a.createdAt - b.createdAt)) {
    if (take.source !== 'practice' || take.status !== 'complete' || !take.practiceTarget?.trim())
      continue
    const targetKey = recognitionKey(take.practiceTarget)
    if (!targetKey) continue
    const key = JSON.stringify([targetKey, take.model])
    const group = groups.get(key) ?? {
      target: take.practiceTarget.trim(),
      model: take.model,
      takes: 0,
      scored: 0,
      matched: 0,
      retained: 0,
      latestAt: take.createdAt,
      recent: []
    }
    group.takes++
    group.retained += take.hasAudio ? 1 : 0
    group.latestAt = take.createdAt
    const raw = typeof take.rawText === 'string' ? recognitionKey(take.rawText) : ''
    if (raw) {
      const matched = raw === targetKey
      group.scored++
      group.matched += matched ? 1 : 0
      group.recent.push({ id: take.id, matched, recognized: take.rawText! })
      group.recent = group.recent.slice(-5)
    }
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.latestAt - a.latestAt)
}
