import { expect, it } from 'vitest'
import { audioResponse } from './audio-response'
it('serves complete WAV data and seek ranges, including suffixes', async () => {
  const wav = new Uint8Array([10, 20, 30, 40, 50])
  expect(new Uint8Array(await audioResponse(wav, null).arrayBuffer())).toEqual(wav)
  const seek = audioResponse(wav, 'bytes=1-3')
  expect(seek.status).toBe(206)
  expect(seek.headers.get('Content-Range')).toBe('bytes 1-3/5')
  expect([...new Uint8Array(await seek.arrayBuffer())]).toEqual([20, 30, 40])
  expect([...new Uint8Array(await audioResponse(wav, 'bytes=-2').arrayBuffer())]).toEqual([40, 50])
  for (const range of ['bytes=8-', 'bytes=3-1', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4'])
    expect(audioResponse(wav, range).status).toBe(416)
})
