import { describe, expect, it } from 'vitest'
import {
  cleanWord,
  cueColor,
  extendSelection,
  latestCue,
  normalizeEdit,
  relocateSpan,
  replaceRange,
  spanRange,
  tokenize,
  wordCount
} from './tokens'

const TEXT = 'Yeah, I talked to Ryzchs. [excited] He wants to demo it.'

describe('tokenize', () => {
  it('keeps exact character offsets', () => {
    const tokens = tokenize(TEXT)
    for (const token of tokens) expect(TEXT.slice(token.start, token.end)).toBe(token.text)
    expect(tokens.map((t) => t.text).slice(0, 3)).toEqual(['Yeah,', 'I', 'talked'])
  })

  it('treats [cue] as a single tag token, even with a space inside', () => {
    const tokens = tokenize('ok [soft laugh] then')
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ['word', 'ok'],
      ['tag', '[soft laugh]'],
      ['word', 'then']
    ])
  })

  it('does not treat a bare number in brackets as a cue', () => {
    expect(tokenize('see [1] now').map((t) => t.kind)).toEqual(['word', 'word', 'word'])
  })

  it('marks words typed when they end inside typedLength', () => {
    const tokens = tokenize('one two three', 7)
    expect(tokens.map((t) => t.typed)).toEqual([true, true, false])
  })

  it('handles leading, repeated and trailing whitespace', () => {
    const text = '  a   b \n'
    const tokens = tokenize(text)
    expect(tokens.map((t) => [t.start, t.end])).toEqual([
      [2, 3],
      [6, 7]
    ])
    expect(tokenize('')).toEqual([])
  })

  it('counts only words', () => {
    expect(wordCount(tokenize(TEXT))).toBe(10)
  })
})

describe('spans', () => {
  const tokens = tokenize(TEXT)

  it('returns the char range for a span of words, in either order', () => {
    expect(spanRange(tokens, 3, 4)).toEqual({ start: 15, end: 25 })
    expect(TEXT.slice(15, 25)).toBe('to Ryzchs.')
    expect(spanRange(tokens, 4, 3)).toEqual({ start: 15, end: 25 })
  })

  it('refuses spans with a tag or out of range', () => {
    expect(spanRange(tokens, 4, 6)).toBeNull()
    expect(spanRange(tokens, 5, 5)).toBeNull()
    expect(spanRange(tokens, 0, 99)).toBeNull()
  })

  it('stops a drag before a cue tag', () => {
    expect(extendSelection(tokens, 3, 8)).toBe(4)
    expect(extendSelection(tokens, 7, 5)).toBe(6)
    expect(extendSelection(tokens, 2, 4)).toBe(4)
    expect(extendSelection(tokens, 2, 2)).toBe(2)
  })
})

describe('cleanWord', () => {
  it('drops trailing punctuation and whitespace', () => {
    expect(cleanWord('Ryzchs.')).toBe('Ryzchs')
    expect(cleanWord('as two  teasy?! ')).toBe('as two teasy')
    expect(cleanWord('“Yeah,”')).toBe('Yeah')
  })

  it('keeps inner punctuation and apostrophes', () => {
    expect(cleanWord("O'Neil's")).toBe("O'Neil's")
    expect(cleanWord('S2Teasy')).toBe('S2Teasy')
  })
})

describe('edits', () => {
  it('normalizes what was typed', () => {
    expect(normalizeEdit('  as   two\tteasy ')).toBe('as two teasy')
  })

  it('finds a span again after the text shifted', () => {
    const span = { start: 15, end: 25, text: 'to Ryzchs.' }
    expect(relocateSpan(TEXT, span)).toEqual({ start: 15, end: 25 })
    const shifted = 'Well, ' + TEXT
    expect(relocateSpan(shifted, span)).toEqual({ start: 21, end: 31 })
    expect(relocateSpan('nothing like it', span)).toBeNull()
  })

  it('prefers the copy nearest the original position', () => {
    const text = 'go go go go'
    expect(relocateSpan(text, { start: 6, end: 8, text: 'go' })).toEqual({ start: 6, end: 8 })
    expect(relocateSpan('a go b go', { start: 5, end: 7, text: 'go' })).toEqual({ start: 7, end: 9 })
  })

  it('replaces a range', () => {
    expect(replaceRange('a b c', { start: 2, end: 3 }, 'x y')).toBe('a x y c')
  })
})

describe('cues', () => {
  it('finds the newest cue', () => {
    expect(latestCue(tokenize('[calm] hi [Excited] there'))).toBe('excited')
    expect(latestCue(tokenize('no cues'))).toBeUndefined()
  })

  it('colors the known cues only', () => {
    expect(cueColor('calm')).toBeDefined()
    expect(cueColor('whispers')).toBeUndefined()
    expect(cueColor(undefined)).toBeUndefined()
  })
})
