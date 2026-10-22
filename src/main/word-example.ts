import type { HistoryItem } from '../shared/types'

/** Only a real provider timestamp may label a slice as a particular spoken word. */
export function wordExample(
  item: HistoryItem,
  pcm: Buffer,
  index: number,
  intended: string,
  id: string
) {
  const word = Number.isInteger(index) ? item.words?.[index] : undefined
  if (!word || typeof intended !== 'string' || !intended.trim() || intended.length > 200)
    throw new Error('Choose a timed word and enter its intended spelling.')
  const start = Math.max(0, Math.floor((word.startMs - 150) * 16)) * 2
  const end = Math.min(pcm.length, Math.ceil((word.endMs + 150) * 16) * 2)
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start >= end ||
    word.endMs * 32 > pcm.length + 32
  )
    throw new Error('Word timing is outside the retained recording.')
  const clip = pcm.subarray(start, end)
  const next: HistoryItem = {
    id,
    text: intended.trim(),
    rawText: word.text,
    practiceTarget: intended.trim(),
    createdAt: Date.now(),
    model: item.model,
    source: 'practice',
    status: 'complete',
    durationMs: clip.length / 32,
    hasAudio: true,
    words: [{ ...word, startMs: word.startMs - start / 32, endMs: word.endMs - start / 32 }]
  }
  return { item: next, pcm: clip }
}
