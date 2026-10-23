import type { AppSettings, ModelOption } from '@shared/types'
import { startError } from '@shared/engine'

export type TestStep = { label: string; ok: boolean }

type KeyResult = { ok: boolean; message: string }

/** router.audio: one real call opens a streaming connection with the key; no audio is sent. */
export function routerSteps(result: KeyResult): TestStep[] {
  return [
    result.ok
      ? { label: 'Key accepted, connected to router.audio', ok: true }
      : { label: result.message || 'Could not connect to router.audio', ok: false }
  ]
}

/** OpenRouter: check the key, load the audio model list, then look for the chosen model in it. */
export function openRouterSteps(
  key: KeyResult,
  models: ModelOption[] | null,
  slug: string,
  route: AppSettings['openrouterRoute']
): TestStep[] {
  if (!key.ok) return [{ label: key.message || 'Key not accepted', ok: false }]
  const steps: TestStep[] = [{ label: 'Key accepted', ok: true }]
  if (!models) return [...steps, { label: 'Could not load the audio model list', ok: false }]
  steps.push({
    label: `${models.length} audio ${models.length === 1 ? 'model' : 'models'} available`,
    ok: models.length > 0
  })
  const wanted = slug.trim()
  if (!wanted) return [...steps, { label: 'No model chosen yet', ok: false }]
  if (models.some((model) => model.slug === wanted)) {
    return [...steps, { label: `Model found: ${wanted}`, ok: true }]
  }
  return [
    ...steps,
    route === 'auto'
      ? { label: `“${wanted}” is not in OpenRouter’s list. Pick the API operation yourself if it is new.`, ok: false }
      : { label: `“${wanted}” is not in the list, but you chose the API operation yourself`, ok: true }
  ]
}

/** On this PC: the app cannot reach your server from here, so it checks what it can. */
export function localSteps(settings: Pick<AppSettings, 'sttEngine' | 'localEndpoint' | 'localModel'>): TestStep[] {
  const problem = startError({ ...settings, sttEngine: 'local' } as AppSettings)
  return [
    problem
      ? { label: problem, ok: false }
      : { label: 'Address and model name look right. The server itself is not contacted.', ok: true }
  ]
}
