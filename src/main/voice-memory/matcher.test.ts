import { describe, expect, it } from 'vitest'
import { between, matchIn } from './dtw'
import { extractFeatures, FEATURE_DIM, FRAME_MS } from './features'
import { babble, GG_NO_RE, msOf, OTHER, synth } from './test-audio'

// The stored example: "gg no re" said once inside a sentence, cut out with its surrounding context.
const before = babble(12, 5)
const recorded = synth([...before, { silence: 100 }, ...GG_NO_RE, { silence: 100 }, ...babble(8, 6)])
const from = msOf(before)
const template = extractFeatures(recorded, { fromMs: from, toMs: from + msOf(GG_NO_RE) + 200, trim: true }).frames

describe('voice memory features and matching', () => {
  it('trims silence from stored examples and makes a frame every 10 ms', () => {
    expect(template[0]).toHaveLength(FEATURE_DIM)
    expect(Math.abs(template.length * FRAME_MS - msOf(GG_NO_RE))).toBeLessThan(80)
  })

  for (const take of [
    { name: 'the same way', speed: 1, gain: 0.3, noise: 0.002 },
    { name: 'slower', speed: 1.3, gain: 0.3, noise: 0.002 },
    { name: 'faster, quieter and noisier', speed: 0.8, gain: 0.12, noise: 0.008 }
  ])
    it(`finds the phrase later in other speech, said ${take.name}`, () => {
      const lead = babble(10, 11)
      const sentence = synth([...lead, { silence: 120 }, ...GG_NO_RE, { silence: 120 }, ...babble(6, 12)], { ...take, seed: 7 })
      const decoy = synth([...babble(10, 11), ...OTHER, ...babble(6, 12)], { ...take, seed: 3 })
      const found = matchIn(template, extractFeatures(sentence).frames)!
      const miss = matchIn(template, extractFeatures(decoy).frames)!
      const expected = msOf([...lead, { silence: 120 }], take.speed)
      expect(Math.abs(found.start * FRAME_MS - expected)).toBeLessThan(150)
      // A real match stands out from how the template fits the rest of the audio; a decoy does not.
      expect(found.cost / found.typical).toBeLessThan(0.55)
      expect(miss.cost / miss.typical).toBeGreaterThan(0.6)
    })

  it('scores two takes of the same phrase closer than the phrase and a different one', () => {
    const again = extractFeatures(synth([...babble(10, 2), ...GG_NO_RE], { speed: 0.85, seed: 9 }), {
      fromMs: msOf(babble(10, 2), 0.85),
      trim: true
    }).frames
    const other = extractFeatures(synth([...babble(10, 2), ...OTHER], { seed: 4 }), {
      fromMs: msOf(babble(10, 2)),
      trim: true
    }).frames
    expect(between(template, again)).toBeLessThan(between(template, other) * 0.75)
  })
})
