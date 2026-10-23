import { describe, expect, it } from 'vitest'
import { compareProsody, measureProsody, suppliedPace } from './prosody'
const rate = 16000
function tone(hz: number, amplitude = 0.15, seconds = 2) {
  return Float32Array.from(
    { length: rate * seconds },
    (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate)
  )
}
describe('local prosody measurements', () => {
  it('estimates a known fundamental, digital energy and WPM from supplied words', () => {
    const measured = measureProsody(tone(200), rate, 'One two three four')
    expect(measured.pitchMedianHz).toBeCloseTo(200, 0)
    expect(measured.rmsDbfs).toBeCloseTo(20 * Math.log10(0.15 / Math.sqrt(2)), 1)
    expect(measured.wordsPerMinute).toBe(120)
    expect(measured.pitchRangeSemitones).toBeCloseTo(0, 0)
    expect(measured.quietFraction).toBe(0)
    expect(Object.keys(measured)).not.toContain('emotion')
  })
  it('keeps silence and missing transcript measurements unavailable rather than inferring a mood', () => {
    const measured = measureProsody(new Float32Array(rate * 2), rate)
    expect(measured.pitchMedianHz).toBeNull()
    expect(measured.wordsPerMinute).toBeNull()
    expect(measured.quietFraction).toBe(1)
    expect(measured.rmsDbfs).toBe(-90)
    expect(measured.envelope).toHaveLength(64)
  })
  it('compares an individual reference without assigning emotional meaning to increased energy or pitch', () => {
    const neutral = measureProsody(tone(150, 0.1), rate, 'One two three four')
    const current = measureProsody(tone(300, 0.2), rate, 'One two three four five six')
    const difference = compareProsody(current, neutral)
    expect(difference.pitchChangeSemitones).toBeCloseTo(12, 0)
    expect(difference.energyChangeDb).toBeCloseTo(6.02, 1)
    expect(difference.paceChangePercent).toBeCloseTo(50, 1)
  })
  it('updates supplied-word pace without reprocessing audio or carrying an empty transcript rate', () => {
    expect(suppliedPace('One two three four', 2000)).toEqual({ wordCount: 4, wordsPerMinute: 120 })
    expect(suppliedPace('One two three four five six', 2000)).toEqual({
      wordCount: 6,
      wordsPerMinute: 180
    })
    expect(suppliedPace('', 2000)).toEqual({ wordCount: null, wordsPerMinute: null })
    expect(suppliedPace('One', 0).wordsPerMinute).toBeNull()
  })
  it('accepts finite decoder overshoot while reporting the overloaded signal', () => {
    const measured = measureProsody(tone(200, 1.05), rate)
    expect(measured.clippedFraction).toBeGreaterThan(0.02)
    expect(Number.isFinite(measured.rmsDbfs)).toBe(true)
  })
  it('rejects unbounded or invalid PCM and measures clipping', () => {
    expect(() => measureProsody(tone(200, 0.1, 21), rate)).toThrow()
    expect(() => measureProsody(new Float32Array([NaN]), rate)).toThrow()
    expect(() => measureProsody(tone(200), 0)).toThrow()
    expect(measureProsody(new Float32Array(rate).fill(1), rate).clippedFraction).toBe(1)
  })
})
