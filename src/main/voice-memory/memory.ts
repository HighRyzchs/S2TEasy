import { matchIn } from './dtw'
import { FRAME_MS } from './features'

/** One recorded example of how you say something, as feature frames. */
export type VoiceExample = {
  id: string
  /** What the speech engine wrote for it. */
  heard: string
  source: 'correction' | 'confirmation'
  sessionId: string
  createdAt: number
  frames: Float32Array[]
}

/** Everything S2Teasy remembers about one thing you say: the words you want and how they sound. */
export type VoiceMemory = {
  id: string
  intended: string
  createdAt: number
  examples: VoiceExample[]
  stats: { suggested: number; applied: number }
}

export type Detection = {
  memoryId: string
  intended: string
  exampleId: string
  /** Position inside the searched audio, in milliseconds from its start. */
  startMs: number
  endMs: number
  /** Best match cost divided by how the example fits this audio in general; lower is surer. */
  score: number
}

export const MAX_EXAMPLES = 8

/** Score needed for a suggestion at a sensitivity from 0 (cautious) to 1 (eager). */
export function suggestThreshold(sensitivity: number): number {
  return 0.4 + 0.25 * Math.max(0, Math.min(1, sensitivity))
}

/** Automatic replacement asks for clearly stronger evidence than a suggestion. */
export function applyThreshold(sensitivity: number): number {
  return suggestThreshold(sensitivity) - 0.12
}

/**
 * Look for every remembered phrase in a stretch of new speech. Each memory reports its best match
 * across its examples; matches that overlap keep only the surest one, so a long phrase and a short
 * word inside it cannot both claim the same sound.
 */
export function detect(memories: VoiceMemory[], search: Float32Array[], threshold: number): Detection[] {
  const found: Detection[] = []
  for (const memory of memories) {
    let best: Detection | null = null
    for (const example of memory.examples) {
      const match = matchIn(example.frames, search)
      if (!match || match.typical <= 0) continue
      const score = match.cost / match.typical
      if (score > threshold || (best && score >= best.score)) continue
      best = {
        memoryId: memory.id,
        intended: memory.intended,
        exampleId: example.id,
        startMs: match.start * FRAME_MS,
        endMs: match.end * FRAME_MS,
        score
      }
    }
    if (best) found.push(best)
  }
  found.sort((a, b) => a.score - b.score)
  const kept: Detection[] = []
  for (const detection of found)
    if (!kept.some((other) => detection.startMs < other.endMs && other.startMs < detection.endMs)) kept.push(detection)
  return kept.sort((a, b) => a.startMs - b.startMs)
}

/** Add an example to the memory for `intended`, creating it if needed; the oldest examples go first. */
export function remember(
  memories: VoiceMemory[],
  intended: string,
  example: VoiceExample,
  makeId: () => string
): { memories: VoiceMemory[]; memory: VoiceMemory } {
  const key = intended.trim().toLocaleLowerCase()
  const existing = memories.find((memory) => memory.intended.trim().toLocaleLowerCase() === key)
  const memory: VoiceMemory = existing
    ? { ...existing, examples: [...existing.examples, example].slice(-MAX_EXAMPLES) }
    : { id: makeId(), intended: intended.trim(), createdAt: example.createdAt, examples: [example], stats: { suggested: 0, applied: 0 } }
  return { memories: existing ? memories.map((m) => (m.id === existing.id ? memory : m)) : [...memories, memory], memory }
}

/** Remove one example; a memory left without examples is removed with it. */
export function forgetExample(memories: VoiceMemory[], exampleId: string): VoiceMemory[] {
  return memories
    .map((memory) => ({ ...memory, examples: memory.examples.filter((example) => example.id !== exampleId) }))
    .filter((memory) => memory.examples.length > 0)
}
