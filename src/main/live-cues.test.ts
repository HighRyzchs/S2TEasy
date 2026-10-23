import { describe, expect, it, vi } from 'vitest'
import type { SpeechCue } from '../shared/speech-cues'
import { LiveCues, leadCue, type CueWindowResult } from './live-cues'

const cue = (label: string, kind: SpeechCue['kind'], startMs: number, strength: SpeechCue['strength'] = 'clear'): SpeechCue => ({
  id: 'x',
  kind,
  label,
  strength,
  startMs,
  endMs: startMs + 500,
  evidence: 'heard'
})

const result = (cues: SpeechCue[], durationMs: number): CueWindowResult => ({
  quality: 'usable',
  summary: 'ok',
  cues,
  observations: { durationMs, rms: 0.1, clippedFraction: 0, quietIntervals: [] }
})

describe('leadCue', () => {
  it('prefers clear cues, then emotions over sounds, delivery and pacing', () => {
    expect(leadCue([cue('fast', 'pacing', 0), cue('laughter', 'event', 100), cue('excited', 'emotion', 200, 'tentative')])?.label).toBe('laughter')
    expect(leadCue([])).toBeUndefined()
  })
})

describe('LiveCues', () => {
  it('waits for enough audio, gathers phrases while a request is out, and merges at the end', async () => {
    const calls: { startMs: number; endMs: number }[] = []
    let release!: () => void
    const analyze = vi.fn(async (range: { startMs: number; endMs: number }) => {
      calls.push(range)
      if (calls.length === 1) await new Promise<void>((done) => (release = done))
      return result([cue(calls.length === 1 ? 'excited' : 'calm', 'emotion', range.startMs + 100)], range.endMs - range.startMs)
    })
    const onCues = vi.fn()
    const live = new LiveCues({ analyze, signal: new AbortController().signal, onCues, model: 'm' })
    live.phrase(0, 1200)
    expect(analyze).not.toHaveBeenCalled()
    live.phrase(4, 3500)
    expect(calls).toEqual([{ startMs: 0, endMs: 3500 }])
    live.phrase(9, 5000)
    live.phrase(12, 7200)
    expect(calls).toHaveLength(1)
    release()
    const analysis = await live.finish(8000)
    expect(calls).toEqual([
      { startMs: 0, endMs: 3500 },
      { startMs: 3500, endMs: 8000 }
    ])
    expect(onCues).toHaveBeenLastCalledWith([
      { word: 0, label: 'excited' },
      { word: 9, label: 'calm' }
    ])
    expect(analysis?.cues.map((row) => row.id)).toEqual(['cue-0', 'cue-1'])
    expect(analysis?.observations.durationMs).toBe(8000)
  })

  it('stops after a failure and reports it when nothing was heard', async () => {
    const analyze = vi.fn().mockRejectedValue(new Error('Limit reached'))
    const live = new LiveCues({ analyze, signal: new AbortController().signal, onCues: vi.fn(), model: 'm' })
    live.phrase(0, 4000)
    live.phrase(5, 9000)
    await expect(live.finish(9500)).rejects.toThrow('Limit reached')
    expect(analyze).toHaveBeenCalledTimes(1)
  })

  it('never loops or calls the analyzer after the session is cancelled', async () => {
    const abort = new AbortController()
    const analyze = vi.fn().mockResolvedValue(undefined)
    const live = new LiveCues({ analyze, signal: abort.signal, onCues: vi.fn(), model: 'm' })
    abort.abort()
    live.phrase(0, 9000)
    await expect(live.finish(9000)).rejects.toThrow()
    expect(analyze).not.toHaveBeenCalled()
  })
})
