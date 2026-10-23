import { ProfileSettings } from './ProfileSettings'
import { useEffect, useRef, useState } from 'react'
import { LANGUAGES } from '@shared/constants'
import { eventToAccelerator, formatHotkey } from '@shared/hotkey'
import {
  ROUTER_PROVIDERS,
  type AppSettings,
  type ModelOption,
  type UpdateStatus
} from '@shared/types'
import { OverlayThemeEditor } from './OverlayThemeEditor'
import { MicPreview } from './lib/mic'
import { UpdatePanel } from './UpdatePanel'

export type SettingsSection = 'engine' | 'dictation' | 'appearance' | 'privacy' | 'profile'

type Props = {
  initialSection?: SettingsSection
  onProfileSave: (name: string) => Promise<void>
  onReplayTour: () => void
  settings: AppSettings
  update: UpdateStatus
  onChange: (patch: Partial<AppSettings>) => Promise<void>
  onUpdate: (status: UpdateStatus) => void
  ready: boolean
  onToast: (text: string) => void
}

export function SettingsPanel({
  settings,
  update,
  onChange,
  onUpdate,
  initialSection = 'engine',
  onProfileSave,
  onReplayTour
}: Props) {
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [routerKey, setRouterKey] = useState(settings.routerAudioKey)
  const [model, setModel] = useState(settings.model)
  const [localEndpoint, setLocalEndpoint] = useState(settings.localEndpoint)
  const [localModel, setLocalModel] = useState(settings.localModel)
  const [models, setModels] = useState<ModelOption[]>([])
  const [message, setMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [section, setSection] = useState<string>(initialSection)
  useEffect(() => {
    setApiKey(settings.apiKey)
    setRouterKey(settings.routerAudioKey)
    setModel(settings.model)
    setLocalEndpoint(settings.localEndpoint)
    setLocalModel(settings.localModel)
  }, [
    settings.apiKey,
    settings.routerAudioKey,
    settings.model,
    settings.localEndpoint,
    settings.localModel
  ])
  useEffect(() => {
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => setMics(devices.filter((d) => d.kind === 'audioinput')))
      .catch(() => undefined)
  }, [])
  const save = (patch: Partial<AppSettings>) => {
    void onChange(patch).catch(() => undefined)
  }
  const test = async () => {
    setTesting(true)
    setMessage('')
    try {
      if (settings.sttEngine === 'router-audio')
        setMessage((await window.s2t.testRouterKey(routerKey, settings.routerProvider)).message)
      else {
        const result = await window.s2t.testKey(apiKey)
        setMessage(result.message)
        if (result.ok) setModels(await window.s2t.fetchModels(apiKey))
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection failed.')
    } finally {
      setTesting(false)
    }
  }
  return (
    <>
      <div className="panel-head">
        <div>
          <span className="eyebrow">Make it yours</span>
          <h2>Settings</h2>
          <p>Your engine, your shortcuts, your space.</p>
        </div>
        <span className="subtle-tag">Saved on this device</span>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Settings section">
        {[
          ['engine', 'Speech engine'],
          ['dictation', 'Dictation'],
          ['appearance', 'Appearance'],
          ['privacy', 'Privacy & data'],
          ['profile', 'Profile & tour']
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'active' : ''}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="settings">
        {section === 'engine' && (
          <>
            <section className="block">
              <h3>Choose how you transcribe</h3>
              <p className="hint">
                Streaming returns words as you speak. Audio models and local speech process short
                phrases in order.
              </p>
              <div className="engine-options">
                {[
                  ['router-audio', 'Live streaming', 'router.audio · provider key'],
                  ['openrouter', 'OpenRouter', 'Bring your key & audio model'],
                  ['local', 'Local speech', 'Your computer · no cloud key']
                ].map(([id, label, hint]) => (
                  <button
                    className={settings.sttEngine === id ? 'engine-option active' : 'engine-option'}
                    key={id}
                    aria-pressed={settings.sttEngine === id}
                    onClick={() => save({ sttEngine: id as AppSettings['sttEngine'] })}
                  >
                    <span className="radio-dot" />
                    <strong>{label}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>
            </section>
            {settings.sttEngine === 'router-audio' && (
              <section className="block">
                <h3>Streaming connection</h3>
                <p className="hint">
                  A router.audio or supported provider key is required. Your OpenRouter key is kept
                  separate.
                </p>
                <Field label="API key" id="router-key">
                  <input
                    id="router-key"
                    type="password"
                    autoComplete="off"
                    value={routerKey}
                    onChange={(e) => setRouterKey(e.target.value)}
                    placeholder="Paste your streaming provider key"
                  />
                </Field>
                <Field label="Provider" id="provider">
                  <select
                    id="provider"
                    value={settings.routerProvider}
                    onChange={(e) =>
                      save({ routerProvider: e.target.value as AppSettings['routerProvider'] })
                    }
                  >
                    {ROUTER_PROVIDERS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'auto' ? 'Choose automatically' : p}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="inline">
                  <button
                    className="primary"
                    onClick={() => save({ routerAudioKey: routerKey.trim() })}
                  >
                    Save key
                  </button>
                  <button className="ghost" disabled={testing} onClick={() => void test()}>
                    {testing ? 'Connecting…' : 'Test connection'}
                  </button>
                </div>
              </section>
            )}
            {settings.sttEngine === 'openrouter' && (
              <section className="block">
                <h3>OpenRouter connection</h3>
                <p className="hint">
                  Choose a model that accepts audio input and returns text. Model availability and
                  pricing depend on your account.
                </p>
                <Field label="API key" id="openrouter-key">
                  <input
                    id="openrouter-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-or-v1-…"
                  />
                </Field>
                <Field label="Audio model slug" id="model-slug">
                  <input
                    id="model-slug"
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
                </Field>
                <Field label="API operation" id="audio-operation">
                  <select
                    id="audio-operation"
                    value={settings.openrouterRoute}
                    onChange={(e) =>
                      save({ openrouterRoute: e.target.value as AppSettings['openrouterRoute'] })
                    }
                  >
                    <option value="auto">Auto · use model capabilities</option>
                    <option value="transcription">Speech-to-text · /audio/transcriptions</option>
                    <option value="chat">Audio chat · /chat/completions</option>
                  </select>
                </Field>
                <p className="hint">
                  Qwen ASR, Grok STT, Whisper and other speech models use Transcription. Gemini and
                  other audio chat models use Chat. Auto selects the route from OpenRouter’s
                  catalogue.
                </p>
                <div className="inline">
                  <button
                    className="primary"
                    onClick={() => save({ apiKey: apiKey.trim(), model: model.trim() })}
                  >
                    Save connection
                  </button>
                  <button className="ghost" disabled={testing} onClick={() => void test()}>
                    {testing ? 'Checking…' : 'Test & load audio models'}
                  </button>
                </div>
              </section>
            )}
            {settings.sttEngine === 'local' && (
              <section className="block">
                <h3>Speech on your computer</h3>
                <p className="hint">
                  Connect to a separately installed OpenAI-compatible speech server, such as
                  Speaches with faster-whisper. A language model alone cannot transcribe microphone
                  audio.
                </p>
                <Field label="Local transcription endpoint" id="local-endpoint">
                  <input
                    id="local-endpoint"
                    value={localEndpoint}
                    onChange={(e) => setLocalEndpoint(e.target.value)}
                  />
                </Field>
                <Field label="Installed speech model" id="local-model">
                  <input
                    id="local-model"
                    value={localModel}
                    onChange={(e) => setLocalModel(e.target.value)}
                  />
                </Field>
                <p className="micro">
                  Loopback addresses only. The server and model must already be running; model
                  downloads are separate.
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    save({ localEndpoint: localEndpoint.trim(), localModel: localModel.trim() })
                  }
                >
                  Save local connection
                </button>
              </section>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
          </>
        )}
        {section === 'dictation' && (
          <>
            <section className="block">
              <h3>A shortcut to your thoughts</h3>
              <p className="hint">Focus a text field, trigger the shortcut, and speak.</p>
              <Field label="Global shortcut" id="hotkey">
                <input
                  id="hotkey"
                  readOnly
                  value={capturing ? 'Press a key combination…' : formatHotkey(settings.hotkey)}
                  onFocus={() => setCapturing(true)}
                  onBlur={() => setCapturing(false)}
                  onKeyDown={(e) => {
                    const key = eventToAccelerator(e)
                    if (key) {
                      e.preventDefault()
                      setCapturing(false)
                      save({ hotkey: key })
                    }
                  }}
                />
              </Field>
              <div className="grid-2">
                <Field label="Shortcut behavior" id="hotkey-mode">
                  <select
                    id="hotkey-mode"
                    value={settings.hotkeyMode}
                    onChange={(e) =>
                      save({ hotkeyMode: e.target.value as AppSettings['hotkeyMode'] })
                    }
                  >
                    <option value="toggle">Press to start / stop</option>
                    <option value="hold">Hold to talk</option>
                  </select>
                </Field>
                <Field label="Write into the focused app" id="insert-mode">
                  <select
                    id="insert-mode"
                    value={settings.insertMode}
                    onChange={(e) =>
                      save({ insertMode: e.target.value as AppSettings['insertMode'] })
                    }
                  >
                    <option value="live">As phrases finalize</option>
                    <option value="final">When I stop speaking</option>
                  </select>
                </Field>
              </div>
              <Field label="Capture after Stop" id="capture-tail">
                <select
                  id="capture-tail"
                  value={settings.captureTailMs}
                  onChange={(e) => save({ captureTailMs: Number(e.target.value) })}
                >
                  <option value={0}>Off · immediate stop</option>
                  <option value={300}>0.3 seconds</option>
                  <option value={500}>0.5 seconds</option>
                  <option value={600}>0.6 seconds · recommended</option>
                  <option value={1000}>1 second</option>
                  <option value={1500}>1.5 seconds</option>
                </select>
                <p className="hint">
                  Keeps the microphone open briefly after Stop to catch the last word. Cancel always
                  stops immediately.
                </p>
              </Field>
              <Field label="Language hint" id="language">
                <select
                  id="language"
                  value={settings.language}
                  onChange={(e) => save({ language: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Toggle
                label="Request word timestamps"
                hint="For compatible speech-to-text models. Enables timed playback for retained audio; unsupported models may reject this option. Off by default."
                on={settings.requestWordTimings}
                onClick={() => save({ requestWordTimings: !settings.requestWordTimings })}
              />
              <Toggle
                label="Launch at Windows startup"
                on={settings.launchAtStartup}
                onClick={() => save({ launchAtStartup: !settings.launchAtStartup })}
              />
            </section>
            <section className="block">
              <h3>Microphone</h3>
              <p className="hint">
                Start with your system default. Adjust processing for your microphone and room.
              </p>
              <Field label="Input device" id="microphone">
                <select
                  id="microphone"
                  value={settings.microphoneId}
                  onChange={(e) => save({ microphoneId: e.target.value })}
                >
                  <option value="">System default</option>
                  {mics.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || 'Microphone'}
                    </option>
                  ))}
                </select>
              </Field>
              <MicStudio settings={settings} />
              <Field label={`Input gain · ${settings.inputGain.toFixed(2)}×`} id="gain">
                <input
                  id="gain"
                  type="range"
                  min={0.5}
                  max={2.4}
                  step={0.05}
                  value={settings.inputGain}
                  onChange={(e) => save({ inputGain: Number(e.target.value) })}
                />
              </Field>
              <div className="grid-2">
                {(
                  [
                    'echoCancellation',
                    'noiseSuppression',
                    'autoGainControl',
                    'voiceIsolation'
                  ] as const
                ).map((key, i) => (
                  <Toggle
                    key={key}
                    label={
                      [
                        'Echo cancellation',
                        'Noise suppression',
                        'Automatic gain',
                        'Voice isolation'
                      ][i]
                    }
                    on={settings[key]}
                    onClick={() => save({ [key]: !settings[key] })}
                  />
                ))}
              </div>
              {settings.sttEngine !== 'router-audio' && (
                <Field label="Pause detection" id="vad">
                  <select
                    id="vad"
                    value={settings.vadSensitivity}
                    onChange={(e) =>
                      save({ vadSensitivity: e.target.value as AppSettings['vadSensitivity'] })
                    }
                  >
                    <option value="low">Longer pauses</option>
                    <option value="medium">Balanced</option>
                    <option value="high">Shorter pauses</option>
                  </select>
                </Field>
              )}
            </section>
          </>
        )}
        {section === 'appearance' && (
          <>
            <section className="block">
              <h3>Your workspace</h3>
              <p className="hint">Comfortable in the light. Focused in the dark.</p>
              <div className="seg">
                {(['dark', 'light', 'system'] as const).map((theme) => (
                  <button
                    className={settings.appearance === theme ? 'active' : ''}
                    key={theme}
                    aria-pressed={settings.appearance === theme}
                    onClick={() => save({ appearance: theme })}
                  >
                    {theme[0].toUpperCase() + theme.slice(1)}
                  </button>
                ))}
              </div>
              <Toggle
                label="Show floating recording HUD"
                hint="Appears without taking keyboard focus"
                on={settings.showOverlay}
                onClick={() => save({ showOverlay: !settings.showOverlay })}
              />
              <Field label="HUD position" id="hud-position">
                <select
                  id="hud-position"
                  value={settings.overlayPosition}
                  onChange={(e) =>
                    save({ overlayPosition: e.target.value as AppSettings['overlayPosition'] })
                  }
                >
                  <option value="bottom">Bottom of active display</option>
                  <option value="top">Top of active display</option>
                  <option value="top-left">Top left</option>
                  <option value="top-right">Top right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom-right">Bottom right</option>
                  <option value="left">Left center</option>
                  <option value="right">Right center</option>
                  <option value="center">Center</option>
                </select>
              </Field>
              <div className="position-picker" aria-label="HUD anchor position">
                {(
                  [
                    'top-left',
                    'top',
                    'top-right',
                    'left',
                    'center',
                    'right',
                    'bottom-left',
                    'bottom',
                    'bottom-right'
                  ] as const
                ).map((position) => (
                  <button
                    key={position}
                    className={settings.overlayPosition === position ? 'on' : ''}
                    aria-label={`Place HUD ${position}`}
                    aria-pressed={settings.overlayPosition === position}
                    onClick={() => save({ overlayPosition: position })}
                  >
                    {settings.overlayPosition === position ? '●' : '·'}
                  </button>
                ))}
              </div>
              <div className="grid-2">
                <Field id="hud-offset-x" label="Horizontal offset (screen pixels)">
                  <input
                    id="hud-offset-x"
                    type="number"
                    min={-4000}
                    max={4000}
                    value={settings.overlayOffsetX}
                    onChange={(e) => save({ overlayOffsetX: Number(e.target.value) })}
                  />
                </Field>
                <Field id="hud-offset-y" label="Vertical offset (screen pixels)">
                  <input
                    id="hud-offset-y"
                    type="number"
                    min={-4000}
                    max={4000}
                    value={settings.overlayOffsetY}
                    onChange={(e) => save({ overlayOffsetY: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <p className="hint">
                Positive values move right or down. Placement stays inside the active display’s work
                area. Applies to the next recording.
              </p>
              <button
                className="ghost"
                onClick={() =>
                  save({ overlayPosition: 'bottom', overlayOffsetX: 0, overlayOffsetY: 0 })
                }
              >
                Reset placement
              </button>
            </section>
            <section className="block">
              <h3>HUD studio</h3>
              <p className="hint">
                Mix the core, waveform, frame, and colors. Preview changes here.
              </p>
              <OverlayThemeEditor
                theme={settings.overlayTheme}
                onChange={(overlayTheme) => save({ overlayTheme })}
              />
            </section>
          </>
        )}
        {section === 'profile' && (
          <ProfileSettings
            displayName={settings.displayName}
            onSave={onProfileSave}
            onReplay={onReplayTour}
            onRestoreChecklist={() => onChange({ setupChecklistDismissed: false })}
          />
        )}
        {section === 'privacy' && (
          <>
            <section className="block">
              <h3>Recovery & audio retention</h3>
              <p className="hint">
                Transcript checkpoints stay on this device. Cloud engines receive microphone audio
                while you dictate; local speech uses your local server.
              </p>
              <Toggle
                label="Keep temporary audio for recovery"
                hint="Saved locally while recording. Deleted after successful insertion unless training retention is on. Failed takes remain until deleted or expired."
                on={settings.recoveryAudio}
                onClick={() => save({ recoveryAudio: !settings.recoveryAudio })}
              />
              <Toggle
                label="Keep successful takes for pronunciation examples"
                hint="Opt-in local WAV export paired with your corrected transcript. This does not fine-tune a model or upload a training dataset."
                on={settings.keepAudioForTraining}
                onClick={() => save({ keepAudioForTraining: !settings.keepAudioForTraining })}
              />
              <Field label="Delete retained audio after" id="retention">
                <select
                  id="retention"
                  value={settings.audioRetentionDays}
                  onChange={(e) => save({ audioRetentionDays: Number(e.target.value) })}
                >
                  {[1, 3, 7, 14, 30].map((days) => (
                    <option key={days} value={days}>
                      {days} {days === 1 ? 'day' : 'days'}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="micro">
                Audio and transcripts are personal data. Deleting a History entry deletes its
                retained audio. API keys use OS encryption when available; transcript and audio
                files are not encrypted by the app.
              </p>
            </section>
            <UpdatePanel
              update={update}
              autoDownload={settings.autoUpdate}
              onAutoDownload={(autoUpdate) => save({ autoUpdate })}
              onUpdate={onUpdate}
              onCheck={(download) => window.s2t.checkUpdate(download)}
              onInstall={() => window.s2t.installUpdate()}
            />
          </>
        )}
      </div>
    </>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

function Toggle({
  label,
  hint,
  on,
  onClick
}: {
  label: string
  hint?: string
  on: boolean
  onClick: () => void
}) {
  return (
    <div className="toggle-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <button
        className={on ? 'switch on' : 'switch'}
        aria-label={label}
        role="switch"
        aria-checked={on}
        onClick={onClick}
        type="button"
      >
        <i />
      </button>
    </div>
  )
}

function MicStudio({ settings }: { settings: AppSettings }) {
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const preview = useRef(new MicPreview())
  useEffect(() => {
    return () => {
      void preview.current.stop()
    }
  }, [])
  const toggle = async () => {
    try {
      if (listening) {
        await preview.current.stop()
        setListening(false)
        setLevel(0)
      } else {
        setError('')
        await preview.current.start(settings, setLevel)
        setListening(true)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open microphone.')
    }
  }
  return (
    <div className="mic-studio">
      <div
        className="mic-meter"
        role="meter"
        aria-label="Microphone level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(level * 420))}
      >
        <span style={{ width: `${Math.min(100, level * 420)}%` }} />
      </div>
      <button className="ghost" onClick={() => void toggle()}>
        {listening ? 'Stop microphone test' : 'Test microphone'}
      </button>
      {error && (
        <p className="status-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
