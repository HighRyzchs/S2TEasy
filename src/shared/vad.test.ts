import { describe, expect, it } from 'vitest'
import { EnergyVad, vadFromSensitivity } from './vad'

function frame(level: number, n = 320): Float32Array {
  return new Float32Array(n).fill(level)
}

describe('EnergyVad', () => {
  it('keeps a short final word even when the capture tail triggers a silence flush', () => {
    const vad = new EnergyVad()
    vad.push(frame(0, 3200))
    vad.push(frame(0.3, 960))
    vad.beginFinish()
    const emitted = vad.push(frame(0, 9600)).filter((event) => event.type === 'utterance')
    expect(emitted).toHaveLength(1)
    if (emitted[0]?.type === 'utterance') expect(emitted[0].pcm.length).toBe(1920 + 960 + 9600)
    expect(vad.finish()).toBeNull()
    vad.reset()
    vad.push(frame(0.3, 80))
    expect(vad.finish()).toBeNull()
  })

  it('emits an utterance after speech then silence', () => {
    const vad = new EnergyVad({
      sampleRate: 16_000,
      speechThreshold: 0.05,
      silenceMs: 50,
      minSpeechMs: 20,
      maxUtteranceMs: 5000
    })
    const events = [
      ...vad.push(frame(0.2, 800)),
      ...vad.push(frame(0.2, 800)),
      ...vad.push(frame(0, 800)),
      ...vad.push(frame(0, 800))
    ]
    const utterances = events.filter((e) => e.type === 'utterance')
    expect(utterances).toHaveLength(1)
    if (utterances[0]?.type === 'utterance') {
      expect(utterances[0].pcm.length).toBeGreaterThan(800)
    }
  })

  it('ignores clicks shorter than minSpeechMs', () => {
    const vad = new EnergyVad({
      sampleRate: 16_000,
      speechThreshold: 0.05,
      silenceMs: 20,
      minSpeechMs: 200,
      maxUtteranceMs: 5000
    })
    const events = [...vad.push(frame(0.4, 80)), ...vad.push(frame(0, 800))]
    expect(events.filter((e) => e.type === 'utterance')).toHaveLength(0)
  })

  it('makes high sensitivity easier to trigger than low', () => {
    expect(vadFromSensitivity('high').speechThreshold).toBeLessThan(
      vadFromSensitivity('low').speechThreshold
    )
  })

  it('flushes leftover speech on finish', () => {
    const vad = new EnergyVad({
      sampleRate: 16_000,
      speechThreshold: 0.05,
      silenceMs: 400,
      minSpeechMs: 20,
      maxUtteranceMs: 9000
    })
    vad.push(frame(0.3, 1600))
    const leftover = vad.finish()
    expect(leftover?.length).toBe(1600)
  })
  it('does not let trailing silence turn a brief click into sufficient speech', () => {
    const vad = new EnergyVad({ sampleRate: 16000, minSpeechMs: 180, silenceMs: 550 })
    const events = [...vad.push(frame(0.4, 128)), ...vad.push(frame(0, 9000))]
    expect(events.filter((event) => event.type === 'utterance')).toHaveLength(0)
  })
})
