import { useEffect, useState } from 'react'
import { formatMoney } from './chart'

/** This month's spend, with an optional limit that pauses paid extras (never speech). */
export function MonthCard({
  month,
  monthName,
  limit,
  onLimit
}: {
  month: number
  monthName: string
  limit: number
  onLimit: (limit: number) => void
}) {
  const [text, setText] = useState(limit ? String(limit) : '')
  useEffect(() => setText(limit ? String(limit) : ''), [limit])
  const commit = () => {
    const parsed = text.trim() === '' ? 0 : Number(text)
    if (!Number.isFinite(parsed) || parsed < 0) return setText(limit ? String(limit) : '')
    const next = Math.min(10_000, Math.round(parsed * 100) / 100)
    if (next !== limit) onLimit(next)
  }
  const share = limit > 0 ? Math.min(1, month / limit) : 0
  const reached = limit > 0 && month >= limit
  return (
    <section className="card month" aria-labelledby="month-h">
      <div className="month-row">
        <div>
          <h2 id="month-h">This month</h2>
          <span className="hint">{monthName}, all requests with a reported price</span>
        </div>
        <strong className="mono month-value">
          {formatMoney(month)}
          {limit > 0 && <span className="faint"> of {formatMoney(limit)}</span>}
        </strong>
      </div>
      {limit > 0 && (
        <div
          className={`month-meter${reached ? ' reached' : ''}`}
          role="meter"
          aria-label="Share of monthly limit used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
        >
          <i style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <div className="month-row">
        <span className="hint">
          {reached
            ? 'Limit reached. Speech cues are paused until next month; dictation keeps working.'
            : 'At the limit, paid extras like speech cues pause. Dictation itself never stops.'}
        </span>
        <label className="month-limit">
          <span>Monthly limit, $</span>
          <input
            className="input mono"
            type="number"
            min={0}
            step={1}
            placeholder="None"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && commit()}
          />
        </label>
      </div>
    </section>
  )
}
