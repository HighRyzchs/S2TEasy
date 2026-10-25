import { describe, expect, it } from 'vitest'
import { defaultTidySettings, describeTidy, tidyNext, tidySpeech, type TidySettings } from './tidy'

const all = defaultTidySettings()
const only = (patch: Partial<TidySettings>): TidySettings => ({
  auto: true,
  stutters: false,
  fillers: false,
  corrections: false,
  pauseBreaks: false,
  languages: [],
  keepDoubles: [],
  habits: [],
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
    expect(tidy('I went to the. Screen was frozen.')).toBe('I went to the screen was frozen.')
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
    "One thing for sure is me personally I do tend to stutter a lot and also do stuff like say I do tend to have that habit. I want to kind of solve these type of issues. And S2Teasy. That would be, you know, really amazing."
  )
  expect(describeTidy(result.changes)).toBe('2 stutters, 1 correction, 1 pause break')
})

it('leaves speech cue tags alone', () => {
  expect(tidy('I I [laughs] I I mean it')).toBe('I [laughs] I mean it')
})

it('does only what is switched on', () => {
  expect(tidy('Um I I went to the. Screen', only({ stutters: true }))).toBe('Um I went to the. Screen')
  expect(tidy('Um I I went', only({ fillers: true }))).toBe('I I went')
})

describe('while typing live', () => {
  it('drops a word repeated across the join', () => {
    expect(tidyNext('So I', 'I want to go', all).text).toBe('want to go')
    expect(tidyNext('going to the,', 'to the store', all).text).toBe('store')
  })
  it('lowers a capital the engine put after a pause, but not names', () => {
    expect(tidyNext('I went to the', 'Screen was frozen.', all).text).toBe('screen was frozen.')
    expect(tidyNext('I went to the', 'Microsoft office.', all).text).toBe('Microsoft office.')
    expect(tidyNext('It works.', 'Then we ship.', all).text).toBe('Then we ship.')
  })
  it('drops a full stop the engine put after a word no sentence ends on', () => {
    expect(tidyNext('', 'I went to the.', all).text).toBe('I went to the')
    expect(tidyNext('', 'It was me.', all).text).toBe('It was me.')
  })
})

describe('leaves meant text alone (review cases)', () => {
  const kept = [
    'I love that. It is great.',
    'I told her. She left.',
    'Thank you. Next topic is pricing.',
    'It is what it is. Moving on.',
    'Turn it on. Then wait.',
    'Who did you go with. Then we left.',
    'I need milk, I need eggs, I need bread.',
    'Add a title, add a body, add a footer.',
    'We can try, we can fail, we can learn.',
    'I am sorry, I did not know.',
    'I said sorry, I said it twice.',
    'Call 10 10 now.',
    'Dial 9 9 9.',
    'Version 2.0 2.0 is out.',
    '#launch #launch',
    'Go, go, go!',
    'Yes, yes, yes!',
    'Thank you, thank you.',
    'Come on, come on.',
    'very very good',
    'Bye bye.',
    'Uh huh, sure.',
    'Mm hmm.',
    'We went to Bora Bora.',
    'Please re-read this.'
  ]
  for (const text of kept) it(text, () => expect(tidy(text)).toBe(text))
})

describe('review fixes', () => {
  it('a stutter split by a pause break is still a stutter', () => {
    expect(tidy('I went to the. The store was closed.')).toBe('I went to the store was closed.')
    expect(tidy('I went to the. To the store.')).toBe('I went to the store.')
  })
  it('keeps the opening quote and capital of a repeated word', () => {
    expect(tidy('"Hello hello," he said.')).toBe('"Hello," he said.')
    expect(tidy('He said: "I I mean it."')).toBe('He said: "I mean it."')
    expect(tidy('(I I) think so')).toBe('(I) think so')
  })
  it('keeps line breaks', () => {
    expect(tidy('First point.\n\nSecond point.\n- item one\n- item two')).toBe('First point.\n\nSecond point.\n- item one\n- item two')
    expect(tidy('I I said\nthe the end')).toBe('I said\nthe end')
  })
  it('moves a sentence end off a trailing filler', () => {
    expect(tidy('Okay, um.')).toBe('Okay.')
    expect(tidy('This is good, um. Really.')).toBe('This is good. Really.')
  })
  it('a restart that gives up on an open word or a pronoun', () => {
    expect(tidy('That would how I, that would be, you know, really amazing.')).toBe('That would be, you know, really amazing.')
    expect(tidy('I think, I think we should go')).toBe('I think we should go')
  })
  it('stutters across a comma are not saved by being real doubles', () => {
    expect(tidy('Um, I, I think, uh, that, that we, we should go')).toBe('I think, that we should go')
  })
  it('a one-word piece that repeats the last typed word goes', () => {
    expect(tidyNext('Hello', 'Hello', all).text).toBe('')
  })
})

