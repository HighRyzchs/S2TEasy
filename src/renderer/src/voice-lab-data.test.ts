import { describe, expect, it } from 'vitest'
import { applyVocabulary } from '@shared/vocabulary'
import { defaultModels, readLabDraft, sampleCards, textRules } from './voice-lab-data'

describe('voice lab browser drafts', () => {
  it('keeps sound examples out of the working text-correction path after reload', () => {
    const draft = readLabDraft(JSON.parse(JSON.stringify({ cards: sampleCards })))
    expect(applyVocabulary('A little hum and shiv on', textRules(draft.cards))).toBe(
      'A little hum and Siobhán'
    )
    expect(draft.cards.find((card) => card.kind === 'sound')?.meant).toBe('Sounds good 👍')
  })
  it('drops corrupted entries, unknown kinds and duplicate IDs without inventing text rules', () => {
    const word = sampleCards[0]!
    const draft = readLabDraft({
      cards: [
        null,
        { ...word, kind: 'unknown' },
        word,
        { ...sampleCards[3], id: word.id },
        { ...word, id: 'duplicate-heard' },
        { ...word, id: 'empty', heard: '' }
      ]
    })
    expect(draft.cards).toEqual([word])
  })
  it('allows a sound label to match a text trigger without losing either card', () => {
    const draft = readLabDraft({
      cards: [sampleCards[0], { ...sampleCards[3], heard: sampleCards[0]!.heard }]
    })
    expect(draft.cards).toHaveLength(2)
    expect(applyVocabulary('shiv on', textRules(draft.cards))).toBe('Siobhán')
  })
  it('preserves an intentionally empty library and falls back from malformed model IDs', () => {
    expect(
      readLabDraft({
        cards: [],
        models: { speech: 'https://bad.example/key', cues: 'provider/custom-model' }
      })
    ).toEqual({
      cards: [],
      models: { speech: defaultModels.speech, cues: 'provider/custom-model' }
    })
    expect(readLabDraft(null).cards).toEqual(sampleCards)
  })
})
