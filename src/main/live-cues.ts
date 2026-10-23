import { randomUUID } from 'node:crypto'
import type { AudioObservations, CueAnalysis, CueKind, SpeechCue } from '../shared/speech-cues'

/** A cue shown on the HUD in front of the phrase it was heard in (`word` = index of its first word). */
export type LiveCue = { word: number; label: string }

/** What one analyzed stretch of the session audio returned. Cue times are session milliseconds. */
export type CueWindowResult = Pick<CueAnalysis, 'quality' | 'summary' | 'cues'> & {
  observations: AudioObservations
}

export type CueWindowAnalyzer = (
  range: { startMs: number; endMs: number },
  signal: AbortSignal
) => Promise<CueWindowResult | undefined>

/** Shorter stretches give the model too little to hear; they wait for the next phrase. */
export const MIN_WINDOW_MS = 3000
/** The most audio one request may carry (the journal's excerpt limit). */
export const MAX_WINDOW_MS = 30_000

const KIND_RANK: Record<CueKind, number> = { emotion: 0, event: 1, delivery: 2, pacing: 3 }

/** The one cue the HUD shows for a phrase: clear before tentative, then emotion, sound, delivery, pacing. */
export function leadCue(cues: SpeechCue[]): SpeechCue | undefined {
  return [...cues].sort(
    (a, b) =>
      Number(b.strength === 'clear') - Number(a.strength === 'clear') ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.startMs - b.startMs
  )[0]
}

/**
 * Speech cues while the person is still talking. Each settled phrase marks how far the recorded
 * audio reaches; stretches of at least MIN_WINDOW_MS go to the analyzer one at a time, and while a
 * request is out, newer phrases gather into the next stretch. The HUD gets one cue per stretch,
 * placed before its first word, and the session gets every cue as one analysis at the end.
 */
export class LiveCues {
  private from: number
  private reached: number
  private word: number | null = null
  private running: Promise<void> | null = null
  private results: CueWindowResult[] = []
  private live: LiveCue[] = []
  private error = ''

  constructor(
    private readonly options: {
      analyze: CueWindowAnalyzer
      signal: AbortSignal
      onCues: (cues: LiveCue[]) => void
      model: string
      /** Recorded audio already in the journal when cues were switched on. */
      startMs?: number
    }
  ) {
    this.from = options.startMs ?? 0
    this.reached = this.from
  }

  /** A phrase starting at word `word` settled; recorded audio now reaches `audioMs`. */
  phrase(word: number, audioMs: number): void {
    if (this.word === null) this.word = word
    this.reached = Math.max(this.reached, audioMs)
    this.pump(false)
  }

  /** Analyze whatever is left and return every cue heard in the session (bounded wait). */
  async finish(audioMs: number, timeoutMs = 15_000): Promise<CueAnalysis | undefined> {
    this.reached = Math.max(this.reached, audioMs)
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<void>((done) => (timer = setTimeout(done, timeoutMs)))
    try {
      await Promise.race([this.drain(), deadline])
    } finally {
      clearTimeout(timer)
    }
    this.options.signal.throwIfAborted()
    if (!this.results.length) {
      if (this.error) throw new Error(this.error)
      return undefined
    }
    return this.merged()
  }

  private async drain(): Promise<void> {
    const more = () => this.reached - this.from >= 500 && !this.error && !this.options.signal.aborted
    while (this.running || more()) {
      if (!this.running) this.pump(true)
      await this.running
    }
  }

  private pump(final: boolean): void {
    if (this.running || this.error || this.options.signal.aborted) return
    const length = this.reached - this.from
    if (length < (final ? 500 : MIN_WINDOW_MS)) return
    const range = { startMs: Math.max(this.from, this.reached - MAX_WINDOW_MS), endMs: this.reached }
    const word = this.word ?? 0
    this.from = this.reached
    this.word = null
    this.running = this.run(range, word).finally(() => {
      this.running = null
      if (!final) this.pump(false)
    })
  }

  private async run(range: { startMs: number; endMs: number }, word: number): Promise<void> {
    try {
      const result = await this.options.analyze(range, this.options.signal)
      if (!result || this.options.signal.aborted) return
      this.results.push(result)
      const lead = leadCue(result.cues)
      if (lead) {
        this.live = [...this.live, { word, label: lead.label }]
        this.options.onCues(this.live)
      }
    } catch (error) {
      if (this.options.signal.aborted) return
      this.error = error instanceof Error ? error.message : 'Speech cues are unavailable.'
    }
  }

  private merged(): CueAnalysis {
    const results = this.results
    const durationMs = results.reduce((sum, row) => sum + row.observations.durationMs, 0)
    const quality = results.some((row) => row.quality === 'usable')
      ? 'usable'
      : results.some((row) => row.quality === 'limited')
        ? 'limited'
        : 'unusable'
    const cues = results.flatMap((row) => row.cues).map((cue, i) => ({ ...cue, id: `cue-${i}` }))
    return {
      schemaVersion: 1,
      id: randomUUID(),
      model: this.options.model,
      createdAt: Date.now(),
      startMs: this.options.startMs ?? 0,
      endMs: this.reached,
      quality,
      summary: results
        .map((row) => row.summary.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 600),
      cues: cues.slice(0, 200),
      observations: {
        durationMs,
        rms: durationMs
          ? results.reduce((sum, row) => sum + row.observations.rms * row.observations.durationMs, 0) / durationMs
          : 0,
        clippedFraction: Math.max(...results.map((row) => row.observations.clippedFraction)),
        quietIntervals: results.flatMap((row) => row.observations.quietIntervals).slice(0, 200)
      }
    }
  }
}
