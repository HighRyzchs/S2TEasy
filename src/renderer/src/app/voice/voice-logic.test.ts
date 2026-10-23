import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '@shared/types'
import type { VocabularyEntry } from '@shared/vocabulary'
import {
  addHeardAs,
  addWord,
  compareTake,
  filterWords,
  forgetWord,
  practiceQueue,
  recognition,
  removeHeardAs,
  setKind,
  statsSentence,
  takesFor
} from './voice-logic'

const entry = (over: Partial<VocabularyEntry> & { id: string; heard: string; meant: string }): VocabularyEntry => ({
  enabled: true,
  kind: 'name',
  ...over
})
const ids = (() => {
  let n = 0
  return () => `id-${++n}`
})()

const list: VocabularyEntry[] = [
  entry({ id: 'a', heard: 'risks', meant: 'Ryzchs', stats: { fixed: 2, heardRight: 1, missed: 3 } }),
  entry({ id: 'b', heard: 'as two teasy', meant: 'S2Teasy', variants: ['s two t easy'], stats: { fixed: 9, heardRight: 9, missed: 0 } }),
  entry({ id: 'c', heard: 'bike', meant: 'bite', kind: 'accent' }),
  entry({ id: 'd', heard: 'old', meant: 'Disabled', enabled: false })
]

describe('practiceQueue', () => {
  it('orders by misses then fewest uses, skips disabled, and puts the request first', () => {
    expect(practiceQueue(list)).toEqual(['Ryzchs', 'bite', 'S2Teasy'])
    expect(practiceQueue(list, 'S2Teasy')).toEqual(['S2Teasy', 'Ryzchs', 'bite'])
    expect(practiceQueue(list, 'Brand new')[0]).toBe('Brand new')
  })
})

describe('recognition', () => {
  it('is null without data', () => {
    expect(recognition(list[2]!)).toBeNull()
    expect(recognition(list[0]!)).toEqual({ good: 3, missed: 3, total: 6 })
    expect(statsSentence(list[2]!)).toMatch(/Not seen/)
    expect(statsSentence(list[0]!)).toBe('Fixed 2 times · heard right 1 · fixed by hand 3')
  })
})

describe('compareTake', () => {
  it('tells right, fixed and new apart', () => {
    expect(compareTake({ rawText: 'ryzchs.' }, 'Ryzchs', list).kind).toBe('right')
    expect(compareTake({ rawText: 'Risks' }, 'Ryzchs', list).kind).toBe('fixed')
    expect(compareTake({ rawText: "Rich's" }, 'Ryzchs', list).kind).toBe('new')
    expect(compareTake({ rawText: '' }, 'Ryzchs', list).kind).toBe('empty')
  })
  it('lists takes newest first for one word', () => {
    const mk = (id: string, at: number, target: string, raw: string): HistoryItem =>
      ({ id, createdAt: at, source: 'practice', practiceTarget: target, rawText: raw, text: raw, model: 'm', durationMs: 1 }) as HistoryItem
    const takes = takesFor([mk('1', 1, 'Ryzchs', 'risks'), mk('2', 2, 'Ryzchs', 'Ryzchs'), mk('3', 3, 'bite', 'bike')], 'ryzchs', list)
    expect(takes.map((t) => [t.id, t.number, t.result.kind])).toEqual([['2', 2, 'right'], ['1', 1, 'fixed']])
  })
})

describe('edits keep the list valid', () => {
  it('adds a word and rejects a heard form owned elsewhere', () => {
    const ok = addWord(list, { heard: 'no shun', meant: 'Notion', kind: 'name' }, ids)
    expect(ok).toMatchObject({ ok: true })
    expect(ok.ok && ok.vocabulary.length).toBe(5)
    const dup = addWord(list, { heard: 'Risks', meant: 'Other', kind: 'name' }, ids)
    expect(dup).toEqual({ ok: false, error: '“Risks” is already heard as “Ryzchs”.' })
  })
  it('folds a repeated meant word into its entry', () => {
    const r = addWord(list, { heard: 'rizz', meant: 'ryzchs', kind: 'name' }, ids)
    expect(r.ok && r.vocabulary.find((e) => e.id === 'a')?.variants).toEqual(['rizz'])
  })
  it('adds and removes heard-as forms', () => {
    const added = addHeardAs(list, 'a', 'rizz kiss')
    expect(added.ok && added.vocabulary[0]!.variants).toEqual(['rizz kiss'])
    expect(addHeardAs(list, 'a', 'bike').ok).toBe(false)
    expect(addHeardAs(list, 'a', 'RYZCHS').ok).toBe(false)
    const removed = removeHeardAs(list, 'b', 'as two teasy')
    expect(removed.ok && removed.vocabulary.find((e) => e.id === 'b')).toMatchObject({ heard: 's two t easy' })
    expect(removeHeardAs(list, 'a', 'risks').ok).toBe(false)
  })
  it('changing to How I say it turns off the engine hint', () => {
    const r = setKind(list, 'a', 'accent')
    expect(r.ok && r.vocabulary[0]).toMatchObject({ kind: 'accent', engineHint: false })
  })
  it('forgets and filters', () => {
    expect(forgetWord(list, 'a').map((e) => e.id)).toEqual(['b', 'c', 'd'])
    expect(filterWords(list, 'TWO').map((e) => e.id)).toEqual(['b'])
  })
})
