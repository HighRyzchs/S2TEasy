import { expect, it } from 'vitest'
import {
  cueExport,
  cueFeedback,
  defaultSpeechCues,
  normalizeSpeechCues,
  parseCueResponse,
  type CueAnalysis
} from './speech-cues'
const response = {
  quality: 'usable',
  summary: 'Even delivery.',
  cues: [
    {
      kind: 'delivery',
      label: 'monotone',
      startMs: 0,
      endMs: 900,
      strength: 'clear',
      evidence: 'Little pitch variation.'
    },
    {
      kind: 'emotion',
      label: 'calm',
      startMs: 100,
      endMs: 800,
      strength: 'tentative',
      evidence: 'Even volume and relaxed pacing.'
    }
  ]
}
const analysis = (): CueAnalysis => ({
  ...parseCueResponse(response, defaultSpeechCues(), 1000, 1000),
  schemaVersion: 1,
  id: 'analysis',
  model: 'audio/chat',
  createdAt: 1,
  startMs: 1000,
  endMs: 2000,
  observations: { durationMs: 1000, rms: 0.1, clippedFraction: 0, quietIntervals: [] }
})
it('keeps cues off on migration, normalizes models and limits guidance/known emotion labels', () => {
  expect(normalizeSpeechCues().enabled).toBe(false)
  expect(
    normalizeSpeechCues({
      enabled: true,
      model: '  model/audio ',
      guidance: 'x'.repeat(900),
      emotionLabels: ['calm', 'fake' as never]
    })
  ).toMatchObject({
    enabled: true,
    model: 'model/audio',
    guidance: 'x'.repeat(500),
    emotionLabels: ['calm']
  })
  expect(normalizeSpeechCues({ emotionLabels: [] })).toMatchObject({ emotionLabels: [] })
})
it('converts excerpt-relative timestamps and independently filters emotion categories and strength', () => {
  expect(analysis().cues[0]).toMatchObject({ startMs: 1000, endMs: 1900, label: 'monotone' })
  expect(
    parseCueResponse(response, { ...defaultSpeechCues(), emotions: false }, 0, 1000).cues
  ).toHaveLength(1)
  expect(
    parseCueResponse(response, { ...defaultSpeechCues(), clearOnly: true }, 0, 1000).cues
  ).toHaveLength(1)
  expect(
    parseCueResponse({ ...response, quality: 'unusable' }, defaultSpeechCues(), 0, 1000).cues
  ).toEqual([])
})
it('rejects invented labels, invalid ranges and oversized responses rather than guessing', () => {
  for (const patch of [
    { label: 'dishonest' },
    { kind: 'health' },
    { startMs: -1 },
    { endMs: 1100 },
    { startMs: 0.5 },
    { evidence: '' }
  ])
    expect(() =>
      parseCueResponse(
        { ...response, cues: [{ ...response.cues[0], ...patch }] },
        defaultSpeechCues(),
        0,
        1000
      )
    ).toThrow()
  expect(() => parseCueResponse(null, defaultSpeechCues(), 0, 1000)).toThrow()
  expect(() =>
    parseCueResponse(
      { ...response, cues: Array(25).fill(response.cues[0]) },
      defaultSpeechCues(),
      0,
      1000
    )
  ).toThrow()
})
it('preserves model evidence while editing, omits dismissed cues and exports user/model provenance separately', () => {
  let result = cueFeedback(analysis(), { cueId: 'cue-1', label: 'playful' })
  result = cueFeedback(result, { cueId: 'cue-0', dismissed: true })
  expect(result.cues[1]).toMatchObject({
    label: 'calm',
    userLabel: 'playful',
    strength: 'tentative'
  })
  const exported = JSON.parse(cueExport('My actual words.', result, true))
  expect(exported.text).toBe('My actual words.')
  expect(exported.audioContext.cues).toEqual([
    { startMs: 1100, endMs: 1800, kind: 'emotion', label: 'playful', source: 'user' }
  ])
  expect(cueExport('words', result, false)).toContain('excerpt 1.0–2.0s only')
  expect(() => cueFeedback(result, { cueId: 'cue-1', label: 'monotone' })).toThrow()
})
