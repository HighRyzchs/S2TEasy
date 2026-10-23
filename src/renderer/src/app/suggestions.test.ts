import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '@shared/types'
import { suggestionKey, voiceSuggestions } from './suggestions'

const session = (edits: { from: string; to: string }[], createdAt = 1): HistoryItem => ({
  id: String(createdAt),
  text: '',
  model: 'm',
  createdAt,
  durationMs: 0,
  source: 'live',
  edits
})

describe('Your voice suggestions', () => {
  it('ranks hand fixes by how many sessions needed them', () => {
    const rows = voiceSuggestions(
      [
        session([{ from: 'risks', to: 'Ryzchs' }, { from: 'risks', to: 'Ryzchs' }], 1),
        session([{ from: 'risks', to: 'Ryzchs' }, { from: 'bike', to: 'bite' }], 2)
      ],
      []
    )
    expect(rows.map((row) => [row.heard, row.meant, row.count])).toEqual([
      ['risks', 'Ryzchs', 2],
      ['bike', 'bite', 1]
    ])
  })

  it('skips fixes Your voice already knows, dismissed ones, case-only and long rewrites', () => {
    const rows = voiceSuggestions(
      [
        session([
          { from: 'as two teasy', to: 'S2Teasy' },
          { from: 'bike', to: 'bite' },
          { from: 'hello', to: 'Hello' },
          { from: 'x'.repeat(80), to: 'y' }
        ])
      ],
      [{ id: 's', heard: 'as two teasy', meant: 'S2Teasy', enabled: true }],
      [suggestionKey('bike', 'bite')]
    )
    expect(rows).toEqual([])
  })
})
