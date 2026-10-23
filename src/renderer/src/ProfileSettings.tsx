import { useEffect, useState } from 'react'
import { normalizeDisplayName } from '@shared/types'
export function ProfileSettings({
  displayName,
  onSave,
  onReplay,
  onRestoreChecklist
}: {
  displayName: string
  onSave: (name: string) => Promise<void>
  onReplay: () => void
  onRestoreChecklist: () => Promise<void>
}) {
  const [name, setName] = useState(displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    setName(displayName)
  }, [displayName])
  return (
    <>
      <section className="block">
        <h3>A little more you.</h3>
        <p className="hint">
          A real name, nickname, or handle—whatever you prefer. This is stored locally and isn’t
          automatically sent to speech providers.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            setSaved(false)
            void onSave(normalizeDisplayName(name))
              .then(() => setSaved(true))
              .catch((e) => setError(e instanceof Error ? e.message : 'Could not save your name.'))
              .finally(() => setBusy(false))
          }}
        >
          <div className="field">
            <label htmlFor="profile-name">What should we call you?</label>
            <input
              id="profile-name"
              autoComplete="off"
              maxLength={120}
              placeholder="A name, nickname, or handle"
              value={name}
              onChange={(e) => {
                setName(Array.from(e.target.value).slice(0, 60).join(''))
                setSaved(false)
              }}
            />
            <p className="hint">Optional · up to 60 characters. Clear it for a neutral greeting.</p>
          </div>
          <button className="primary" disabled={busy || normalizeDisplayName(name) === displayName}>
            {busy ? 'Saving…' : 'Save name'}
          </button>
          {saved && (
            <p role="status" className="hint">
              Your name is saved on this device.
            </p>
          )}
          {error && (
            <p role="alert" className="status-bad">
              {error}
            </p>
          )}
        </form>
      </section>
      <section className="block">
        <h3>A fresh look around.</h3>
        <p className="hint">
          Revisit the welcome tour, your recording shortcut, and the HUD controls whenever you like.
        </p>
        <div className="inline">
          <button className="ghost" onClick={onReplay}>
            Replay welcome tour
          </button>
          <button
            className="ghost"
            disabled={busy}
            onClick={() => {
              setError('')
              void onRestoreChecklist()
                .then(() => setRestored(true))
                .catch((e) =>
                  setError(e instanceof Error ? e.message : 'Could not restore checklist.')
                )
            }}
          >
            Show getting-started checklist
          </button>
        </div>
        {restored && (
          <p role="status" className="hint">
            The getting-started checklist is ready on Overview.
          </p>
        )}
      </section>
    </>
  )
}
