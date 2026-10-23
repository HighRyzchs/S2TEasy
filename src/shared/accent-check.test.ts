import { describe, expect, it } from 'vitest'
import { accentSlots, applyAccentChoices, markedText } from './accent-check'
import type { VocabularyEntry } from './vocabulary'

const entries: VocabularyEntry[] = [
  { id: 'bite', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' },
  { id: 'name', heard: 'risks', meant: 'Ryzchs', enabled: true, kind: 'name' }
]
const hits = [
  { entryId: 'bite', from: 'bike', to: 'bite' },
  { entryId: 'name', from: 'risks', to: 'Ryzchs' }
]

describe('accent context check', () => {
  const text = 'Bite first, then I ride my bite to meet Ryzchs.'

  it('marks only accent words the session swapped, as two choices each', () => {
    const slots = accentSlots(text, entries, hits)
    expect(slots.map((s) => [s.slot, s.kept, s.heard])).toEqual([
      [1, 'Bite', 'bike'],
      [2, 'bite', 'bike']
    ])
    expect(markedText(text, slots)).toBe('⟦1: Bite | bike⟧ first, then I ride my ⟦2: bite | bike⟧ to meet Ryzchs.')
    expect(accentSlots(text, entries, [hits[1]])).toEqual([])
  })

  it('puts back the heard word only where chosen, keeping capitals, and ignores anything else', () => {
    const slots = accentSlots(text, entries, hits)
    expect(applyAccentChoices(text, slots, [{ slot: 2, word: 'bike' }, { slot: 1, word: 'bite' }]).text).toBe(
      'Bite first, then I ride my bike to meet Ryzchs.'
    )
    expect(applyAccentChoices(text, slots, [{ slot: 1, word: 'Bike' }]).text).toBe(
      'Bike first, then I ride my bite to meet Ryzchs.'
    )
    for (const junk of [null, 'bike', [{ slot: 2, word: 'motorcycle' }], [{ slot: 9, word: 'bike' }]])
      expect(applyAccentChoices(text, slots, junk)).toEqual({ text, reverted: [] })
  })
})
