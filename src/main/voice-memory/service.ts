import { randomUUID } from 'node:crypto'
import { extractFeatures } from './features'
import { detect, remember, type Detection } from './memory'
import type { MatchEvent, VoiceMemorySummary } from '../../shared/voice-memory'
import type { VoiceMemoryStore } from './store'

/** Personal acoustic memory for the dictation controller: learn from fixes, find them again. */
export class VoiceMemoryService {
  constructor(
    private readonly store: VoiceMemoryStore,
    private readonly onChange: () => void = () => undefined
  ) {}

  hasMemories(): boolean {
    return this.store.all().length > 0
  }

  /**
   * Remember how `intended` sounds from the span [fromMs, toMs) of `pcm`. The rest of `pcm` is
   * context for normalisation. Returns false when the span holds no usable speech.
   */
  remember(input: {
    pcm: Uint8Array
    fromMs: number
    toMs: number
    heard: string
    intended: string
    sessionId: string
    source: 'correction' | 'confirmation'
  }): boolean {
    const frames = extractFeatures(input.pcm, { fromMs: input.fromMs, toMs: input.toMs, trim: true }).frames
    // Under 120 ms of speech is too little to recognise again.
    if (frames.length < 12) return false
    const { memories } = remember(
      this.store.all(),
      input.intended,
      {
        id: randomUUID(),
        heard: input.heard,
        source: input.source,
        sessionId: input.sessionId,
        createdAt: Date.now(),
        frames
      },
      randomUUID
    )
    this.store.replace(memories)
    this.onChange()
    return true
  }

  /** Remembered phrases that start at or after `fromMs` in `pcm`; earlier audio is context only. */
  detect(pcm: Uint8Array, fromMs: number, threshold: number): Detection[] {
    const search = extractFeatures(pcm).frames
    return detect(this.store.all(), search, threshold).filter((hit) => hit.endMs > fromMs + 100)
  }

  record(event: MatchEvent, memoryId?: string): void {
    if (memoryId && (event.outcome === 'suggested' || event.outcome === 'applied'))
      this.store.count(memoryId, event.outcome)
    this.store.record(event)
    this.onChange()
  }

  list(): { memories: VoiceMemorySummary[]; recent: MatchEvent[] } {
    return {
      memories: this.store.all().map((memory) => ({
        id: memory.id,
        intended: memory.intended,
        heard: [...new Set(memory.examples.map((example) => example.heard))],
        examples: memory.examples.map((example) => ({
          id: example.id,
          heard: example.heard,
          createdAt: example.createdAt,
          ms: example.frames.length * 10
        })),
        createdAt: memory.createdAt,
        stats: memory.stats
      })),
      recent: [...this.store.recent()].reverse()
    }
  }

  forgetExample(id: string): void {
    this.store.forgetExample(id)
    this.onChange()
  }

  forgetMemory(id: string): void {
    this.store.forgetMemory(id)
    this.onChange()
  }

  clear(): void {
    this.store.clear()
    this.onChange()
  }
}
