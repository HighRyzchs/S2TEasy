import { expect, it, vi } from 'vitest'
import { defaultSettings, type HistoryItem } from '../shared/types'
import { SpeechCueService } from './speech-cue-service'
const result = { quality: 'usable' as const, summary: 'Steady.', cues: [] }
function setup() {
  const settings = defaultSettings()
  settings.apiKey = 'secret'
  settings.speechCues.enabled = true
  let history: HistoryItem[] = [
    {
      id: 'take',
      text: 'original words',
      model: 'asr',
      source: 'practice',
      status: 'complete',
      createdAt: 1,
      durationMs: 2000,
      hasAudio: true
    }
  ]
  const pcm = Buffer.alloc(32000)
  for (let i = 0; i < 16000; i++) pcm.writeInt16LE(2000, i * 2)
  const read = vi.fn(() => pcm),
    save = vi.fn((item: HistoryItem) => {
      history = [item]
    }),
    analyze = vi.fn(async () => result)
  const service = new SpeechCueService(
    {
      settings: () => settings,
      history: () => history,
      read,
      save,
      busy: () => false,
      usage: vi.fn()
    },
    analyze
  )
  return {
    service,
    settings,
    read,
    save,
    analyze,
    history: () => history,
    remove: () => {
      history = []
    }
  }
}
it('requires opt-in, credentials, retained audio and a bounded excerpt before any inference', async () => {
  const s = setup()
  s.settings.speechCues.enabled = false
  await expect(s.service.run('take', { startMs: 0, endMs: 1000 })).rejects.toThrow('Enable')
  s.settings.speechCues.enabled = true
  await expect(s.service.run('take', { startMs: 0, endMs: 31000 })).rejects.toThrow('30 seconds')
  s.settings.apiKey = ''
  await expect(s.service.run('take', { startMs: 0, endMs: 1000 })).rejects.toThrow('OpenRouter key')
  expect(s.read).not.toHaveBeenCalled()
  expect(s.analyze).not.toHaveBeenCalled()
})
it('saves analysis without changing transcript and refuses silence before billing', async () => {
  const s = setup()
  await s.service.run('take', { startMs: 0, endMs: 1000 })
  expect(s.history()[0]).toMatchObject({
    text: 'original words',
    cueAnalysis: { schemaVersion: 1, quality: 'usable', startMs: 0, endMs: 1000 }
  })
  s.read.mockReturnValue(Buffer.alloc(32000))
  s.analyze.mockClear()
  await expect(s.service.run('take', { startMs: 0, endMs: 1000 })).rejects.toThrow('silent')
  expect(s.analyze).not.toHaveBeenCalled()
})
it('blocks duplicate calls, aborts cancellation and cannot resurrect deleted History', async () => {
  const s = setup()
  let finish!: (value: typeof result) => void
  s.analyze.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const pending = s.service.run('take', { startMs: 0, endMs: 1000 })
  await expect(s.service.run('take', { startMs: 0, endMs: 1000 })).rejects.toThrow('Finish')
  s.service.cancel('take')
  finish(result)
  await expect(pending).rejects.toThrow('cancelled')
  expect(s.save).not.toHaveBeenCalled()
  const next = s.service.run('take', { startMs: 0, endMs: 1000 })
  s.remove()
  finish(result)
  await expect(next).rejects.toThrow('changed')
  expect(s.save).not.toHaveBeenCalled()
})
it('retains an existing analysis on provider error and rejects stale feedback', async () => {
  const s = setup()
  await s.service.run('take', { startMs: 0, endMs: 1000 })
  const before = JSON.stringify(s.history())
  s.analyze.mockRejectedValue(new Error('provider unavailable'))
  await expect(s.service.run('take', { startMs: 0, endMs: 1000 })).rejects.toThrow(
    'provider unavailable'
  )
  expect(JSON.stringify(s.history())).toBe(before)
  expect(() => s.service.feedback('take', 'stale', { cueId: 'cue-0', label: 'calm' })).toThrow(
    'changed'
  )
})
