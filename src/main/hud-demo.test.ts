import { describe, expect, it } from 'vitest'
import { demoFrames } from './hud-demo'

describe('demoFrames', () => {
  it('types out, pauses with a countdown, saves and leaves, in time order', () => {
    const frames = demoFrames(1000, true)
    const times = frames.map((frame) => frame.at)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    const statuses = frames.map((frame) => frame.state.status)
    expect(statuses[0]).toBe('listening')
    expect(statuses.slice(-3)).toEqual(['paused', 'success', 'leaving'])
    const paused = frames.find((frame) => frame.state.status === 'paused')!
    expect(paused.state.finishAt).toBeGreaterThan(1000 + paused.at)
    for (const { state } of frames) {
      expect(state.cues).toBe(true)
      expect(state.typedLength ?? 0).toBeLessThanOrEqual(state.partial.length)
    }
  })
})
