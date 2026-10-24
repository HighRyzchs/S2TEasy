import { useEffect, useState } from 'react'
import { normalizeDisplayName, type AppSettings } from '@shared/types'
import { UpdatePanel } from '../../UpdatePanel'
import { errorMessage, useApp } from '../context'
import { Section, useSave } from './controls'

const APPEARANCES: { id: AppSettings['appearance']; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' }
]

export function AppSection() {
  const { settings, update, save, setUpdate, replayTour, version } = useApp()
  const quickSave = useSave()
  return (
    <Section id="app" title="App & updates" intro={`S2Teasy ${version || update.currentVersion}`}>
      <div className="set-lines">
        <div className="line">
          <span id="appearance-label">Appearance</span>
          <div className="seg" role="group" aria-labelledby="appearance-label">
            {APPEARANCES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={settings.appearance === id}
                onClick={() => quickSave({ appearance: id })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <NameLine name={settings.displayName} onSave={(displayName) => save({ displayName })} />
        <div className="line">
          <span>
            <span>Welcome tour</span>
            <span className="hint">A quick walk through the shortcut and the HUD.</span>
          </span>
          <button type="button" className="btn" onClick={replayTour}>
            Replay the tour
          </button>
        </div>
        <div className="line">
          <span>
            <span>Support S2Teasy</span>
            <span className="hint">Free and open source. A coffee keeps it going. Opens in your browser.</span>
          </span>
          <a className="btn" href="https://ko-fi.com/rozniman" target="_blank" rel="noreferrer">
            Support on Ko-fi
          </a>
        </div>
      </div>
      <UpdatePanel
        onGetDiagnostics={() => window.s2t.getUpdateDiagnostics()}
        onCopyReport={(text) => window.s2t.copyHistory(text)}
        onOpenInstaller={() => window.s2t.openUpdateInstaller()}
        onDiagnostics={() => window.s2t.openUpdateDiagnostics()}
        update={update}
        autoDownload={settings.autoUpdate}
        onAutoDownload={(autoUpdate) => quickSave({ autoUpdate })}
        onUpdate={setUpdate}
        onCheck={(download) => window.s2t.checkUpdate(download)}
        onInstall={() => window.s2t.installUpdate()}
      />
    </Section>
  )
}

function NameLine({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [draft, setDraft] = useState(name)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => setDraft(name), [name])
  const clean = normalizeDisplayName(draft)
  return (
    <form
      className="line set-name"
      onSubmit={(event) => {
        event.preventDefault()
        setBusy(true)
        setMessage('')
        onSave(clean)
          .then(() => {
            setFailed(false)
            setMessage('Saved on this device.')
          })
          .catch((e) => {
            setFailed(true)
            setMessage(errorMessage(e))
          })
          .finally(() => setBusy(false))
      }}
    >
      <span>
        <label htmlFor="profile-name">Your name</label>
        <span className="hint">
          Optional. Used in greetings, stored on this PC, and not sent to speech providers.
        </span>
      </span>
      <span className="set-name-controls">
        <input
          id="profile-name"
          className="input"
          autoComplete="off"
          maxLength={120}
          placeholder="Name, nickname or handle"
          value={draft}
          onChange={(e) => {
            setDraft(Array.from(e.target.value).slice(0, 60).join(''))
            setMessage('')
          }}
        />
        <button type="submit" className="btn" disabled={busy || clean === name}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </span>
      {message && (
        <span className={failed ? 'set-error' : 'hint'} role={failed ? 'alert' : 'status'}>
          {message}
        </span>
      )}
    </form>
  )
}
