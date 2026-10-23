import { useState } from 'react'
import type { AppSettings, HistoryItem, OverlayState } from '@shared/types'

export function PracticePanel({
  initialTarget = '',
  settings,
  history,
  overlay,
  onHistory
}: {
  initialTarget?: string
  settings: AppSettings
  history: HistoryItem[]
  overlay: OverlayState
  onHistory: () => void
}) {
  const [target, setTarget] = useState(initialTarget)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = ['listening', 'transcribing', 'inserting'].includes(overlay.status)
  const otherRecording = active && overlay.mode !== 'practice'
  const takes = history.filter((row) => row.source === 'practice')
  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record practice take.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="panel-head">
        <div>
          <span className="eyebrow">Give your voice a reference</span>
          <h2>A little practice.</h2>
          <p>Record a word. Compare what was heard. Keep the intended text.</p>
        </div>
        <span className="subtle-tag">No typing into other apps</span>
      </div>
      {otherRecording && (
        <p className="notice">
          A dictation session is active. Finish it before recording a practice take.
        </p>
      )}
      <section className="block practice-card">
        <span className="eyebrow">01 / CHOOSE A WORD OR SHORT PHRASE</span>
        <div className="field">
          <label htmlFor="practice-target">What will you say?</label>
          <input
            id="practice-target"
            disabled={active}
            maxLength={200}
            placeholder={
              settings.displayName
                ? `${settings.displayName} is joining the call.`
                : 'A name, word, or short phrase you use often.'
            }
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        {settings.vocabulary.length > 0 && (
          <div className="picks">
            {settings.vocabulary
              .filter((row) => row.enabled)
              .slice(0, 12)
              .map((row) => (
                <button key={row.id} disabled={active} onClick={() => setTarget(row.meant)}>
                  {row.meant}
                </button>
              ))}
          </div>
        )}
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            disabled={active}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            Save this take's audio on my device with the intended text above. Audio expires after{' '}
            {settings.audioRetentionDays} days unless I export it. My selected speech provider
            receives the audio for recognition.
          </span>
        </label>
        <div className="practice-stage">
          <span className="practice-symbol" aria-hidden="true">
            ≋
          </span>
          <h3>
            {active ? 'Speak your phrase naturally.' : target || 'Start with a name you use often.'}
          </h3>
          <p>
            {active
              ? overlay.partial || 'Waiting for recognition…'
              : 'One clear phrase is enough. Record a few variations in your normal voice.'}
          </p>
          <button
            className="primary"
            disabled={busy || otherRecording || (!active && (!consent || !target.trim()))}
            onClick={() =>
              void act(() =>
                active ? window.s2t.stopRecording() : window.s2t.startPractice(target)
              )
            }
          >
            {busy ? 'Working…' : active ? 'Stop & save labeled take' : 'Record practice take'}
          </button>
          {active && (
            <button className="ghost" onClick={() => void act(() => window.s2t.cancelRecording())}>
              Cancel
            </button>
          )}
        </div>
        {error && (
          <p className="status-bad" role="alert">
            {error}
          </p>
        )}
        {overlay.status === 'error' && (
          <p className="status-bad" role="alert">
            {overlay.message}
          </p>
        )}
      </section>
      <div className="section-heading">
        <h3>Your recent practice</h3>
        <button className="text-button" onClick={onHistory}>
          Review & export in History →
        </button>
      </div>
      {takes.length ? (
        <div className="practice-takes">
          {takes.slice(0, 8).map((take) => (
            <article className="card" key={take.id}>
              <div className="card-head">
                <span className="session-time">{new Date(take.createdAt).toLocaleString()}</span>
                <span className="session-badge">
                  {take.status === 'complete' ? 'Labeled take' : take.status}
                </span>
              </div>
              <h3>{take.practiceTarget ?? take.text}</h3>
              <p className="micro">
                <strong>Recognized:</strong> {take.rawText || 'No finalized text yet.'}
              </p>
              <p className="micro">
                {take.hasAudio ? 'Audio retained on this device.' : 'No retained audio.'}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="micro">No practice takes yet. Your first labeled example starts above.</p>
      )}
      <section className="training-note">
        <h3>Examples today. Measured adaptation next.</h3>
        <p>
          These takes create an audio-and-text dataset. They do not retrain your recognizer. Correct
          mistakes and export examples from History. Vocabulary rules improve specific recurring
          words; acoustic learning requires a compatible model and a held-out evaluation set.
        </p>
      </section>
    </>
  )
}
