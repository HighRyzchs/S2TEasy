import { describe, expect, it } from 'vitest'
import {
  droppedTail,
  joinUtterances,
  looksLikeApiKey,
  normalizeTranscript,
  parseTranscriptionPayload,
  streamingAdvance,
  streamingPartial,
  withTrailingSpace
} from './transcript'

describe('transcript', () => {
  it('normalizes whitespace', () => {
    expect(normalizeTranscript('  hello   world \n')).toBe('hello world')
  })

  it('joins utterances without doubling spaces or splitting punctuation', () => {
    expect(joinUtterances(['Hello', 'world.', 'Yes'])).toBe('Hello world. Yes')
    expect(joinUtterances(['Wait', ', actually'])).toBe('Wait, actually')
  })

  it('parses OpenRouter STT json', () => {
    expect(parseTranscriptionPayload({ text: '  Hi there  ' })).toBe('Hi there')
  })

  it('parses chat-style fallback content', () => {
    expect(
      parseTranscriptionPayload({
        choices: [{ message: { content: 'Spoken words' } }]
      })
    ).toBe('Spoken words')
  })

  it('surfaces API errors', () => {
    expect(() => parseTranscriptionPayload({ error: { message: 'Insufficient credits' } })).toThrow(
      /Insufficient credits/
    )
  })

  it('validates OpenRouter keys', () => {
    expect(looksLikeApiKey('sk-or-v1-abcdefghijklmnop')).toBe(true)
    expect(looksLikeApiKey('sk-openai-nope')).toBe(false)
  })

  it('advances streaming finals whether they are deltas or cumulative', () => {
    expect(streamingAdvance('', 'Hello')).toEqual({ display: 'Hello', delta: 'Hello' })
    expect(streamingAdvance('Hello', 'Hello there')).toEqual({ display: 'Hello there', delta: 'there' })
    expect(streamingAdvance('Hello there', 'Hello there')).toEqual({ display: 'Hello there', delta: '' })
    expect(streamingAdvance('Hello', 'Next phrase')).toEqual({ display: 'Hello Next phrase', delta: 'Next phrase' })
  })

  it('shows partials without losing committed text', () => {
    expect(streamingPartial('Hello', 'Hello world')).toBe('Hello world')
    expect(streamingPartial('Hello', 'world')).toBe('Hello world')
  })

  it('adds a trailing space so live inserts do not glue sentences', () => {
    expect(withTrailingSpace('Hello.')).toBe('Hello. ')
    expect(withTrailingSpace('Hello ')).toBe('Hello ')
  })
})

describe('droppedTail', () => {
  it('finds a soft last word the final left out', () => {
    expect(droppedTail('something I wanna see done', 'something I wanna see')).toBe('done')
    expect(droppedTail('see you at nine tonight', 'See you at nine.')).toBe('tonight')
  })
  it('is empty when the final has everything, changed words, or a long tail', () => {
    expect(droppedTail('see you at nine', 'see you at nine.')).toBe('')
    expect(droppedTail('see you at mine tonight', 'see you at nine')).toBe('')
    expect(droppedTail('a b c d e f', 'a b')).toBe('')
    expect(droppedTail('hello', '')).toBe('')
  })
})