describe('languages you mix in', () => {
  const withLang = (code: 'tl' | 'ar' | 'hi', script: 'latin' | 'native' = 'latin'): TidySettings => ({
    ...all,
    languages: [{ code, script }]
  })
  it('their doubles are meant once the language is set', () => {
    expect(tidy('Araw araw akong nagtatrabaho.')).toBe('Araw akong nagtatrabaho.')
    expect(tidy('Araw araw akong nagtatrabaho.', withLang('tl'))).toBe('Araw araw akong nagtatrabaho.')
    expect(tidy('Dahan dahan lang.', withLang('tl'))).toBe('Dahan dahan lang.')
    expect(tidy('Okay na okay na.', withLang('tl'))).toBe('Okay na okay na.')
    expect(tidy('Yalla yalla, let us go.', withLang('ar'))).toBe('Yalla yalla, let us go.')
    expect(tidy('Jaldi jaldi karo.', withLang('hi'))).toBe('Jaldi jaldi karo.')
  })
  it('stutters are still caught in those languages', () => {
    expect(tidy('Ano, ano ba yung sinabi mo?', withLang('tl'))).toBe('Ano ba yung sinabi mo?')
  })
  it('writes their words in their own script when asked', () => {
    expect(tidy('Yalla, we ship tomorrow inshallah.', withLang('ar', 'native'))).toBe('يلا, we ship tomorrow إن شاء الله.')
    expect(tidy('We made it, insha allah.', withLang('ar', 'native'))).toBe('We made it, إن شاء الله.')
    expect(tidy('Yalla, we ship.', withLang('ar', 'latin'))).toBe('Yalla, we ship.')
    expect(tidy('Accha, theek hai.', withLang('hi', 'native'))).toBe('अच्छा, ठीक है.')
  })
  it('your own words said twice on purpose', () => {
    expect(tidy('Meet Kiki Kiki tomorrow.', { ...all, keepDoubles: ['Kiki'] })).toBe('Meet Kiki Kiki tomorrow.')
  })
})

describe('habit words', () => {
  const mine = (habits: string[]): TidySettings => ({ ...all, habits })
  const habitual = mine(['yeah', 'ya', 'like', 'you know', 'okay', 'so', 'anyways'])
  it('takes them out where they only fill a gap', () => {
    expect(tidy('Yeah so I had an idea.', habitual)).toBe('I had an idea.')
    expect(tidy('Okay, so now it worked.', habitual)).toBe('Now it worked.')
    expect(tidy('It was, like, really good.', habitual)).toBe('It was really good.')
    expect(tidy('We should ship it, you know, before Friday.', habitual)).toBe('We should ship it before Friday.')
    expect(tidy('That is done, yeah.', habitual)).toBe('That is done.')
    expect(tidy('I see it working so Yeah something I wanna see done', habitual)).toBe('I see it working so something I wanna see done')
  })
  it('keeps them where they mean something', () => {
    expect(tidy('I like it a lot.', habitual)).toBe('I like it a lot.')
    expect(tidy('You know what I mean?', habitual)).toBe('You know what I mean?')
    expect(tidy('Yeah.', habitual)).toBe('Yeah.')
    expect(tidy('Okay.', habitual)).toBe('Okay.')
    expect(tidy('So we ship.', mine(['yeah']))).toBe('So we ship.')
  })
  it('does nothing until you pick your habit words', () => {
    expect(tidy('Yeah so I had an idea.')).toBe('Yeah so I had an idea.')
  })
})

describe('capitals put in by a pause mid-sentence', () => {
  it('lowers everyday words', () => {
    expect(tidy("the issue that I'm Facing here")).toBe("the issue that I'm facing here")
    expect(tidy('if I wanted to Actually render it')).toBe('if I wanted to actually render it')
    expect(tidy("And That's a little bit of a thing")).toBe("And that's a little bit of a thing")
  })
  it('keeps names, I, and capitals after a colon or quote', () => {
    expect(tidy('I talked to Mark about it')).toBe('I talked to Mark about it')
    expect(tidy('we flew to Manila on Tuesday')).toBe('we flew to Manila on Tuesday')
    expect(tidy('He said: Never again')).toBe('He said: Never again')
    expect(tidy('so I said yes')).toBe('so I said yes')
  })
})
