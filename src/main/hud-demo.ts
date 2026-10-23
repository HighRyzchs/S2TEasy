import { emptyOverlay, type OverlayState } from '../shared/types'

/** One step of the on-screen HUD test: the overlay state to show, and how long after the start. */
export type DemoFrame = { at: number; state: OverlayState }

const SENTENCE = 'This is how your HUD looks on this screen. Words appear here while you talk.'
const WORD_MS = 260
const BAR_COUNT = 24

function bars(step: number): number[] {
  return Array.from({ length: BAR_COUNT }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(step * 0.7 + i * 0.55)))
}

/**
 * A scripted session for "Show it on my screen": the sentence types out word by word, pauses
 * with a finish countdown, then saves and leaves. Nothing is recorded, typed or saved.
 */
export function demoFrames(now: number, cues: boolean): DemoFrame[] {
  const words = SENTENCE.split(' ')
  const frames: DemoFrame[] = []
  const base = { ...emptyOverlay(), sessionId: 'hud-demo', mode: 'dictation' as const, cues }
  for (let i = 1; i <= words.length; i++) {
    const partial = words.slice(0, i).join(' ')
    frames.push({
      at: i * WORD_MS,
      state: {
        ...base,
        status: 'listening',
        partial,
        typedLength: words.slice(0, Math.max(0, i - 2)).join(' ').length,
        rms: 0.4,
        bars: bars(i),
        elapsedMs: i * WORD_MS
      }
    })
  }
  const spoken = words.length * WORD_MS
  const pauseFor = 2400
  frames.push({
    at: spoken + 400,
    state: {
      ...base,
      status: 'paused',
      partial: SENTENCE,
      typedLength: SENTENCE.length,
      elapsedMs: spoken,
      finishAt: now + spoken + 400 + pauseFor,
      notice: 'Preview only. Nothing is typed or saved.',
      noticeAt: now + spoken + 400
    }
  })
  const done = spoken + 400 + pauseFor
  frames.push({
    at: done,
    state: { ...base, status: 'success', partial: SENTENCE, typedLength: SENTENCE.length, message: 'Saved' }
  })
  frames.push({ at: done + 1400, state: { ...base, status: 'leaving', partial: SENTENCE, message: 'Saved' } })
  return frames
}
