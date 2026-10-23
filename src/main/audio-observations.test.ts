import { expect, it } from 'vitest'
import { observeAudio } from './audio-observations'
it('measures quiet intervals and clipping from PCM without claiming emotion or speech detection', () => {
  const pcm = Buffer.alloc(32000)
  for (let i = 8000; i < 16000; i++) pcm.writeInt16LE(32767, i * 2)
  expect(observeAudio(pcm)).toMatchObject({
    durationMs: 1000,
    clippedFraction: 0.5,
    quietIntervals: [{ startMs: 0, endMs: 500 }]
  })
  expect(observeAudio(Buffer.alloc(0))).toMatchObject({ durationMs: 0, rms: 0, clippedFraction: 0 })
})
