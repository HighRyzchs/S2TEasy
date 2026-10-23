import { describe, expect, it } from 'vitest'
import { countWords, formatDuration, segmentText, statusInfo } from './format'
import type { HistoryItem } from '@shared/types'

describe('segmentText', () => {
  it('marks fixed words and cue tags', () => {
    const out = segmentText('[calm] I met Ryzchs today. Ryzchs left.', [
      { from: 'risks', to: 'Ryzchs' },
      { from: 'rizks', to: 'Ryzchs' }
    ])
    expect(out.map((s) => s.kind)).toEqual(['tag', 'text', 'fix', 'text', 'fix', 'text'])
    expect(out[2]).toMatchObject({ heard: 'risks' })
    expect(out[4]).toMatchObject({ heard: 'rizks' })
  })
  it('does not match inside longer words and survives special characters', () => {
    expect(segmentText('Notional', [{ from: 'x', to: 'Notion' }])).toEqual([{ kind: 'text', text: 'Notional' }])
    expect(segmentText('use C++ now', [{ from: 'see', to: 'C++' }]).some((s) => s.kind === 'fix')).toBe(true)
    expect(segmentText('', [])).toEqual([])
  })
  it('returns the whole text when nothing matches', () => {
    expect(segmentText('plain words')).toEqual([{ kind: 'text', text: 'plain words' }])
  })
})

describe('helpers', () => {
  it('counts words and formats durations', () => {
    expect(countWords(' hello  — world ')).toBe(2)
    expect(formatDuration(41_400)).toBe('0:41')
    expect(formatDuration(-5)).toBe('0:00')
  })
  it('labels status', () => {
    const base = { id: 'a', text: '', model: '', createdAt: 0, durationMs: 0, source: 'live' } as HistoryItem
    expect(statusInfo({ ...base, status: 'error' })).toEqual({ label: 'Recover', tone: 'bad' })
    expect(statusInfo(base).label).toBe('Typed')
    expect(statusInfo({ ...base, source: 'final' }).label).toBe('Inserted')
  })
})
