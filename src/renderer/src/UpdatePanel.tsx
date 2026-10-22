import { useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import './update-panel.css'

export function UpdatePanel({
  update,
  autoDownload,
  onAutoDownload,
  onUpdate,
  onCheck,
  onInstall
}: {
  update: UpdateStatus
  autoDownload: boolean
  onAutoDownload: (enabled: boolean) => void
  onUpdate: (status: UpdateStatus) => void
  onCheck: (download?: boolean) => Promise<UpdateStatus>
  onInstall: () => Promise<UpdateStatus>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const applying = update.phase === 'applying'
  const checking = update.phase === 'checking'
  const downloading = update.phase === 'downloading'
  const run = async (action: () => Promise<UpdateStatus>) => {
    setPending(true)
    setError('')
    try {
      onUpdate(await action())
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not complete the update. Try again.'
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="block update-panel" aria-label="App updates">
      <div className="update-panel-heading">
        <div>
          <span className="update-eyebrow">ALWAYS A LITTLE BETTER</span>
          <h3>Updates, without the hassle.</h3>
          <p>
            S2Teasy {update.currentVersion} ·{' '}
            {update.packaging === 'dev'
              ? 'development mode'
              : update.packaging === 'portable'
                ? 'portable app'
                : 'installed app'}
          </p>
        </div>
        <span className="update-version">v{update.currentVersion}</span>
      </div>
      {update.phase === 'available' && (
        <div className="update-available">
          <span className="update-spark" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </span>
          <div>
            <strong>Version {update.availableVersion} is available.</strong>
            <p>Download it now. Restart when you’re ready.</p>
          </div>
          <button
            className="primary"
            disabled={pending || update.packaging === 'dev'}
            onClick={() => void run(() => onCheck(true))}
          >
            Download update
          </button>
        </div>
      )}
      {downloading && (
        <div className="update-download">
          <div>
            <strong>Downloading version {update.availableVersion}</strong>
            <span>{update.percent}%</span>
          </div>
          <progress
            aria-label="Update download progress"
            max={100}
            value={update.percent}
          />
          <p>You can keep working while this downloads.</p>
        </div>
      )}
      {update.phase === 'ready' && (
        <div className="update-available">
          <span className="update-spark" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>
          </span>
          <div>
            <strong>Your update is ready.</strong>
            <p>Version {update.availableVersion} · checksum verified</p>
          </div>
          <button
            className="primary"
            disabled={pending}
            onClick={() => void run(onInstall)}
          >
            Restart &amp; install
          </button>
        </div>
      )}
      {update.message &&
        !['available', 'ready', 'downloading'].includes(update.phase) && (
          <p
            className={
              update.phase === 'error' ? 'update-error' : 'update-message'
            }
            role="status"
          >
            {update.message}
          </p>
        )}
      {error && (
        <p className="update-error" role="alert">
          {error}
        </p>
      )}
      <div className="update-panel-footer">
        <button
          className="ghost"
          disabled={pending || checking || downloading || applying}
          onClick={() => void run(() => onCheck())}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
        <label>
          Download automatically
          <button
            type="button"
            role="switch"
            aria-label="Download updates automatically"
            aria-checked={autoDownload}
            className={autoDownload ? 'update-switch enabled' : 'update-switch'}
            disabled={pending || applying}
            onClick={() => onAutoDownload(!autoDownload)}
          >
            <i />
          </button>
        </label>
      </div>
      <p className="update-fine">
        Updates come from this project’s GitHub Releases. Downloads are verified
        before installation. A restart is always your choice.
        {update.packaging === 'dev'
          ? ' Installation is available only in packaged Windows builds.'
          : ''}
      </p>
    </section>
  )
}
