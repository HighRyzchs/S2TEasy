import { afterEach, expect, it, vi } from 'vitest'
import { analyzeCueAudio, fetchCueModels } from './speech-cue-model'
import { defaultSpeechCues } from '../shared/speech-cues'
const model = defaultSpeechCues().model
const catalogue = {
  data: [
    {
      id: model,
      architecture: { input_modalities: ['audio', 'text'], output_modalities: ['text'] },
      supported_parameters: ['structured_outputs']
    },
    {
      id: 'stt/only',
      architecture: { input_modalities: ['audio'], output_modalities: ['transcription'] },
      supported_parameters: []
    },
    {
      id: 'text/only',
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      supported_parameters: ['structured_outputs']
    }
  ]
}
const response = (body: unknown, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body
})
const input = () => ({
  apiKey: 'test-secret',
  settings: defaultSpeechCues(),
  wavBase64: 'SELECTED-CLIP-ONLY',
  durationMs: 1000,
  startMs: 500,
  signal: new AbortController().signal,
  onUsage: vi.fn()
})
const valid = {
  quality: 'usable',
  summary: 'Even delivery.',
  cues: [
    {
      startMs: 0,
      endMs: 900,
      kind: 'delivery',
      label: 'monotone',
      strength: 'clear',
      evidence: 'Even pitch.'
    }
  ]
}
afterEach(() => vi.unstubAllGlobals())
it('discovers audio chat models, excludes STT/text-only slugs and sends audio with a strict schema and data policy', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(catalogue))
    .mockResolvedValueOnce(
      response({
        choices: [{ message: { content: JSON.stringify(valid) } }],
        usage: { cost: '0.001', prompt_tokens: 100, completion_tokens: 50 }
      })
    )
  vi.stubGlobal('fetch', fetcher)
  const i = input(),
    result = await analyzeCueAudio(i)
  expect(result.cues[0]).toMatchObject({ startMs: 500, endMs: 1400 })
  const [url, request] = fetcher.mock.calls[1]
  expect(url).toContain('/chat/completions')
  const body = JSON.parse(request.body)
  expect(body.provider).toEqual({ require_parameters: true, data_collection: 'deny' })
  expect(body.response_format.json_schema.strict).toBe(true)
  expect(body.messages[1].content[1].input_audio.data).toBe('SELECTED-CLIP-ONLY')
  expect(body.tools).toBeUndefined()
  expect(i.onUsage).toHaveBeenCalledWith(
    expect.objectContaining({ costUsd: 0.001, outcome: 'success', attempt: 1 })
  )
  fetcher.mockResolvedValue(response(catalogue))
  expect(await fetchCueModels('key')).toEqual([{ slug: model, name: model }])
})
it('does not call paid inference for a dedicated STT slug', async () => {
  const fetcher = vi.fn().mockResolvedValue(response(catalogue))
  vi.stubGlobal('fetch', fetcher)
  const i = input()
  i.settings.model = 'stt/only'
  await expect(analyzeCueAudio(i)).rejects.toThrow('Dedicated STT')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(i.onUsage).not.toHaveBeenCalled()
})
it('logs reported cost on invalid model output, and never retries paid errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(catalogue))
    .mockResolvedValueOnce(
      response({ choices: [{ message: { content: 'not json' } }], usage: { cost: 0.002 } })
    )
  vi.stubGlobal('fetch', fetcher)
  const i = input()
  await expect(analyzeCueAudio(i)).rejects.toThrow('invalid JSON')
  expect(i.onUsage).toHaveBeenCalledWith(
    expect.objectContaining({ costUsd: 0.002, outcome: 'error' })
  )
  fetcher
    .mockReset()
    .mockResolvedValueOnce(response(catalogue))
    .mockResolvedValueOnce(response({ error: 'limited' }, 429))
  const next = input()
  await expect(analyzeCueAudio(next)).rejects.toThrow('No automatic retry')
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(next.onUsage).toHaveBeenCalledWith(
    expect.objectContaining({ costUsd: null, outcome: 'error' })
  )
})
it('records cancellation without persisting late returned cues', async () => {
  const controller = new AbortController(),
    i = { ...input(), signal: controller.signal }
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(response(catalogue))
      .mockImplementationOnce(async () => {
        controller.abort()
        return response({
          choices: [{ message: { content: JSON.stringify(valid) } }],
          usage: { cost: 0.001 }
        })
      })
  )
  await expect(analyzeCueAudio(i)).rejects.toThrow()
  expect(i.onUsage).toHaveBeenCalledWith(
    expect.objectContaining({ outcome: 'cancelled', costUsd: 0.001 })
  )
})
