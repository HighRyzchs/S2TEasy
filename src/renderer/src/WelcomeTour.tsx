import { useEffect, useRef, useState } from 'react'
import { formatHotkey } from '@shared/hotkey'
import { startError } from '@shared/engine'
import { normalizeDisplayName, type AppSettings } from '@shared/types'
import { OVERLAY_SKINS } from '@shared/overlay-theme'
import { OverlayHud } from './OverlayHud'
import { useHudPreview } from './useHudPreview'
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
  const [theme, setTheme] = useState(settings.overlayTheme)
  const [recovery, setRecovery] = useState(settings.recoveryAudio)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const committing = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const engineReady = !startError(settings)
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
          overlayTheme: theme,
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
      data-appearance={appearance}
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
          <span aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path
                d="M10 19v3m5-9v15m5-19v22m5-17v12m5-7v3"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </span>{' '}
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
          <span className="eyebrow">WELCOME · {step + 1} OF 3</span>
          <button className="text-button" disabled={busy} onClick={() => void finish('overview')}>
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
            <div className="seg" aria-label="Workspace appearance">
              {(['dark', 'light', 'system'] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={appearance === value}
                  className={appearance === value ? 'active' : ''}
                  onClick={() => setAppearance(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
            <div className="welcome-skins" aria-label="Recording overlay style">
              {OVERLAY_SKINS.map(({ id, label }) => (
                <button
                  key={id}
                  aria-pressed={theme.skin === id}
                  className={theme.skin === id ? 'selected' : ''}
                  onClick={() => setTheme({ ...theme, skin: id })}
                >
                  <i data-skin={id} />
                  {label}
                </button>
              ))}
            </div>
            <WelcomeHud theme={theme} />
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
              <kbd>{formatHotkey(settings.hotkey)}</kbd>
              <p>
                {settings.hotkeyMode === 'hold'
                  ? 'Hold to speak. Release to finish.'
                  : 'Press to speak. Press again to finish.'}
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
                  <strong>Your HUD is a little toolbox.</strong> Copy saves the available text to
                  your clipboard. Review finishes into an editor. Cancel stops capture immediately
                  and keeps saved work.
                </p>
              </div>
              <div>
                <span>03</span>
                <p>
                  <strong>Keep the words that matter.</strong> Review History, remember selected
                  corrections in Vocabulary, and record labeled Voice practice takes. Those examples
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
            <p className="status-bad" role="alert">
              {error}
            </p>
            {onDismiss && (
              <button className="text-button" disabled={busy} onClick={onDismiss}>
                Continue without saving
              </button>
            )}
          </div>
        )}
        <footer className="welcome-footer">
          <button className="ghost" disabled={busy || step === 0} onClick={() => setStep(step - 1)}>
            Back
          </button>
          <div>
            {step === 2 && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void finish(engineReady ? 'engine' : 'overview')}
              >
                {engineReady ? 'Review speech settings' : 'Explore workspace'}
              </button>
            )}
            <button
              className="primary"
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

function WelcomeHud({ theme }: { theme: AppSettings['overlayTheme'] }) {
  const demo = useHudPreview()
  return (
    <div
      className="welcome-hud"
      style={{ minHeight: theme.orientation === 'vertical' ? 260 : 125 }}
    >
      <span className="welcome-preview-label">SIMULATED PREVIEW · NO MICROPHONE</span>
      <div aria-hidden="true" ref={(node) => node?.setAttribute('inert', '')}>
        <OverlayHud
          state={demo.state}
          bars={demo.bars}
          theme={{ ...theme, scale: 0.8 }}
          canStop
          preview
        />
      </div>
    </div>
  )
}
