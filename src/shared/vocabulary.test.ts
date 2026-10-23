import { describe, expect, it } from 'vitest'
import {
  applyVocabulary,
  applyVocabularyDetailed,
  engineHintTerms,
  heldTailWords,
  learnFix,
  normalizeVocabulary,
  recordHits,
  type VocabularyEntry
} from './vocabulary'
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

describe('personal words', () => {
  const s2 = (extra: Partial<VocabularyEntry> = {}): VocabularyEntry => ({
    id: 's2',
    heard: 'as two teasy',
    meant: 'S2Teasy',
    enabled: true,
    kind: 'name',
    variants: ['s two t easy'],
    ...extra
  })

  it('keeps old entries working and fills defaults by kind', () => {
    const [legacy, name] = normalizeVocabulary([entry('rosin', 'Roshan'), s2()])
    expect(legacy).toMatchObject({ kind: 'rule', engineHint: false })
    expect(name).toMatchObject({ kind: 'name', engineHint: true, variants: ['s two t easy'] })
  })

  it('matches every variant, multi-word forms and irregular spacing, and reports hits', () => {
    const out = applyVocabularyDetailed('demo the as two  teasy and S two T easy overlay', [s2()])
    expect(out.text).toBe('demo the S2Teasy and S2Teasy overlay')
    expect(out.hits.map((hit) => hit.from)).toEqual(['as two  teasy', 'S two T easy'])
  })

  it('never lets one heard form belong to two words', () => {
    const rows = normalizeVocabulary([s2(), { ...entry('x', 'y'), id: 'b', variants: ['as two teasy'] }])
    expect(rows[1]?.variants).toBeUndefined()
  })

  it('holds back trailing words that could still become a learned phrase', () => {
    expect(heldTailWords('the new as two', [s2()])).toBe(2)
    expect(heldTailWords('the new as', [s2()])).toBe(1)
    expect(heldTailWords('the new as two teasy', [s2()])).toBe(0)
    expect(heldTailWords('fast as two.', [s2()])).toBe(0)
    expect(heldTailWords('nothing here', [s2()])).toBe(0)
  })

  it('sends what the user means as engine hints, skipping accents and plain rules', () => {
    expect(
      engineHintTerms([
        s2(),
        { id: 'a', heard: 'bike', meant: 'bite', enabled: true, kind: 'accent' },
        entry('rosin', 'Roshan')
      ])
    ).toEqual(['S2Teasy'])
  })

  it('learns a fix as a new word, then as a variant of the same word', () => {
    let id = 0
    const make = () => `w${++id}`
    let list = learnFix([], { heard: 'risks', meant: 'Ryzchs', kind: 'name' }, make, 1)
    expect(list).toMatchObject([{ id: 'w1', heard: 'risks', meant: 'Ryzchs', kind: 'name' }])
    list = learnFix(list, { heard: "rich's", meant: 'Ryzchs', kind: 'name' }, make)
    expect(list).toHaveLength(1)
    expect(list[0]?.variants).toEqual(["rich's"])
    expect(applyVocabulary("ask rich's and risks", list)).toBe('ask Ryzchs and Ryzchs')
  })

  it('moves a heard form to the word the user picked and ignores no-op fixes', () => {
    const list = learnFix([entry('risks', 'Rix')], { heard: 'risks', meant: 'Ryzchs', kind: 'name' }, () => 'n')
    expect(list.map((row) => row.meant)).toEqual(['Ryzchs'])
    expect(learnFix(list, { heard: 'Ryzchs', meant: 'ryzchs', kind: 'name' }, () => 'z')).toBe(list)
  })

  it('counts fixes per word', () => {
    const [row] = recordHits([s2()], [
      { entryId: 's2', from: 'as two teasy', to: 'S2Teasy' },
      { entryId: 's2', from: 'as two teasy', to: 'S2Teasy' }
    ])
    expect(row?.stats).toEqual({ fixed: 2, heardRight: 0, missed: 0 })
  })
})
