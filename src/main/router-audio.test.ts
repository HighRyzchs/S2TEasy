import { describe, expect, it } from 'vitest'
import { buildListenUrl, closeReason, parseListenMessage } from './router-audio'

describe('buildListenUrl', () => {
  it('keeps the key out of the redacted URL', () => {
    const { url, redacted } = buildListenUrl({
      apiKey: 'secret-key-value',
      provider: 'deepgram',
      language: 'en'
    })
    expect(url).toContain('wss://api.router.audio/v1/listen')
    expect(url).toContain('provider=deepgram')
    expect(url).toContain('encoding=pcm_s16le')
    expect(url).toContain('secret-key-value')
    expect(url).toContain('language=en')
    expect(redacted).not.toContain('secret-key-value')
    expect(redacted).toMatch(/api_key=(\*\*\*|%2A%2A%2A)/)
  })
})

describe('parseListenMessage', () => {
  it('reads documented transcript frames', () => {
    expect(
      parseListenMessage(
        JSON.stringify({ type: 'transcript', transcript: 'Hello there', is_partial: true })
      )
    ).toEqual({ kind: 'transcript', text: 'Hello there', isPartial: true })
  })

  it('treats is_final as the inverse of partial', () => {
    expect(parseListenMessage(JSON.stringify({ type: 'transcript', text: 'Done', is_final: true }))).toEqual({
      kind: 'transcript',
      text: 'Done',
      isPartial: false
    })
  })

  it('reads provider errors', () => {
    expect(parseListenMessage(JSON.stringify({ type: 'error', message: 'bad key' }))).toEqual({
      kind: 'error',
      message: 'bad key'
    })
  })

  it('ignores noise', () => {
    expect(parseListenMessage('not-json')).toEqual({ kind: 'ignore' })
    expect(parseListenMessage(JSON.stringify({ type: 'session', id: '1' }))).toEqual({ kind: 'ignore' })
  })
})

describe('closeReason', () => {
  it('treats a normal close as done', () => {
    expect(closeReason(1000, '')).toBeNull()
  })

  it('maps auth-style close codes', () => {
    expect(closeReason(4401, '')).toMatch(/rejected/i)
  })
})
