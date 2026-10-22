import { describe, expect, it } from 'vitest'
import { suggestCorrections } from './corrections'
describe('correction suggestions', () => {
  it('finds separate names and phrases without remembering an entire sentence', () => {
    expect(
      suggestCorrections(
        'Meet rosin at notion HQ with sea two tea.',
        'Meet Roshan at Notion HQ with S2Teasy.'
      )
    ).toEqual([
      { heard: 'rosin', meant: 'Roshan' },
      { heard: 'sea two tea', meant: 'S2Teasy' }
    ])
  })
  it('handles Unicode, repeated words, and ignores punctuation, case, and standalone additions', () => {
    expect(suggestCorrections('cafe déjà cafe', 'café déjà cafe!')).toEqual([
      { heard: 'cafe', meant: 'café' }
    ])
    expect(suggestCorrections('Hello world', 'Hello, WORLD! Please.')).toEqual([])
    expect(suggestCorrections('go go rosin now', 'go go Roshan now')).toEqual([
      { heard: 'rosin', meant: 'Roshan' }
    ])
  })
  it('bounds expensive alignment for a complete rewrite', () => {
    expect(suggestCorrections('a '.repeat(1000), 'b '.repeat(1000))).toEqual([])
  })
})
