import { useEffect, useRef, useState } from 'react'
import { formatHotkey } from '@shared/hotkey'
import { startError } from '@shared/engine'
import { normalizeDisplayName, type AppSettings } from '@shared/types'
import { HUD_STYLES, hudAccent, type HudStyle } from '@shared/hud'
import { Logo } from './app/icons'
import { LiveHud } from './app/hud-screen/LiveHud'
import './welcome.css'

export type WelcomeDestination = 'overview' | 'engine'
export function WelcomeTour({
  settings,
  onFinish,
  onDismiss
}: {
  settings: AppSettings
  onDismiss?: () => void
  onFinish: (patch: Partial<AppSettings>, destination: WelcomeDestination) => Promise<void>
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(settings.displayName)
  const [appearance, setAppearance] = useState(settings.appearance)
  const [hud, setHud] = useState(settings.hud)
  const [recovery, setRecovery] = useState(settings.recoveryAudio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const committing = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const engineReady = !startError(settings)
  // The page behind the tour follows the appearance choice live; leaving restores what is saved.
  const saved = useRef(settings.appearance)
  saved.current = settings.appearance
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance
  }, [appearance])
  useEffect(
    () => () => {
      document.documentElement.dataset.appearance = saved.current
    },
    []
  )
  useEffect(() => {
    dialog.current?.showModal()
    return () => dialog.current?.close()
  }, [])
  useEffect(() => {
    if (step > 0) heading.current?.focus()
  }, [step])
  const finish = async (destination: WelcomeDestination) => {
    if (committing.current) return
    committing.current = true
    setBusy(true)
    setError('')
    try {
      await onFinish(
        {
          displayName: normalizeDisplayName(name),
          appearance,
          hud,
          recoveryAudio: recovery,
          welcomeCompleted: true
        },
        destination
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your preferences. Try again.')
    } finally {
      committing.current = false
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className="welcome-dialog"
      aria-labelledby="welcome-title"
      onCancel={(event) => {
        event.preventDefault()
        void finish('overview')
      }}
    >
      <aside className="welcome-aside">
        <div className="welcome-brand">
          <Logo size={32} />
          S2Teasy
        </div>
        <div className="welcome-art" aria-hidden="true">
          {[18, 34, 55, 80, 48, 96, 64, 38, 62, 25, 14].map((height, i) => (
            <i key={i} style={{ height, animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <p>
          Your voice.
          <br />
          <strong>Your kind of flow.</strong>
        </p>
        <ol aria-label="Tour progress">
          {['A little introduction', 'Make it yours', 'Your first words'].map((title, i) => (
            <li
              key={title}
              aria-current={step === i ? 'step' : undefined}
              className={step === i ? 'current' : step > i ? 'done' : ''}
            >
              <span>{step > i ? '✓' : `0${i + 1}`}</span>
              {title}
            </li>
          ))}
        </ol>
        <small>
          Open source. Stored on your device.
          <br />
          No S2Teasy account required.
        </small>
      </aside>
      <div className="welcome-main">
        <div className="welcome-top">
          <span className="label">Welcome · {step + 1} of 3</span>
          <button type="button" className="link" disabled={busy} onClick={() => void finish('overview')}>
            Save & exit
          </button>
        </div>
        <h2 id="welcome-title" ref={heading} tabIndex={-1}>
          {step === 0
            ? 'Room for your voice.'
            : step === 1
              ? 'Make yourself at home.'
              : `Ready for your first thought${normalizeDisplayName(name) ? `, ${normalizeDisplayName(name)}` : ''}?`}
        </h2>
        {step === 0 && (
          <div className="welcome-step">
            <p className="welcome-lead">
              A few small choices, then you’re free to speak. You can change everything later.
            </p>
            <label className="welcome-name" htmlFor="welcome-name">
              What should we call you? <span>Optional</span>
            </label>
            <input
              className="input"
              id="welcome-name"
              autoFocus
              autoComplete="off"
              maxLength={120}
              placeholder="A name, nickname, or handle"
              value={name}
              onChange={(e) => setName(Array.from(e.target.value).slice(0, 60).join(''))}
              aria-describedby="welcome-name-note"
            />
            <p id="welcome-name-note" className="hint">
              Whatever feels like you. Up to 60 characters, stored only in this app’s local
              settings. It isn’t added to speech prompts or Vocabulary automatically.
            </p>
            <div className="welcome-note">
              <span aria-hidden="true">◇</span>
              <div>
                <strong>Your words belong to you.</strong>
                <p>
                  Use your own speech provider key, or connect a local speech server. This tour
                  doesn’t turn on your microphone or send any audio.
                </p>
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="welcome-step">
            <p className="welcome-lead">A comfortable workspace. A small window for your voice.</p>
            <div className="seg" role="group" aria-label="Workspace appearance">
              {(['dark', 'light', 'system'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={appearance === value}
                  onClick={() => setAppearance(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <div className="welcome-skins" role="group" aria-label="HUD style">
              {HUD_STYLES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={hud.style === id}
                  onClick={() => setHud({ ...hud, style: id as HudStyle, accent: hudAccent(id) })}
                >
                  <i style={{ background: id === hud.style ? hud.accent : hudAccent(id) }} />
                  {label}
                </button>
              ))}
            </div>
            <div className="welcome-hud">
              <span className="welcome-preview-label">Simulated preview · no microphone</span>
              <LiveHud
                className="welcome-stage"
                hud={{ ...hud, scale: Math.min(hud.scale, 0.9) }}
                position="bottom"
                state="talking"
              />
            </div>
            <label className="welcome-recovery">
              <input
                type="checkbox"
                checked={recovery}
                onChange={(e) => setRecovery(e.target.checked)}
              />
              <span>
                <strong>Keep temporary audio for recovery</strong>
                <small>
                  When enabled, audio is saved on this device while recording. Failed takes expire
                  after {settings.audioRetentionDays}{' '}
                  {settings.audioRetentionDays === 1 ? 'day' : 'days'}.{' '}
                  {settings.keepAudioForTraining
                    ? 'Your existing successful-take retention setting stays on.'
                    : 'Successful takes are deleted unless you turn on training retention.'}
                </small>
              </span>
            </label>
            <p className="hint">
              {!recovery && settings.keepAudioForTraining
                ? 'Training retention is still on in your existing settings. Turn it off in Privacy & data if you want no retained audio.'
                : 'You control retention in Settings → Privacy & data.'}{' '}
              Cloud speech engines receive audio when you choose to dictate; local speech uses your
              local server.
            </p>
          </div>
        )}
        {step === 2 && (
          <div className="welcome-step">
            <p className="welcome-lead">
              Start in Notepad or another text field. Keep History as your safety net.
            </p>
            <div className="welcome-shortcut">
              <span>Your recording shortcut</span>
              <kbd className="kbd">{formatHotkey(settings.hotkey)}</kbd>
              <p>
                {settings.hotkeyMode === 'hold'
                  ? 'Hold to speak. Release to pause; a paused session finishes by itself.'
                  : 'Press to start, and press again to pause. A paused session finishes by itself after a few seconds.'}
              </p>
            </div>
            <div className="welcome-lessons">
              <div>
                <span>01</span>
                <p>
                  <strong>Choose where your words go.</strong> Focus a text field, then use your
                  shortcut.{' '}
                  {settings.insertMode === 'live'
                    ? 'Finalized phrases arrive as you speak.'
                    : 'Your transcript is inserted when you finish.'}
                </p>
              </div>
              <div>
                <span>02</span>
                <p>
                  <strong>Your HUD shows what it heard.</strong> Click a word to fix it, Pause to
                  stop and edit, Copy to keep the text, Done to finish now. Leave a paused session
                  alone and it finishes by itself.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>Keep the words that matter.</strong> Review History, remember selected
                  word corrections and record labeled practice takes in Your voice. Those examples
                  don’t automatically fine-tune a model.
                </p>
              </div>
            </div>
            <p className="welcome-engine-note">
              {engineReady
                ? 'Speech settings are configured. You can check your microphone and test the engine in Settings.'
                : 'One step left: configure a speech engine in Settings. Cloud providers may charge for dictation; microphone volume tests stay local.'}
            </p>
          </div>
        )}
        {error && (
          <div>
            <p className="welcome-error" role="alert">
              {error}
            </p>
            {onDismiss && (
              <button type="button" className="link" disabled={busy} onClick={onDismiss}>
                Continue without saving
              </button>
            )}
          </div>
        )}
        <footer className="welcome-footer">
          <button type="button" className="btn" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          <div>
            {step === 2 && (
              <button
                type="button"
                className="link"
                disabled={busy}
                onClick={() => void finish(engineReady ? 'engine' : 'overview')}
              >
                {engineReady ? 'Review speech settings' : 'Explore workspace'}
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                step < 2 ? setStep(step + 1) : void finish(engineReady ? 'overview' : 'engine')
              }
            >
              {busy
                ? 'Saving…'
                : step < 2
                  ? 'Continue →'
                  : engineReady
                    ? 'Open my workspace →'
                    : 'Set up speech engine →'}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
