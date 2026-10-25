import { useCallback, useEffect, useState } from 'react'
import { formatCredit, formatPrice, type CloudStatus } from '@shared/cloud'
import { cloudUrlOf } from '@shared/constants'
import { errorMessage, useApp } from '../context'
import { useSave } from './controls'

const KIND: Record<string, string> = {
  trial: 'Welcome credit',
  topup: 'Top-up',
  promo: 'Promo code',
  transcription: 'Dictation',
  refund: 'Refund',
  grant: 'Credit from S2Teasy'
}

/** S2Teasy Cloud: sign in with Google, see the balance, top up, redeem a code. No keys anywhere. */
export function CloudPanel() {
  const { settings } = useApp()
  const quickSave = useSave()
  const [status, setStatus] = useState<CloudStatus | null>(null)
  const [busy, setBusy] = useState<'' | 'sign-in' | 'buy' | 'redeem' | 'sign-out'>('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState(settings.cloudUrl)
  const configured = !!cloudUrlOf(settings.cloudUrl)

  const refresh = useCallback(async () => {
    if (!configured) return
    try {
      setStatus(await window.s2t.cloudStatus())
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [configured])
  useEffect(() => {
    void refresh()
  }, [refresh, settings.cloudEmail])
  // A top-up lands while you're on the payment page: look again when the window gets focus back.
  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const run = async (what: typeof busy, action: () => Promise<unknown>) => {
    setBusy(what)
    setError('')
    setNote('')
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  if (!configured)
    return (
      <div className="cloud">
        <p className="cloud-lead">
          <strong>S2Teasy Cloud is coming soon.</strong> No accounts with speech providers, no keys: sign in with Google,
          top up, and talk. Until then, pick one of the other engines.
        </p>
        <details className="cloud-adv">
          <summary>Test a Cloud server</summary>
          <div className="cloud-row">
            <input
              className="input mono"
              value={address}
              placeholder="https://s2teasy-cloud.example.workers.dev"
              aria-label="Cloud address"
              onChange={(e) => setAddress(e.target.value)}
            />
            <button type="button" className="btn" onClick={() => quickSave({ cloudUrl: address.trim() })}>
              Use it
            </button>
          </div>
        </details>
      </div>
    )

  if (!status?.signedIn)
    return (
      <div className="cloud">
        <p className="cloud-lead">
          No keys and nothing to set up. Sign in with Google, get <strong>30 free minutes</strong>, then top up only
          if you like it. Your words are not stored on the server.
        </p>
        <div className="cloud-row">
          <button
            type="button"
            className="btn primary"
            disabled={busy === 'sign-in'}
            onClick={() => void run('sign-in', async () => setStatus(await window.s2t.cloudSignIn()))}
          >
            {busy === 'sign-in' ? 'Finish signing in in your browser…' : 'Sign in with Google'}
          </button>
          {busy === 'sign-in' && (
            <button type="button" className="btn" onClick={() => void window.s2t.cloudCancelSignIn()}>
              Cancel
            </button>
          )}
        </div>
        {error && (
          <p className="set-error" role="alert">
            {error}
          </p>
        )}
      </div>
    )

  const hours = status.balanceSeconds / 3600
  return (
    <div className="cloud">
      <div className="cloud-balance">
        <span className="dim">Credit left</span>
        <strong className={hours < 0.25 ? 'low' : ''}>{formatCredit(status.balanceSeconds)}</strong>
        <span className="dim">of dictation · {status.email}</span>
      </div>

      <div className="cloud-packs" role="group" aria-label="Top up">
        {status.packs.map((pack) => (
          <button
            key={pack.id}
            type="button"
            className="cloud-pack"
            disabled={!!busy}
            onClick={() =>
              void run('buy', async () => {
                await window.s2t.cloudBuy(pack.id)
                setNote('The payment page opened in your browser. Your credit appears here once it is paid.')
              })
            }
          >
            <strong>{pack.name}</strong>
            <span>{formatPrice(pack.cents)}</span>
            <span className="dim">{formatPrice(Math.round(pack.cents / pack.hours))} an hour</span>
          </button>
        ))}
      </div>

      <div className="cloud-row">
        <input
          className="input mono"
          value={code}
          placeholder="Promo code"
          aria-label="Promo code"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.form?.requestSubmit()
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={!code.trim() || !!busy}
          onClick={() =>
            void run('redeem', async () => {
              const result = await window.s2t.cloudRedeem(code.trim())
              setCode('')
              setNote(`Added ${formatCredit(result.seconds)} of dictation.`)
              await refresh()
            })
          }
        >
          Redeem
        </button>
      </div>
      {note && <p className="cloud-note">{note}</p>}
      {error && (
        <p className="set-error" role="alert">
          {error}
        </p>
      )}

      {status.recent.length > 0 && (
        <details className="cloud-adv">
          <summary>Recent activity</summary>
          <ul className="cloud-ledger">
            {status.recent.slice(0, 12).map((row, i) => (
              <li key={i}>
                <span>{KIND[row.kind] ?? row.kind}</span>
                <span className="dim">{new Date(row.at * 1000).toLocaleString()}</span>
                <span className={row.seconds < 0 ? 'dim' : 'plus'}>
                  {row.seconds < 0 ? '−' : '+'}
                  {formatCredit(Math.abs(row.seconds))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="cloud-adv">
        <summary>How pricing works</summary>
        <p className="hint">
          You buy hours of dictation up front; each recording uses its length in seconds (at least one). Nothing renews
          and nothing is charged by itself. Speech goes to Groq (Whisper Large v3 Turbo) and is not kept by S2Teasy.
          Speech tidy, voice commands and your personal words run on this PC and are free.
        </p>
      </details>
      <div className="cloud-row">
        <button type="button" className="btn" disabled={!!busy} onClick={() => void run('sign-out', () => window.s2t.cloudSignOut(false))}>
          Sign out
        </button>
        <button type="button" className="btn ghost" disabled={!!busy} onClick={() => void run('sign-out', () => window.s2t.cloudSignOut(true))}>
          Sign out on every device
        </button>
      </div>
    </div>
  )
}
