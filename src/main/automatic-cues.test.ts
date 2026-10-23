import { expect, it, vi } from 'vitest'
import { analyzeAutomaticCues } from './automatic-cues'
import { defaultSettings } from '../shared/types'
import type { analyzeCueAudio } from './speech-cue-model'

function audible(seconds: number) {
  const pcm = new Int16Array(16000 * seconds)
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.sin(i / 12) * 8000
  return new Uint8Array(pcm.buffer)
}
const settings = () => ({
  ...defaultSettings(),
  speechCues: { ...defaultSettings().speechCues, enabled: true, automatic: true }
})
const result = { quality: 'usable' as const, summary: 'Steady voice', cues: [] }
it('does not call a provider without both opt-ins or for inaudible audio', async () => {
  const analyze = vi.fn<typeof analyzeCueAudio>().mockResolvedValue(result),
    controller = new AbortController()
  expect(
    await analyzeAutomaticCues(audible(1), defaultSettings(), controller.signal, vi.fn(), analyze)
  ).toBeUndefined()
  const manual = settings()
  manual.speechCues.automatic = false
  await analyzeAutomaticCues(audible(1), manual, controller.signal, vi.fn(), analyze)
  await analyzeAutomaticCues(new Uint8Array(32000), settings(), controller.signal, vi.fn(), analyze)
  expect(analyze).not.toHaveBeenCalled()
})
it('sends at most the first 30 seconds in a single call and forwards separate usage', async () => {
  const usage = vi.fn(),
    analyze = vi.fn<typeof analyzeCueAudio>().mockImplementation(async (input) => {
      expect(Buffer.from(input.wavBase64, 'base64').length).toBe(30 * 32000 + 44)
      input.onUsage?.({
        engine: 'openrouter',
        model: 'audio',
        costUsd: 0.01,
        latencyMs: 50,
        durationMs: 30000,
        outcome: 'success',
        attempt: 1
      })
      return result
    })
  const value = await analyzeAutomaticCues(
    audible(61),
    settings(),
    new AbortController().signal,
    usage,
    analyze
  )
  expect(value).toMatchObject({ startMs: 0, endMs: 30000, model: settings().speechCues.model })
  expect(analyze).toHaveBeenCalledTimes(1)
  expect(usage).toHaveBeenCalledOnce()
})
it('discards a late result after cancellation and never retries a failure', async () => {
  const controller = new AbortController()
  const analyze = vi.fn<typeof analyzeCueAudio>().mockImplementation(async () => {
    controller.abort()
    return result
  })
  await expect(
    analyzeAutomaticCues(audible(1), settings(), controller.signal, vi.fn(), analyze)
  ).rejects.toThrow()
  const failed = vi
    .fn<typeof analyzeCueAudio>()
    .mockRejectedValue(new Error('Provider unavailable'))
  await expect(
    analyzeAutomaticCues(audible(1), settings(), new AbortController().signal, vi.fn(), failed)
  ).rejects.toThrow('Provider unavailable')
  expect(failed).toHaveBeenCalledTimes(1)
})
