import { afterEach, describe, expect, it, vi } from 'vitest'
import { transcribeAudio, fetchTranscriptionModels, localTranscriptionUrl } from './openrouter'
const input = {
  apiKey: 'test-key',
  model: 'qwen/qwen3-asr-1.7b',
  language: 'en',
  wavBase64: 'AAAA'
}
const response = (body: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body
})
const catalogue = {
  data: [
    {
      id: 'qwen/qwen3-asr-1.7b',
      architecture: { input_modalities: ['audio'], output_modalities: ['transcription'] }
    },
    {
      id: 'x-ai/grok-stt-1.0',
      architecture: { input_modalities: ['audio'], output_modalities: ['transcription'] }
    },
    {
      id: 'google/gemini-2.5-flash',
      architecture: { input_modalities: ['audio', 'text'], output_modalities: ['text'] }
    },
    { id: 'text/model', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
    { id: 'tts/model', architecture: { input_modalities: ['text'], output_modalities: ['audio'] } }
  ]
}
afterEach(() => vi.unstubAllGlobals())

describe('OpenRouter audio operations', () => {
  it('discovers dedicated ASR models and routes both reported slugs through transcription JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(catalogue))
      .mockResolvedValue(response({ text: 'hello world' }))
    vi.stubGlobal('fetch', fetchMock)
    const models = await fetchTranscriptionModels('key')
    expect(String(fetchMock.mock.calls[0][0])).toContain('output_modalities=text,transcription')
    expect(models).toHaveLength(3)
    expect(models[0]).toMatchObject({ route: 'transcription' })
    for (const model of ['qwen/qwen3-asr-1.7b', 'x-ai/grok-stt-1.0']) {
      expect(await transcribeAudio({ ...input, model })).toBe('hello world')
      const [url, init] = fetchMock.mock.calls.at(-1)!
      expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions')
      expect(JSON.parse(init.body)).toEqual({
        model,
        language: 'en',
        input_audio: { data: 'AAAA', format: 'wav' }
      })
      expect(init.redirect).toBe('error')
    }
    expect(fetchMock).toHaveBeenCalledTimes(3) // Catalogue cached between utterances.
  })
  it('routes an audio chat model using content parts, with language and vocabulary hints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(catalogue))
      .mockResolvedValue(
        response({ choices: [{ message: { content: [{ type: 'text', text: 'hello Roshan' }] } }] })
      )
    vi.stubGlobal('fetch', fetchMock)
    await fetchTranscriptionModels('key')
    expect(
      await transcribeAudio({ ...input, model: 'google/gemini-2.5-flash', vocabulary: ['Roshan'] })
    ).toBe('hello Roshan')
    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(url).toContain('/chat/completions')
    const body = JSON.parse(init.body)
    expect(body.messages[0].content[1]).toEqual({
      type: 'input_audio',
      input_audio: { data: 'AAAA', format: 'wav' }
    })
    expect(body.messages[0].content[0].text).toContain('Roshan')
  })
  it('supports an explicit operation for newly introduced models without discovery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ text: 'new model' }))
    vi.stubGlobal('fetch', fetchMock)
    await transcribeAudio({
      ...input,
      model: 'new/asr',
      route: 'transcription',
      language: '',
      vocabulary: ['Roshan']
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ model: 'new/asr', input_audio: { data: 'AAAA', format: 'wav' } })
    // Unsupported keyterms/temperature options must not break dedicated ASR providers.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('explains missing slugs without sending audio to a guessed operation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(catalogue))
    vi.stubGlobal('fetch', fetchMock)
    await fetchTranscriptionModels('key')
    await expect(transcribeAudio({ ...input, model: 'missing/model' })).rejects.toThrow(
      /not in OpenRouter's current catalogue/
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('preserves provider errors with slug, operation and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: { message: 'Invalid API key' } }, 401))
    )
    await expect(transcribeAudio({ ...input, route: 'transcription' })).rejects.toThrow(
      /qwen.*transcription.*401.*Invalid API key/
    )
  })
  it('aborts an in-flight transcription when the session is cancelled', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener('abort', () => reject(init.signal.reason))
        )
    )
    vi.stubGlobal('fetch', fetchMock)
    const request = transcribeAudio({ ...input, route: 'transcription', signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controller.abort()
    await expect(request).rejects.toThrow(/abort/i)
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
  })
})

describe('local speech', () => {
  it('sends multipart audio to loopback without forwarding cloud credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ text: 'local words' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(
      await transcribeAudio({
        ...input,
        engine: 'local',
        localEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions'
      })
    ).toBe('local words')
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers).toEqual({})
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.body.get('file').type).toBe('audio/wav')
  })
  it('rejects remote local endpoints and credentials in URLs', () => {
    expect(() => localTranscriptionUrl('https://example.com/transcribe')).toThrow()
    expect(() => localTranscriptionUrl('http://user:pass@localhost/transcribe')).toThrow()
  })
})
