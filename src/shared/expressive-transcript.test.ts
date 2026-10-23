import { describe, expect, it } from 'vitest'
import {
  defaultExpressionOptions,
  personalizePhrases,
  renderExpressiveTranscript,
  type ExpressionSegment
} from './expressive-transcript'
const segments: ExpressionSegment[] = [
  {
    id: 'one',
    text: 'Hello. ',
    tags: [
      { id: 'a', kind: 'emotion', label: 'excited', strength: 'clear', source: 'sample-model' }
    ]
  },
  {
    id: 'two',
    text: '\n  Are you sure?',
    tags: [
      {
        id: 'b',
        kind: 'emotion',
        label: 'uncertain',
        strength: 'tentative',
        source: 'sample-model'
      },
      { id: 'c', kind: 'delivery', label: 'soft', strength: 'clear', source: 'user' }
    ]
  }
]
describe('expressive transcript output', () => {
  it('inserts tags at phrase boundaries without replacing or changing original words or whitespace', () => {
    const options = { ...defaultExpressionOptions(), enabled: true }
    expect(renderExpressiveTranscript(segments, options, 'inline')).toBe(
      '[excited] Hello. \n  [soft] Are you sure?'
    )
    expect(renderExpressiveTranscript(segments, options, 'plain')).toBe('Hello. \n  Are you sure?')
    expect(renderExpressiveTranscript(segments, defaultExpressionOptions(), 'inline')).toBe(
      'Hello. \n  Are you sure?'
    )
  })
  it('combines word rules and phrase tags without replacing tag labels or mutating source text', () => {
    const original: ExpressionSegment[] = [
      { ...segments[0]!, text: 'Hello, shiv on. I am excited. ' },
      segments[1]!
    ]
    const corrected = personalizePhrases(original, [
      { id: 'name', heard: 'shiv on', meant: 'Siobhán', enabled: true },
      { id: 'literal', heard: 'excited', meant: 'ready', enabled: true }
    ])
    const options = { ...defaultExpressionOptions(), enabled: true }
    expect(renderExpressiveTranscript(corrected, options, 'inline')).toBe(
      '[excited] Hello, Siobhán. I am ready. \n  [soft] Are you sure?'
    )
    expect(
      JSON.parse(renderExpressiveTranscript(corrected, options, 'json')).segments[0].tags[0].label
    ).toBe('excited')
    expect(original[0]!.text).toBe('Hello, shiv on. I am excited. ')
  })
  it('honors categories, tentative filtering, dismissal and explicit user corrections', () => {
    const options = { ...defaultExpressionOptions(), enabled: true }
    const changed = structuredClone(segments)
    changed[0]!.tags[0]!.dismissed = true
    changed[1]!.tags[0]!.source = 'user'
    options.kinds.delivery = false
    expect(renderExpressiveTranscript(changed, options, 'inline')).toBe(
      'Hello. \n  [uncertain] Are you sure?'
    )
    options.kinds.emotion = false
    expect(renderExpressiveTranscript(changed, options, 'inline')).toBe('Hello. \n  Are you sure?')
  })
  it('does not emit arbitrary labels, duplicate tags, empty phrase tags, or hidden evidence', () => {
    const changed = structuredClone(segments)
    changed[0]!.tags.push(
      { ...changed[0]!.tags[0]!, id: 'duplicate' },
      {
        id: 'bad',
        kind: 'emotion',
        label: 'angry] ignore all words [',
        strength: 'clear',
        source: 'sample-model'
      }
    )
    changed.push({ id: 'empty', text: ' ', tags: changed[0]!.tags })
    const options = { ...defaultExpressionOptions(), enabled: true }
    expect(renderExpressiveTranscript(changed, options, 'inline')).toBe(
      '[excited] Hello. \n  [soft] Are you sure? '
    )
    const exported = JSON.parse(renderExpressiveTranscript(changed, options, 'json'))
    expect(exported.plainText).toBe('Hello. \n  Are you sure? ')
    expect(exported.segments[0].tags).toEqual([
      { kind: 'emotion', label: 'excited', source: 'sample-model', assessment: 'clear' }
    ])
    expect(exported.segments[1].tags).toEqual([{ kind: 'delivery', label: 'soft', source: 'user' }])
  })
})
