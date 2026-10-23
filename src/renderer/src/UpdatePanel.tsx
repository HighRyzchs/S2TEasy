import { useState } from 'react'
import type { UpdateStatus } from '@shared/types'
import './update-panel.css'

export function UpdatePanel({
  update,
  autoDownload,
  onAutoDownload,
  onUpdate,
  onCheck,
  onInstall,
  onOpenInstaller,
  onDiagnostics,
  onGetDiagnostics,
  onCopyReport
}: {
  update: UpdateStatus
  autoDownload: boolean
  onAutoDownload: (enabled: boolean) => void
  onUpdate: (status: UpdateStatus) => void
  onCheck: (download?: boolean) => Promise<UpdateStatus>
  onInstall: () => Promise<UpdateStatus>
  onOpenInstaller?: () => Promise<UpdateStatus>
  onDiagnostics?: () => Promise<void>
  onGetDiagnostics?: () => Promise<string>
  onCopyReport?: (text: string) => Promise<boolean>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState('')
  const [copied, setCopied] = useState(false)
  const applying = update.phase === 'applying'
  const checking = update.phase === 'checking'
  const downloading = update.phase === 'downloading'
  const run = async (action: () => Promise<UpdateStatus>) => {
    setPending(true)
    setError('')
    try {
      onUpdate(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not complete the update. Try again.')
    } finally {
      setPending(false)
    }
  }
  const kind =
    update.packaging === 'dev'
      ? 'development mode'
      : update.packaging === 'portable'
        ? 'portable app'
        : 'installed app'
  const busy = pending || checking || downloading || applying
  return (
    <section className="update-panel" aria-label="App updates">
      <div className="line update-row">
        <span>
          <span>Version {update.currentVersion}</span>
          <span className="hint">
            {kind}
            {update.phase === 'current' ? ' · up to date' : ''}
          </span>
        </span>
        <span className="update-buttons">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void run(() => onCheck())}
          >
            {checking ? 'Checking…' : 'Check now'}
          </button>
        </span>
      </div>
      {update.phase === 'available' && (
        <div className="update-callout">
          <div>
            <strong>Version {update.availableVersion} is available.</strong>
            <p className="hint">Download it now. Restart when you’re ready.</p>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={pending || update.packaging === 'dev'}
            onClick={() => void run(() => onCheck(true))}
          >
            Download update
          </button>
        </div>
      )}
      {downloading && (
        <div className="update-callout update-download">
          <div className="update-download-head">
            <strong>Downloading version {update.availableVersion}</strong>
            <span className="mono">{update.percent}%</span>
          </div>
          <progress aria-label="Update download progress" max={100} value={update.percent} />
          <p className="hint">You can keep working while this downloads.</p>
        </div>
      )}
      {update.phase === 'ready' && (
        <div className="update-callout">
          <div>
            <strong>Your update is ready.</strong>
            <p className="hint">Version {update.availableVersion} · checksum verified</p>
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={pending}
            onClick={() => void run(onInstall)}
          >
            Restart &amp; install
          </button>
        </div>
      )}
      {update.message && !['available', 'ready', 'downloading'].includes(update.phase) && (
        <p className={update.phase === 'error' ? 'update-error' : 'update-message'} role="status">
          {update.message}
        </p>
      )}
      {error && (
        <p className="update-error" role="alert">
          {error}
        </p>
      )}
      <label className="line update-auto">
        <span>
          <span>Download updates automatically</span>
          <span className="hint">A restart is always your choice.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Download updates automatically"
          checked={autoDownload}
          disabled={pending || applying}
          onChange={(e) => onAutoDownload(e.target.checked)}
        />
      </label>
      <div className="update-buttons update-tools">
        {onGetDiagnostics && update.packaging !== 'dev' && (
          <button
            type="button"
            className="btn small"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                setReport(await onGetDiagnostics())
                setCopied(false)
                return update
              })
            }
          >
            View update report
          </button>
        )}
        {update.canOpenInstaller && onOpenInstaller && (
          <button
            type="button"
            className="btn small"
            disabled={pending || applying}
            onClick={() => void run(onOpenInstaller)}
          >
            Open downloaded installer
          </button>
        )}
        {update.packaging !== 'dev' && onDiagnostics && (
          <button
            type="button"
            className="link"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                await onDiagnostics()
                return update
              })
            }
          >
            Open update diagnostics
          </button>
        )}
      </div>
      {report && (
        <details open className="update-report">
          <summary>Local update report</summary>
          <p className="hint">
            No report is uploaded. Review Windows usernames and paths before sharing.
          </p>
          <pre className="mono">{report}</pre>
          {onCopyReport && (
            <button
              type="button"
              className="btn small"
              onClick={() =>
                void run(async () => {
                  if (!(await onCopyReport(report))) throw new Error('Could not copy the report.')
                  setCopied(true)
                  return update
                })
              }
            >
              {copied ? 'Report copied' : 'Copy update report'}
            </button>
          )}
        </details>
      )}
      <p className="hint">
        Updates come from this project’s GitHub Releases. Downloads are verified before
        installation.
        {update.packaging === 'dev'
          ? ' Installation is available only in packaged Windows builds.'
          : ''}
      </p>
    </section>
  )
}
