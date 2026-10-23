import { useEffect, useState } from 'react'
import { LANGUAGES } from '@shared/constants'
import { ROUTER_PROVIDERS, type AppSettings, type ModelOption } from '@shared/types'
import { errorMessage, useApp } from '../context'
import { Check, Section, Toggle, useSave } from './controls'
import { localSteps, openRouterSteps, routerSteps, type TestStep } from './connection-test'

const ENGINES: { id: AppSettings['sttEngine']; name: string; desc: string }[] = [
  {
    id: 'router-audio',
    name: 'Streaming · router.audio',
    desc: 'Fastest for live typing. Words arrive as you speak.'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    desc: 'Pick any audio model. Words arrive after each pause.'
  },
  {
    id: 'local',
    name: 'On this PC',
    desc: 'Your own speech server. Nothing leaves the computer.'
  }
]

export function EngineSection() {
  const { settings, save } = useApp()
  const quickSave = useSave()
  const [routerKey, setRouterKey] = useState(settings.routerAudioKey)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [model, setModel] = useState(settings.model)
  const [endpoint, setEndpoint] = useState(settings.localEndpoint)
  const [localModel, setLocalModel] = useState(settings.localModel)
  const [models, setModels] = useState<ModelOption[]>([])
  const [steps, setSteps] = useState<TestStep[]>([])
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const engine = settings.sttEngine

  useEffect(() => {
    setRouterKey(settings.routerAudioKey)
    setApiKey(settings.apiKey)
    setModel(settings.model)
    setEndpoint(settings.localEndpoint)
    setLocalModel(settings.localModel)
  }, [
    settings.routerAudioKey,
    settings.apiKey,
    settings.model,
    settings.localEndpoint,
    settings.localModel
  ])
  useEffect(() => setSteps([]), [engine])

  const patch: Partial<AppSettings> =
    engine === 'router-audio'
      ? { routerAudioKey: routerKey.trim() }
      : engine === 'openrouter'
        ? { apiKey: apiKey.trim(), model: model.trim() }
        : { localEndpoint: endpoint.trim(), localModel: localModel.trim() }
  const dirty = (Object.keys(patch) as (keyof AppSettings)[]).some(
    (key) => patch[key] !== settings[key]
  )

  const saveFields = async () => {
    setSaving(true)
    setError('')
    try {
      await save(patch)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setSteps([])
    try {
      if (engine === 'router-audio') {
        setSteps(routerSteps(await window.s2t.testRouterKey(routerKey, settings.routerProvider)))
      } else if (engine === 'openrouter') {
        const key = await window.s2t.testKey(apiKey)
        let list: ModelOption[] | null = null
        if (key.ok) {
          list = await window.s2t.fetchModels(apiKey).catch(() => null)
          if (list) setModels(list)
        }
        setSteps(openRouterSteps(key, list, model, settings.openrouterRoute))
      } else {
        setSteps(localSteps({ sttEngine: engine, localEndpoint: endpoint, localModel }))
      }
    } catch (e) {
      setSteps([{ label: errorMessage(e), ok: false }])
    } finally {
      setTesting(false)
    }
  }

  const billing =
    engine === 'local'
      ? 'This checks the address and model name you typed. It does not contact your server.'
      : 'The test checks your key and, for OpenRouter, loads the model list. It sends no audio, so it should not be billed.'

  return (
    <Section id="engine" title="Speech engine" intro="Where your voice becomes text.">
      <div className="engine-cards" role="radiogroup" aria-label="Engine">
        {ENGINES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={engine === entry.id}
            className="engine-card"
            onClick={() => quickSave({ sttEngine: entry.id })}
          >
            <strong>{entry.name}</strong>
            <span className="dim">{entry.desc}</span>
          </button>
        ))}
      </div>

      <div className="set-fields">
        {engine === 'router-audio' && (
          <>
            <div className="field">
              <label htmlFor="router-key">router.audio key</label>
              <input
                id="router-key"
                className="input mono"
                type="password"
                autoComplete="off"
                value={routerKey}
                onChange={(e) => setRouterKey(e.target.value)}
                placeholder="Paste your key"
                aria-describedby="router-key-hint"
              />
              <span id="router-key-hint" className="hint">
                A router.audio key, or a key from one of its providers. Kept separate from your
                OpenRouter key.
              </span>
            </div>
            <div className="field">
              <label htmlFor="provider">Provider</label>
              <select
                id="provider"
                className="select"
                value={settings.routerProvider}
                onChange={(e) =>
                  quickSave({ routerProvider: e.target.value as AppSettings['routerProvider'] })
                }
              >
                {ROUTER_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === 'auto' ? 'Choose automatically' : p}
                  </option>
                ))}
              </select>
              <span className="hint">Who does the listening behind router.audio.</span>
            </div>
          </>
        )}
        {engine === 'openrouter' && (
          <>
            <div className="field">
              <label htmlFor="openrouter-key">OpenRouter key</label>
              <input
                id="openrouter-key"
                className="input mono"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
              />
              <span className="hint">Stored with Windows credential protection when available.</span>
            </div>
            <div className="field">
              <label htmlFor="model-slug">Audio model</label>
              <input
                id="model-slug"
                className="input mono"
                list="audio-models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="provider/model"
              />
              <datalist id="audio-models">
                {models.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name}
                    {m.route
                      ? ` · ${m.route === 'transcription' ? 'Speech-to-text' : 'Audio chat'}`
                      : ''}
                  </option>
                ))}
              </datalist>
              <span className="hint">Run the test to load the models your account can use.</span>
            </div>
            <div className="field">
              <label htmlFor="audio-operation">API operation</label>
              <select
                id="audio-operation"
                className="select"
                value={settings.openrouterRoute}
                onChange={(e) =>
                  quickSave({ openrouterRoute: e.target.value as AppSettings['openrouterRoute'] })
                }
              >
                <option value="auto">Automatic, from the model list</option>
                <option value="transcription">Speech-to-text (/audio/transcriptions)</option>
                <option value="chat">Audio chat (/chat/completions)</option>
              </select>
              <span className="hint">
                Whisper, Qwen ASR and Grok STT are speech-to-text; Gemini and other audio chat
                models use chat. Only change this for a brand-new model.
              </span>
            </div>
          </>
        )}
        {engine === 'local' && (
          <>
            <div className="field">
              <label htmlFor="local-endpoint">Server address</label>
              <input
                id="local-endpoint"
                className="input mono"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://127.0.0.1:8000/v1/audio/transcriptions"
              />
              <span className="hint">
                An OpenAI-compatible speech server on this PC, such as Speaches with
                faster-whisper. Only 127.0.0.1 and localhost are accepted.
              </span>
            </div>
            <div className="field">
              <label htmlFor="local-model">Model name</label>
              <input
                id="local-model"
                className="input mono"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
              />
              <span className="hint">
                The server and its model must already be running. A chat model alone cannot
                transcribe audio.
              </span>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            className="select"
            value={settings.language}
            onChange={(e) => quickSave({ language: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="hint">A hint, not a lock.</span>
        </div>
      </div>

      <div className="set-actions">
        <button
          type="button"
          className="btn primary"
          disabled={!dirty || saving}
          onClick={() => void saveFields()}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="btn" disabled={testing} onClick={() => void test()}>
          {testing ? 'Testing…' : 'Test the connection'}
        </button>
        <div className="set-results" role="status" aria-live="polite">
          {steps.map((step, index) => (
            <Check key={index} ok={step.ok}>
              {step.label}
            </Check>
          ))}
        </div>
      </div>
      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}
      <p className="hint">{billing}</p>

      <div className="set-lines">
        <Toggle
          label="Word timestamps"
          hint="Asks the speech model for when each word was said, so kept audio can play back word by word. Only some models support it; others may refuse the request and the take fails. Off by default."
          checked={settings.requestWordTimings}
          onChange={(requestWordTimings) => quickSave({ requestWordTimings })}
        />
        <Toggle
          label="Check accent fixes in context"
          hint={
            settings.apiKey
              ? 'After each session, a small OpenRouter text model reads the sentences around your accent words (like bike → bite) and puts back what you said where the fix does not fit. It can only choose between the two words. Costs a fraction of a cent per session that has one.'
              : 'Save an OpenRouter key in Voice intelligence to use this.'
          }
          checked={settings.accentContextCheck}
          disabled={!settings.apiKey && !settings.accentContextCheck}
          onChange={(accentContextCheck) => quickSave({ accentContextCheck })}
        />
        {engine === 'router-audio' && (
          <Toggle
            label={
              <>
                Send my words as key terms <span className="pill off">Experimental</span>
              </>
            }
            hint={
              settings.routerProvider === 'deepgram'
                ? 'Sends the personal words from Your voice to Deepgram as key terms, so it is more likely to spell them your way. router.audio does not document this, so it may be ignored or rejected.'
                : 'Choose Deepgram as the provider to use this. router.audio does not document it, so it may be ignored or rejected.'
            }
            checked={settings.streamKeyterms}
            disabled={settings.routerProvider !== 'deepgram'}
            onChange={(streamKeyterms) => quickSave({ streamKeyterms })}
          />
        )}
      </div>
    </Section>
  )
}
