import { expect, it } from 'vitest'
import { defaultSettings, type ModelOption } from '@shared/types'
import { localSteps, openRouterSteps, routerSteps } from './connection-test'

const models: ModelOption[] = [
  { slug: 'openai/whisper-1', name: 'Whisper', route: 'transcription' } as ModelOption
]

it('reports a router.audio result as one step', () => {
  expect(routerSteps({ ok: true, message: 'x' })[0].ok).toBe(true)
  expect(routerSteps({ ok: false, message: 'Bad key' })).toEqual([{ label: 'Bad key', ok: false }])
})

it('stops at a rejected OpenRouter key', () => {
  const steps = openRouterSteps({ ok: false, message: 'HTTP 401' }, null, 'a/b', 'auto')
  expect(steps).toEqual([{ label: 'HTTP 401', ok: false }])
})

it('walks key, model list and model', () => {
  const steps = openRouterSteps({ ok: true, message: '' }, models, 'openai/whisper-1', 'auto')
  expect(steps.map((s) => s.ok)).toEqual([true, true, true])
  expect(steps[2].label).toContain('Model found')
})

it('flags a model missing from the list unless the operation was chosen by hand', () => {
  const auto = openRouterSteps({ ok: true, message: '' }, models, 'new/model', 'auto')
  expect(auto[2].ok).toBe(false)
  const manual = openRouterSteps({ ok: true, message: '' }, models, 'new/model', 'chat')
  expect(manual[2].ok).toBe(true)
})

it('reports a failed model list and an empty model', () => {
  expect(openRouterSteps({ ok: true, message: '' }, null, 'a/b', 'auto')[1].ok).toBe(false)
  expect(openRouterSteps({ ok: true, message: '' }, models, ' ', 'auto')[2].ok).toBe(false)
})

it('checks local settings without contacting the server', () => {
  const good = localSteps({ ...defaultSettings, localEndpoint: 'http://127.0.0.1:8000/v1/audio/transcriptions', localModel: 'm' })
  expect(good[0].ok).toBe(true)
  const remote = localSteps({ ...defaultSettings, localEndpoint: 'http://example.com/x', localModel: 'm' })
  expect(remote[0].ok).toBe(false)
})
