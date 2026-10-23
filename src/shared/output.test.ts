import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings, type HistoryItem } from './types'
import { defaultOutputPreferences, normalizeOutputPreferences, renderOutput } from './output'
import { applyVocabulary } from './vocabulary'

const take = (): HistoryItem => ({
  id: 'take',
  text: 'Roshan is excited.',
  model: 'speech',
  createdAt: 1,
  durationMs: 60000,
  source: 'live',
  cueAnalysis: {
    schemaVersion: 1,
    id: 'analysis',
    model: 'audio-model',
    createdAt: 1,
    startMs: 0,
    endMs: 30000,
    quality: 'usable',
    summary: 'Animated voice',
    observations: { durationMs: 30000, rms: 0.05, clippedFraction: 0, quietIntervals: [] },
    cues: [
      {
        id: '1',
        kind: 'emotion',
        label: 'excited',
        strength: 'clear',
        startMs: 500,
        endMs: 2000,
        evidence: 'Animated pitch'
      },
      {
        id: '2',
        kind: 'pacing',
        label: 'fast',
        strength: 'tentative',
        startMs: 1000,
        endMs: 3000,
        evidence: 'Short gaps'
      },
      {
        id: '3',
        kind: 'event',
        label: 'laughter',
        strength: 'tentative',
        userLabel: 'sigh',
        startMs: 2000,
        endMs: 4000,
        evidence: 'Breathy event'
      }
    ]
  }
})
describe('output choices', () => {
  it('keeps vocabulary in plain and tagged output without rewriting tag labels or applying rules twice', () => {
    const item = take()
    item.text = applyVocabulary('rosin is excited.', [
      { id: 'name', heard: 'rosin', meant: 'Roshan', enabled: true },
      { id: 'word', heard: 'excited', meant: 'ready', enabled: true },
      { id: 'chain', heard: 'ready', meant: 'done', enabled: true }
    ])
    const plain = renderOutput(item, defaultOutputPreferences(), 'plain')
    expect(plain).toBe('Roshan is ready.')
    const tagged = renderOutput(item, defaultOutputPreferences(), 'tags')
    expect(tagged).toContain('[excited · 0.5–2.0s]')
    expect(tagged.endsWith(plain)).toBe(true)
    expect(tagged).not.toContain('[ready')
    expect(tagged).not.toContain('done')
  })
  it('filters categories, dismissed and tentative suggestions while preserving explicit user labels', () => {
    const item = take(),
      prefs = defaultOutputPreferences()
    expect(renderOutput(item, prefs, 'tags')).not.toContain('[fast')
    expect(renderOutput(item, prefs, 'tags')).toContain('[sigh')
    prefs.kinds.event = false
    item.cueAnalysis!.cues[0].dismissed = true
    expect(renderOutput(item, prefs, 'tags')).toBe(item.text)
    prefs.clearOnly = false
    expect(renderOutput(item, prefs, 'tags')).toContain('[fast')
  })
  it('places tags around preserved text with excerpt scope and keeps JSON provenance', () => {
    const item = take(),
      prefs = defaultOutputPreferences()
    expect(renderOutput(item, { ...prefs, placement: 'after' }, 'tags')).toMatch(
      /^Roshan is excited\.\n\[excited/
    )
    expect(renderOutput(item, { ...prefs, placement: 'context' }, 'tags')).toContain(
      '\n\n[Voice context'
    )
    expect(JSON.parse(renderOutput(item, prefs, 'json'))).toMatchObject({
      text: item.text,
      audioContext: {
        analyzedRangeMs: [0, 30000],
        cues: [{ source: 'audio-model' }, { source: 'user' }]
      }
    })
    delete item.cueAnalysis
    expect(renderOutput(item, prefs, 'tags')).toBe(item.text)
    expect(JSON.parse(renderOutput(item, prefs, 'json')).audioContext).toBeNull()
  })
  it('migrates output preferences without enabling automatic paid analysis', () => {
    const settings = normalizeSettings({
      speechCues: { ...defaultSettings().speechCues, enabled: true }
    })
    expect(settings.speechCues.automatic).toBe(false)
    expect(
      normalizeSettings({ speechCues: { ...settings.speechCues, enabled: false, automatic: true } })
        .speechCues.automatic
    ).toBe(false)
    expect(
      normalizeOutputPreferences({
        placement: 'invalid' as never,
        kinds: { emotion: false } as never
      })
    ).toMatchObject({ placement: 'before', kinds: { emotion: false, event: true } })
  })
})
