import { describe, expect, it } from 'vitest'
import { applyVocabulary, normalizeVocabulary, type VocabularyEntry } from './vocabulary'
const entry = (heard: string, meant: string): VocabularyEntry => ({
  id: heard,
  heard,
  meant,
  enabled: true
})
describe('explicit vocabulary corrections', () => {
  it('matches whole words with Unicode boundaries, preserving punctuation', () => {
    expect(applyVocabulary('rosin, Rosin. rosinous caférosin', [entry('rosin', 'Roshan')])).toBe(
      'Roshan, Roshan. rosinous caférosin'
    )
    expect(applyVocabulary('أحمد قال: احمت.', [entry('احمت', 'أحمد')])).toBe('أحمد قال: أحمد.')
  })
  it('prefers longer phrases and never cascades substitutions', () => {
    expect(
      applyVocabulary('new york and new', [
        entry('new', 'old'),
        entry('new york', 'New York'),
        entry('old', 'ancient')
      ])
    ).toBe('New York and old')
  })
  it('escapes regex characters and respects disabled rules', () => {
    expect(
      applyVocabulary('c++ and rosin', [
        entry('c++', 'C++'),
        { ...entry('rosin', 'Roshan'), enabled: false }
      ])
    ).toBe('C++ and rosin')
  })
  it('rejects malformed, duplicate, or empty entries', () => {
    expect(
      normalizeVocabulary([
        entry('rosin', 'Roshan'),
        entry('ROSIN', 'other'),
        entry('', 'blank'),
        null
      ])
    ).toHaveLength(1)
  })
})
