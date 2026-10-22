import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudio, fetchTranscriptionModels, localTranscriptionUrl } from './openrouter'

describe('transcribeAudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends wav audio to OpenRouter and returns text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hello world' } }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    const text = await transcribeAudio({
      apiKey: 'sk-or-v1-test',
      model: 'openai/whisper-large-v3',
      language: 'en',
      wavBase64: 'AAAA'
    })
    expect(text).toBe('hello world')
    const call = fetchMock.mock.calls[0]
    expect(String(call?.[0])).toContain('/chat/completions')
    const init = call?.[1] as { body: string }
    expect(JSON.parse(init.body).model).toBe('openai/whisper-large-v3')
    expect(JSON.parse(init.body).messages[0].content[1]).toEqual({
      type: 'input_audio',
      input_audio: { data: 'AAAA', format: 'wav' }
    })
  })

  it('throws a readable OpenRouter error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } })
      })
    )
    await expect(
      transcribeAudio({
        apiKey: 'sk-or-v1-test',
        model: 'openai/whisper-large-v3',
        language: '',
        wavBase64: 'AAAA'
      })
    ).rejects.toThrow(/Invalid API key/)
  })
})

describe('local speech and model discovery', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('sends multipart audio to loopback without forwarding cloud credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ text: 'local words' }) })
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await transcribeAudio({
        engine: 'local',
        localEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions',
        apiKey: 'cloud-secret',
        model: 'whisper-small',
        language: 'en',
        wavBase64: 'AAAA'
      })
    ).toBe('local words')
    const init = fetchMock.mock.calls[0]?.[1]
    expect(init.headers).toEqual({})
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.body.get('model')).toBe('whisper-small')
  })
  it('rejects remote local endpoints and credentials in URLs', () => {
    expect(() => localTranscriptionUrl('https://example.com/transcribe')).toThrow()
    expect(() => localTranscriptionUrl('http://user:pass@localhost/transcribe')).toThrow()
  })
  it('only lists models with audio input and text output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'audio/model',
              architecture: { input_modalities: ['audio'], output_modalities: ['text'] }
            },
            {
              id: 'text/model',
              architecture: { input_modalities: ['text'], output_modalities: ['text'] }
            }
          ]
        })
      })
    )
    expect(await fetchTranscriptionModels('key')).toEqual([
      { slug: 'audio/model', name: 'audio/model' }
    ])
  })
})
