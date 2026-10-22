import { expect, it } from 'vitest'
import { wordExample } from './word-example'
import type { HistoryItem } from '../shared/types'
const item: HistoryItem = {
  id: 'original',
  text: 'hello rosin',
  model: 'speech',
  createdAt: 0,
  durationMs: 2000,
  source: 'final',
  words: [{ text: 'rosin', startMs: 1000, endMs: 1300 }]
}
it('slices a genuine word timestamp with context into an explicitly labeled local practice take', () => {
  const pcm = Buffer.alloc(2000 * 32, 42)
  const example = wordExample(item, pcm, 0, 'Roshan', 'new-id')
  expect(example.pcm.length).toBe(600 * 32)
  expect(example.item).toMatchObject({
    id: 'new-id',
    text: 'Roshan',
    rawText: 'rosin',
    source: 'practice',
    durationMs: 600,
    words: [{ text: 'rosin', startMs: 150, endMs: 450 }]
  })
  expect(() => wordExample({ ...item, words: undefined }, pcm, 0, 'Roshan', 'new')).toThrow(
    /timed word/
  )
  expect(() => wordExample(item, Buffer.alloc(100), 0, 'Roshan', 'new')).toThrow(/outside/)
})
