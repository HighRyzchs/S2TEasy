import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '@shared/types'
import { ACCENT_SENTENCES, accentResults, wordSwaps } from './accent-check'

describe('wordSwaps', () => {
  it('finds words that came out as other words, ignoring case and punctuation', () => {
    expect(wordSwaps('I think the third ship sails at three.', 'I sink the turd sheep sails at tree')).toEqual([
      { meant: 'think', heard: 'sink' },
      { meant: 'third ship', heard: 'turd sheep' },
      { meant: 'three', heard: 'tree' }
    ])
    expect(wordSwaps('Turn the light on the right road.', 'turn the light on the right road')).toEqual([])
  })

  it('leaves out missing and extra words, which are not accent swaps', () => {
    expect(wordSwaps('Grab a quick bite before you ride the bike.', 'grab quick bite before you ride the bike now')).toEqual([])
  })
})

describe('accentResults', () => {
  it('uses the newest take of each sentence and marks swaps already saved', () => {
    const take = (id: string, at: number, rawText: string): HistoryItem => ({
      id,
      createdAt: at,
      text: rawText,
      rawText,
      model: 'm',
      durationMs: 1000,
      status: 'complete',
      source: 'practice',
      practiceTarget: ACCENT_SENTENCES[3]
    })
    const rows = accentResults(
      [take('old', 1, 'grab a quick bike before you ride the bike'), take('new', 2, 'grab a quick bike before you ride the bite')],
      [{ id: 'w', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' }]
    )
    expect(rows[3].take?.id).toBe('new')
    expect(rows[3].swaps).toEqual([
      { meant: 'bite', heard: 'bike', saved: true },
      { meant: 'bike', heard: 'bite', saved: false }
    ])
    expect(rows[0].take).toBeUndefined()
  })
})
