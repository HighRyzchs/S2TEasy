import { describe, expect, it } from 'vitest'
import { defaultTidySettings, describeTidy, tidyNext, tidySpeech, type TidySettings } from './tidy'

const all = defaultTidySettings()
const only = (patch: Partial<TidySettings>): TidySettings => ({
  auto: true,
  stutters: false,
  fillers: false,
  corrections: false,
  pauseBreaks: false,
  ...patch
})
const tidy = (text: string, settings = all, names: string[] = []) => tidySpeech(text, settings, names).text

describe('stutters', () => {
  it('drops a repeated word, with or without a comma', () => {
    expect(tidy('I I want to go')).toBe('I want to go')
    expect(tidy('I, I want to kind of solve these type of issues.')).toBe('I want to kind of solve these type of issues.')
    expect(tidy('And and S2Teasy')).toBe('And S2Teasy')
  })
  it('keeps doubles that are real English', () => {
    expect(tidy('I knew that that was it.')).toBe('I knew that that was it.')
    expect(tidy('She had had enough.')).toBe('She had had enough.')
  })
  it('drops cut-off starts and stammered sounds', () => {
    expect(tidy('I want th- the blue one')).toBe('I want the blue one')
    expect(tidy('B-b-but it works')).toBe('But it works')
    expect(tidy('it is w-w-working now')).toBe('it is working now')
  })
  it('drops a repeated phrase', () => {
    expect(tidy('going to the, to the store')).toBe('going to the store')
    expect(tidy('That would, that would be great.')).toBe('That would be great.')
  })
  it('does not merge across sentences', () => {
    expect(tidy('It works. It works.')).toBe('It works. It works.')
  })
})

describe('fillers', () => {
  it('drops um and uh and fixes the capital after', () => {
    expect(tidy('Um, so we ship it.')).toBe('So we ship it.')
    expect(tidy('we, uh, ship it')).toBe('we, ship it')
  })
})

describe('corrections', () => {
  it('replaces the part before a marker that starts with the same word', () => {
    expect(tidy('I want to go to the store, I mean the mall.')).toBe('I want to go to the mall.')
    expect(tidy('Send it on Tuesday, sorry, on Wednesday.')).toBe('Send it on Wednesday.')
  })
  it('leaves a marker alone when nothing before it matches', () => {
    expect(tidy('Sorry, I was late.')).toBe('Sorry, I was late.')
    expect(tidy('I mean it.')).toBe('I mean it.')
  })
  it('drops a restarted short clause', () => {
    expect(tidy('I want to, I want to go home')).toBe('I want to go home')
    expect(tidy('we should, we should really ship this today')).toBe('we should really ship this today')
  })
  it('keeps lists that only look like restarts', () => {
    expect(tidy('I came, I saw, I conquered.')).toBe('I came, I saw, I conquered.')
  })
  it('scratch that drops the sentence before', () => {
    expect(tidy('Make it red. Scratch that, make it blue.')).toBe('Make it blue.')
  })
})

describe('pause breaks', () => {
  it('joins a sentence cut after a word no sentence ends on', () => {
    expect(tidy('I went to the. Store was closed.')).toBe('I went to the store was closed.')
    expect(tidy('Talking is faster than. Typing for me.')).toBe('Talking is faster than typing for me.')
  })
  it('keeps real sentence ends and names', () => {
    expect(tidy('I went home. Store was closed.')).toBe('I went home. Store was closed.')
    expect(tidy('I talked to. Ryzchs today.', all, ['Ryzchs'])).toBe('I talked to Ryzchs today.')
    expect(tidy('Ask the. NASA team.')).toBe('Ask the NASA team.')
  })
})

it('tidies a real ramble and says what it did', () => {
  const said =
    "One thing for sure is me personally I do tend to stutter a lot And also do stuff like say I do tend to have that habit. I, I want to kind of solve these type of issues. And and S2Teasy. That would how I, that would be, you know, really amazing."
  const result = tidySpeech(said, all)
  expect(result.text).toBe(
    "One thing for sure is me personally I do tend to stutter a lot And also do stuff like say I do tend to have that habit. I want to kind of solve these type of issues. And S2Teasy. That would be, you know, really amazing."
  )
  expect(describeTidy(result.changes)).toBe('2 stutters, 1 correction')
})

it('leaves speech cue tags alone', () => {
  expect(tidy('I I [laughs] I I mean it')).toBe('I [laughs] I mean it')
})

it('does only what is switched on', () => {
  expect(tidy('Um I I went to the. Store', only({ stutters: true }))).toBe('Um I went to the. Store')
  expect(tidy('Um I I went', only({ fillers: true }))).toBe('I I went')
})

describe('while typing live', () => {
  it('drops a word repeated across the join', () => {
    expect(tidyNext('So I', 'I want to go', all).text).toBe('want to go')
    expect(tidyNext('going to the,', 'to the store', all).text).toBe('store')
  })
  it('lowers a capital the engine put after a pause, but not names', () => {
    expect(tidyNext('I went to the', 'Store was closed.', all).text).toBe('store was closed.')
    expect(tidyNext('I went to the', 'Microsoft office.', all).text).toBe('Microsoft office.')
    expect(tidyNext('It works.', 'Then we ship.', all).text).toBe('Then we ship.')
  })
  it('drops a full stop the engine put after a word no sentence ends on', () => {
    expect(tidyNext('', 'I went to the.', all).text).toBe('I went to the')
    expect(tidyNext('', 'It was me.', all).text).toBe('It was me.')
  })
})
